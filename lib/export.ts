/**
 * Encounter CSV export — pure row/CSV builders (no React Native, no Supabase).
 *
 * One row per encounter, with the owning patient's demographics inlined and
 * signed Storage links for any photos / auscultation recordings attached to
 * that visit. Platform delivery (web download / native share sheet) lives in
 * lib/exportCsv.ts; keeping this module pure makes it unit-testable.
 */
import { AUTO_FEATURES, ENTRY_FEATURES, FAST_JOINTS, fastResult, isFast } from './arfFast';
import { BPG_LABEL, DX_LABEL, ENCOUNTER_TYPE_LABEL, capitalize } from './format';
import { calcLevelA, calcLevelB, JOINT_DEFS } from './scoring';
import { CARE_BPG_LABEL, FAST31_JOINTS, fast31Result, isFast31 } from './arfFast31';
import {
  BASIS_LABEL, CLASSIFICATION_LABEL, ECG_STATUS_LABEL, ECHO_STATUS_LABEL, EPISODE_LABEL,
  MICRO_LABEL, PAIRED_RISE_LABEL, VALVE_LABEL,
} from './partB';
import { emptyInputs, formatAge, type Clinic, type Encounter, type Patient, type AudioRecord, type PhotoRecord } from './types';

/** Column header + cell values for the encounters sheet. */
export type CsvRow = string[];

/** Signed-URL lookup keyed by PhotoRecord.id / AudioRecord.id (empty = unavailable). */
export type MediaUrls = Record<string, string>;

export const ENCOUNTER_EXPORT_COLUMNS = [
  // Patient block
  'Referral Code', 'MRN', 'First Name', 'Last Name', 'Date of Birth', 'Age', 'Gender', 'Setting',
  'Phone 1', 'Phone 2', 'Clinic', 'Patient Registered',
  // Encounter block
  'Encounter Type', 'Encounter Date', 'Level A Score', 'Level B Score', 'Total Score', 'Risk Tier', 'Score Range', 'Recommended Actions', 'Facility',
  // Assessment criteria block (encounter.inputs — the selections behind the
  // score; blank on follow-ups that didn't re-score)
  'Fever', 'Chorea Reported', 'Chorea Positive', 'Alternative Cause', 'History of ARF',
  'Joint Finding', 'Heart Murmur', 'Murmur Severity', 'Erythema Marginatum', 'Subcutaneous Nodules',
  'No Alternative Dx', 'Blood Labs N/A', 'ECG N/A', 'Echo N/A',
  'WBC Raised', 'ESR/CRP Raised', 'ASO Raised', 'Anti-DNase B Raised', 'Prolonged PR', 'Echo Suggestive',
  'Fever Duration', 'Includes Level B',
  // Outcome block (filled when a follow-up / outcome was recorded)
  'Confirmed Dx', 'Final Dx', 'BPG Status', 'Echo Findings', 'Complications', 'Notes', 'Referred To',
  'Signed By', 'Signed At', 'Recorded At',
  // Media block (signed Storage links; expire after EXPORT_LINK_EXPIRY_SECONDS)
  'Photo Links', 'Audio Links',
  'Assessment Version', 'ARF-FAST Result', 'ARF-FAST Result Method', 'Combined Interpretation',
  ...ENTRY_FEATURES.map(f => `Entry: ${f.label}`),
  'Entry Reviewed', 'Urgent Needs Acknowledged', 'Automatic Features Reviewed',
  ...AUTO_FEATURES.map(f => `Automatic: ${f.label}`),
  'ARF-FAST Joint Finding', 'Measured Fever ≥38°C', 'First-Degree Family History', 'Documented Previous ARF/RHD',
  // Version-3 block (ARF-FAST v3.1 + Part B). Blank on v1/v2 rows; the v3
  // screening reuses the shared Entry/Automatic columns above where the
  // question is the same, so a mixed-version sheet stays readable.
  'Study ID',
  'v3: Significant Breathlessness', 'v3: Orthopnea', 'v3: Edema', 'v3: Marked Activity Reduction',
  'v3: Chorea — Episodes Only With Loss of Awareness', 'v3: Murmur — Previously Documented Innocent',
  'v3: Migratory Polyarthritis', 'v3: Erythema Marginatum', 'v3: Subcutaneous Nodules',
  'v3: Family History (raw)', 'v3: Previous ARF/RHD (raw)',
  'Care: BPG', 'Care: Referred', 'Care: Other Action', 'Care: Action At', 'Care: Provider', 'Care: Facility', 'Care: Recorded At',
  'Screening Amendments',
  'Part B: ESR (mm/hour)', 'Part B: CRP', 'Part B: CRP Unit',
  'Part B: ASO Value', 'Part B: ASO Unit', 'Part B: ASO Upper Limit', 'Part B: ASO Paired Rise',
  'Part B: Anti-DNase B Value', 'Part B: Anti-DNase B Unit', 'Part B: Anti-DNase B Upper Limit', 'Part B: Anti-DNase B Paired Rise',
  'Part B: Throat Culture', 'Part B: Rapid GAS Antigen',
  'Part B: ECG Status', 'Part B: PR Interval (ms)', 'Part B: PR Prolonged for Age',
  'Part B: Echo', 'Part B: Pathological Mitral Regurgitation', 'Part B: Pathological Aortic Regurgitation', 'Part B: Echo Other Finding', 'Part B: Other Investigations',
  'Part B: Diagnostic Assessment Completed', 'Part B: Not Completed Reason', 'Part B: Study Reference Classification',
  'Part B: Diagnostic Basis', 'Part B: Episode', 'Part B: Treating-Team Diagnosis', 'Part B: Unable-to-Classify Reason',
  'Part B: Saved At', 'Part B: Saved By',
] as const;

