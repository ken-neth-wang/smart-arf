/**
 * Encounter CSV export — pure row/CSV builders (no React Native, no Supabase).
 *
 * One row per encounter, with the owning patient's demographics inlined and
 * signed Storage links for any photos / auscultation recordings attached to
 * that visit. Platform delivery (web download / native share sheet) lives in
 * lib/exportCsv.ts; keeping this module pure makes it unit-testable.
 */
import { BPG_LABEL, DX_LABEL, ENCOUNTER_TYPE_LABEL, capitalize } from './format';
import { calcLevelA, calcLevelB, JOINT_DEFS } from './scoring';
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
  const a = calcLevelA(e.inputs);
  const b = e.includesLevelB ? calcLevelB(e.inputs) : null;
  return [
    Number.isFinite(a) ? String(a) : '',
    b !== null && Number.isFinite(b) ? String(b) : '',
  ];
}

/** The 22 assessment-criteria cells (encounter.inputs). Level A + Level B. */
function criteriaCells(e: Encounter): string[] {
  const s = e.inputs ?? emptyInputs();
  return [
    triState(s.fever),
    triState(s.chorea),
    tick(s.choreaPositive),
    triState(s.altCause),
    triState(s.historyArf),
    JOINT_LABEL[s.joint] ?? '',
    tick(s.murmur),
    [s.sob ? 'SOB' : '', s.edema ? 'Edema' : ''].filter(Boolean).join(', '),
    tick(s.em),
    tick(s.sn),
    tick(s.noad),
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
      e.score === null || e.score === undefined ? '' : String(e.score),
      e.resultLabel ?? '',
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