export interface EncounterExportInput {
  patients: Patient[];
  encounters: Encounter[];
  clinics: Clinic[];
  photos?: PhotoRecord[];
  audio?: AudioRecord[];
  photoUrls?: MediaUrls;
  audioUrls?: MediaUrls;
}


function linksFor(records: { id: string }[], urls: MediaUrls | undefined): string {
  if (!urls) return '';
  return records.map((r) => urls[r.id]).filter(Boolean).join(' ; ');
}


const JOINT_LABEL: Record<number, string> = Object.fromEntries(
  JOINT_DEFS.map((j) => [j.points, j.label ?? '']),
) as Record<number, string>;
const FEVER_DURATION_LABEL: Record<string, string> = {
  '': '', none: 'None', under2w: 'Under 2 weeks', over2w: 'Over 2 weeks',
};

function triState(value: boolean | null | undefined): string {
  return value == null ? '' : value ? 'Yes' : 'No';
}
function tick(checked: boolean): string {
  return checked ? 'Yes' : '';
}

/** Level A / Level B subtotals, recomputed from the stored inputs exactly as
 *  the wizard scored them (Level B counts only when the encounter includes
 *  Level B — commit(false) persists score = Level A alone). Blank when the
 *  encounter was never scored (follow-ups) or the stored inputs are too
 *  legacy/partial to score (NaN guard). */
function levelScoreCells(e: Encounter): [string, string] {
  if (!e.inputs) return ['', ''];
  // v3 has no Level B; the Part B record never feeds a score.
  if (isFast31(e.inputs)) {
    const a = fast31Result(e.inputs).scoreA;
    return [a !== null && Number.isFinite(a) ? String(a) : '', ''];
  }
  const a = isFast(e.inputs) ? fastResult(e.inputs).scoreA : calcLevelA(e.inputs);
  const b = e.includesLevelB ? (isFast(e.inputs) ? fastResult(e.inputs, true).scoreB : calcLevelB(e.inputs)) : null;
  return [
    a !== null && Number.isFinite(a) ? String(a) : '',
    b !== null && Number.isFinite(b) ? String(b) : '',
  ];
}

/** The 22 assessment-criteria cells (encounter.inputs). Level A + Level B. */
function criteriaCells(e: Encounter): string[] {
  const s = e.inputs ?? emptyInputs();
  const legacy = !isFast(e.inputs);
  return [
    legacy ? triState(s.fever) : '',
    legacy ? triState(s.chorea) : '',
    legacy ? tick(s.choreaPositive) : '',
    legacy ? triState(s.altCause) : '',
    legacy ? triState(s.historyArf) : '',
    legacy ? JOINT_LABEL[s.joint] ?? '' : '',
    legacy ? tick(s.murmur) : '',
    legacy ? [s.sob ? 'SOB' : '', s.edema ? 'Edema' : ''].filter(Boolean).join(', ') : '',
    legacy ? tick(s.em) : '',
    legacy ? tick(s.sn) : '',
    legacy ? tick(s.noad) : '',
    tick(s.naBlood),
    tick(s.naEcg),
    tick(s.naEcho),
    tick(s.wbc),
    tick(s.esr),
    tick(s.aso),
    tick(s.antidnase),
    tick(s.pr),
    tick(s.echo === 'suggestive'),
    FEVER_DURATION_LABEL[s.feverDuration] ?? '',
    e.includesLevelB ? 'Yes' : 'No',
  ];
}


function versionCells(e: Encounter): string[] {
  const s = e.inputs;
  const count = 4 + ENTRY_FEATURES.length + 3 + AUTO_FEATURES.length + 4;
  if (!s) return Array(count).fill('');
  if (!isFast(s)) return [String(s.assessmentVersion ?? 1), ...Array(count - 1).fill('')];
  if (isFast31(s)) {
    const f = s.arfFast31;
    const result = fast31Result(s);
    // The shared Automatic columns carry the QUALIFYING booleans (definition
    // met, carve-outs applied); the raw sub-findings follow in v3Cells.
    const qualifying: Record<string, boolean> = {
      chorea: !!f?.chorea && f?.choreaEpisodicBlackout === false,
      murmur: !!f?.murmur && f?.murmurDocumentedInnocent !== true,
      carditis: f?.breathlessness === true && (f?.orthopnea === true || f?.edema === true || f?.activityReduction === true),
      skin: !!f?.em || !!f?.sn,
      arthritis: !!f?.migratoryArthritis,
    };
    const tri = (v: string | null | undefined) => v == null ? '' : capitalize(v);
    return ['3', result.label, result.method, '',
      ...ENTRY_FEATURES.map(k => triState(f?.entry?.[k.id])),
      triState(f?.entryReviewed), triState(f?.urgentAcknowledged), triState(f?.automaticReviewed),
      ...AUTO_FEATURES.map(k => qualifying[k.id] ? 'Yes' : 'No'),
      FAST31_JOINTS.find(j => j.id === f?.joint)?.name ?? '',
      triState(f?.measuredFever), tri(f?.familyHistory), tri(f?.previousArfRhd)];
  }
  const f = s.arfFast;
  const result = fastResult(s, e.includesLevelB);
  return ['2', result.label, result.method, result.combinedInterpretation ?? '',
    ...ENTRY_FEATURES.map(k => triState(f?.entry?.[k.id])),
    triState(f?.entryReviewed), triState(f?.urgentAcknowledged), triState(f?.automaticReviewed),
    ...AUTO_FEATURES.map(k => triState(f?.automatic?.[k.id])),
    FAST_JOINTS.find(j => j.id === f?.joint)?.name ?? '',
    triState(f?.measuredFever), triState(f?.familyHistory), triState(f?.previousArfRhd)];
}

/** Value / "Not done" / '' for a numeric investigation. */
function numericCell(done: boolean | null | undefined, value: string | undefined): string {
  if (done === false) return 'Not done';
  if (done === true && value?.trim()) return value.trim();
  return '';
}

/** The version-3 detail block. Blank on v1/v2 rows. Screening amendments
 *  serialize as field: before → after (by, date; reason) so the sheet shows
 *  the correction trail without a second sheet. */
function v3Cells(e: Encounter): string[] {
  const s = e.inputs;
  const blank = Array(50).fill('') as string[];
  if (!s || !isFast31(s)) return blank;
  const f = s.arfFast31!;
  const care = s.careRecord;
  const pb = s.partB;
  const inv = pb?.investigations;
  const dz = pb?.diagnosis;
  const tri = (v: boolean | null | undefined) => v == null ? '' : v ? 'Yes' : 'No';
  const amendments = (s.screeningAmendments ?? [])
    .map(a => `${a.field}: ${a.before} → ${a.after} (${a.by}, ${a.at.slice(0, 10)}; reason: ${a.reason})`)
    .join(' ; ');
  return [
    s.studyId ?? '',
    tri(f.breathlessness), tri(f.orthopnea), tri(f.edema), tri(f.activityReduction),
    tri(f.choreaEpisodicBlackout), tri(f.murmurDocumentedInnocent),
    f.migratoryArthritis ? 'Yes' : 'No', f.em ? 'Yes' : 'No', f.sn ? 'Yes' : 'No',
    f.familyHistory == null ? '' : capitalize(f.familyHistory),
    f.previousArfRhd == null ? '' : capitalize(f.previousArfRhd),
    care ? CARE_BPG_LABEL[care.bpgAction] : '',
    care ? (care.referred ? 'Yes' : 'No') : '',
    care?.otherAction ?? '',
    care?.actionAt ?? '',
    care?.provider ?? '',
    care?.facility ?? '',
    care?.recordedAt ?? '',
    amendments,
    numericCell(inv?.esrDone, inv?.esrValue),
    numericCell(inv?.crpDone, inv?.crpValue),
    inv?.crpUnit ?? '',
    numericCell(inv?.asoDone, inv?.asoValue),
    inv?.asoUnit ?? '',
    inv?.asoUpperLimit ?? '',
    inv?.asoPairedRise ? PAIRED_RISE_LABEL[inv.asoPairedRise] : '',
    numericCell(inv?.dnaseDone, inv?.dnaseValue),
    inv?.dnaseUnit ?? '',
    inv?.dnaseUpperLimit ?? '',
    inv?.dnasePairedRise ? PAIRED_RISE_LABEL[inv.dnasePairedRise] : '',
    inv ? MICRO_LABEL[inv.throatCulture] : '',
    inv ? MICRO_LABEL[inv.rapidGas] : '',
    inv ? ECG_STATUS_LABEL[inv.ecgStatus] : '',
    inv?.ecgPrMs ?? '',
    inv ? (inv.ecgProlongedForAge === 'yes' ? 'Yes' : inv.ecgProlongedForAge === 'no' ? 'No' : '') : '',
    inv ? ECHO_STATUS_LABEL[inv.echoStatus] : '',
    inv ? VALVE_LABEL[inv.echoMrPathological] : '',
    inv ? VALVE_LABEL[inv.echoArPathological] : '',
    inv?.echoOther ?? '',
    inv?.otherInvestigations ?? '',
    dz ? (dz.assessmentCompleted === 'yes' ? 'Yes' : dz.assessmentCompleted === 'no' ? 'No' : '') : '',
    dz?.notCompletedReason ?? '',
    dz ? CLASSIFICATION_LABEL[dz.classification] : '',
    dz ? BASIS_LABEL[dz.basis] : '',
    dz ? EPISODE_LABEL[dz.episode] : '',
    dz?.treatingTeamDx ?? '',
    dz?.unableReason ?? '',
    pb?.savedAt ?? '',
    pb?.savedBy ?? '',
  ];
}

/**
 * Flatten patients + encounters into export rows (header first). Inactive
 * patients/encounters and orphaned encounters (patient not in the input) are
 * dropped; rows are ordered newest encounter first (createdAt, ISO).
 */
export function buildEncounterExportRows(input: EncounterExportInput): CsvRow[] {
  const { patients, encounters, clinics, photos = [], audio = [], photoUrls = {}, audioUrls = {} } = input;

  const clinicName = new Map(clinics.map((c) => [c.id, c.name] as const));
  const photosByEncounter = new Map<string, PhotoRecord[]>();
  for (const p of photos) {
    if (!p.encounterId) continue;
    const list = photosByEncounter.get(p.encounterId);
    if (list) list.push(p);
    else photosByEncounter.set(p.encounterId, [p]);
  }
  const audioByEncounter = new Map<string, AudioRecord[]>();
  for (const a of audio) {
    if (!a.encounterId) continue;
    const list = audioByEncounter.get(a.encounterId);
    if (list) list.push(a);
    else audioByEncounter.set(a.encounterId, [a]);
  }

  const rows: CsvRow[] = [[...ENCOUNTER_EXPORT_COLUMNS]];

  const activePatients = patients.filter((p) => !p.inactive);
  const byId = new Map(activePatients.map((p) => [p.id, p] as const));
  const exportable = encounters
    .filter((e) => !e.inactive && byId.has(e.patientId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  for (const e of exportable) {
    const p = byId.get(e.patientId)!;
    rows.push([
      p.referralCode,
      p.mrn,
      p.firstName,
      p.lastName,
      p.dateOfBirth ?? '',
      formatAge(p.dateOfBirth, p.dobApproximate) ?? '',
      capitalize(p.gender),
      capitalize(p.setting),
      p.phone1,
      p.phone2,
      p.clinicId ? clinicName.get(p.clinicId) ?? p.clinicId : '',
      p.createdAt,
      ENCOUNTER_TYPE_LABEL[e.type],
      e.date,
      ...levelScoreCells(e),
      isFast(e.inputs) || e.score === null || e.score === undefined ? '' : String(e.score),
      isFast(e.inputs) ? '' : e.resultLabel ?? '',
      e.range ?? '',
      (e.actions ?? []).join(' ; '),
      e.facilityType ?? '',
      // criteria block — unset fields render blank; follow-ups without a
      // re-score have inputs === null so the whole block is blank
      ...criteriaCells(e),
      e.confirmedDx ? DX_LABEL[e.confirmedDx] : '',
      e.finalDx,
      e.bpgStatus ? BPG_LABEL[e.bpgStatus] : '',
      e.echoFindings,
      e.complications,
      e.notes,
      e.referredTo,
      e.signedBy ?? '',
      e.signedAt ?? '',
      e.createdAt,
      linksFor(photosByEncounter.get(e.id) ?? [], photoUrls),
      linksFor(audioByEncounter.get(e.id) ?? [], audioUrls),
      ...versionCells(e),
      ...v3Cells(e),
    ]);
  }
  return rows;
}

/** Quote a single CSV field per RFC 4180 (quotes doubled; comma/quote/CR/LF quoted). */
export function csvField(value: string): string {
  const needsQuotes = /[",\r\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

/**
 * Rows → CSV text. UTF-8 BOM so Excel decodes non-ASCII correctly, CRLF line
 * endings per RFC 4180. A leading `=` or `@` is neutralised with a `'` prefix
 * (CSV formula-injection guard; clinical free-text can start with either).
 */
export function toCsv(rows: CsvRow[]): string {
  // `String(cell ?? '')`: rows come from stored JSON (encounter.inputs etc.)
  // where legacy rows can lack keys — an undefined cell must render as an
  // empty field, not crash csvField.
  const lines = rows.map((row) =>
    row
      .map((cell) => String(cell ?? ''))
      .map((cell) => (/^[=@]/.test(cell) ? `'${cell}` : cell))
      .map(csvField)
      .join(','),
  );
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
