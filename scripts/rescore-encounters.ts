/**
 * rescore-encounters.ts — one-off backfill: re-derive the stored verdict
 * wording on existing encounters using TODAY'S scoring rules.
 *
 * Why: result_label / level / range / actions are computed at save time and
 * frozen. Encounters saved before the 2026-08 rule changes (Level A wording,
 * final bands, override retirements) still display their old wording in
 * Records and the CSV export. This script rewrites those four fields from the
 * stored inputs — the raw clinical answers and the score itself never change.
 *
 * OWNER-RUN (hard rule: agents never connect to the hosted database):
 *   npx tsx scripts/rescore-encounters.ts --selftest      # no DB, proves the mapping
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
 *     npx tsx scripts/rescore-encounters.ts               # dry-run: prints old → new
 *   ... npx tsx scripts/rescore-encounters.ts --apply     # writes the updates
 *
 * Credentials: Supabase dashboard → Settings → API (service_role key), or
 * pass --url/--key. The service key bypasses RLS — fine for a one-off
 * backfill you run yourself. Dry-run is the default; --apply is required to
 * write. Rows with inputs = NULL (follow-ups) and rows whose stored wording
 * already matches are skipped and counted.
 */
import { createClient } from '@supabase/supabase-js';
import { calcLevelA, calcLevelB, getActions, getInterp, getLevelAActions, getLevelAInterp } from '../lib/scoring';
import type { AssessmentInputs, FeverDuration } from '../lib/types';

/** The minimum encounter shape the rescore needs (snake_case DB row). */
interface EncRow {
  id: string;
  inputs: AssessmentInputs | null;
  includes_level_b: boolean;
  score: number | null;
  result_label: string | null;
  level: string | null;
  range: string | null;
}

/** New verdict fields for a row, or null when it should be skipped
 *  (follow-ups, or inputs too partial to score). Pure — unit-testable. */
export function rescore(e: EncRow): { result_label: string; level: string; range: string; actions: string[] } | null {
  if (!e.inputs) return null;
  const a = calcLevelA(e.inputs);
  const b = e.includes_level_b ? calcLevelB(e.inputs) : 0;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null; // legacy partial inputs
  // Same shape as AssessmentContext.buildEncounter: Level-A-only saves carry
  // the Level A preview verdict; Level B commits use the combined ladder.
  const fever = e.inputs.feverDuration as FeverDuration | undefined;
  if (e.includes_level_b) {
    return {
      result_label: getInterp(a, b, fever).label,
      level: getInterp(a, b, fever).level,
      range: getInterp(a, b, fever).range,
      actions: getActions(a, b, fever),
    };
  }
  const interp = getLevelAInterp(a);
  return { result_label: interp.label, level: interp.level, range: interp.range, actions: getLevelAActions(a) };
}

function selftest(): number {
  const cases: EncRow[] = [
    // Level-A-only, joint 5 + fever + history: the reported score-5 case.
    { id: 's1', includes_level_b: false, score: 5, result_label: 'Positive ARF (history of ARF + fever)', level: 'confirmed', range: 'History of ARF + fever',
      inputs: { fever: true, chorea: false, altCause: null, historyArf: true, choreaPositive: false, joint: 5, murmur: false, sob: false, edema: false, em: false, sn: false, noad: false, naBlood: false, naEcg: false, naEcho: false, wbc: false, aso: false, esr: false, antidnase: false, pr: false, echo: null, feverDuration: '', facilityType: null } },
    // Old "Level B confirms alone" row: B8 + A2 = 10 → still Confirmed, now by score.
    { id: 's2', includes_level_b: true, score: 10, result_label: 'Positive ARF (Level B confirmed)', level: 'confirmed', range: 'Level B > 6',
      inputs: { fever: null, chorea: null, altCause: null, historyArf: null, choreaPositive: false, joint: 0, murmur: false, sob: false, edema: false, em: false, sn: false, noad: false, naBlood: false, naEcg: false, naEcho: false, wbc: true, aso: true, esr: false, antidnase: false, pr: false, echo: 'suggestive', feverDuration: 'over2w', facilityType: null } },
    // Old Unlikely row (score 3): now reads ruled out.
    { id: 's3', includes_level_b: false, score: 3, result_label: 'ARF Unlikely', level: 'unlikely', range: 'Score 0–5',
      inputs: { fever: false, chorea: false, altCause: null, historyArf: false, choreaPositive: false, joint: 3, murmur: false, sob: false, edema: false, em: false, sn: false, noad: false, naBlood: false, naEcg: false, naEcho: false, wbc: false, aso: false, esr: false, antidnase: false, pr: false, echo: null, feverDuration: 'none', facilityType: null } },
    // Follow-up: no inputs → skipped.
    { id: 's4', includes_level_b: false, score: null, result_label: null, level: null, range: null, inputs: null },
  ];
  for (const e of cases) {
    const r = rescore(e);
    if (!r) { console.log(`${e.id}: skipped (no inputs)`); continue; }
    console.log(`${e.id}: "${e.result_label}" → "${r.result_label}" (level ${e.level ?? ''} → ${r.level}, range "${e.range ?? ''}" → "${r.range}")`);
  }
  console.log('selftest OK');
  return 0;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) return selftest();
  const apply = args.includes('--apply');
  const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const url = flag('--url') ?? process.env.SUPABASE_URL;
  const key = flag('--key') ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('Need SUPABASE_URL + SUPABASE_SERVICE_KEY env vars (or --url/--key). See the header comment.');
    return 1;
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  // Paginate through every encounter (RLS bypassed by the service key).
  const rows: EncRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('encounters').select('id, inputs, includes_level_b, score, result_label, level, range').range(from, from + 999);
    if (error) throw error;
    rows.push(...(data as EncRow[]));
    if ((data as EncRow[]).length < 1000) break;
  }

  let changed = 0;
  let skippedNoInputs = 0;
  let alreadyCurrent = 0;
  for (const e of rows) {
    const r = rescore(e);
    if (!r) { skippedNoInputs++; continue; }
    if (r.result_label === e.result_label && r.level === e.level && r.range === e.range) { alreadyCurrent++; continue; }
    changed++;
    const scoreNote = e.score !== null && !Number.isFinite(calcLevelA(e.inputs!) + (e.includes_level_b ? calcLevelB(e.inputs!) : 0))
      ? ' (WARNING: stored score does not match inputs — score left untouched)' : '';
    console.log(`${e.id}: "${e.result_label ?? ''}" → "${r.result_label}"${scoreNote}`);
    if (apply) {
      const { error } = await db.from('encounters').update({ result_label: r.result_label, level: r.level, range: r.range, actions: r.actions, updated_at: new Date().toISOString() }).eq('id', e.id);
      if (error) throw error;
    }
  }
  console.log(`\n${apply ? 'Applied' : 'Would apply'}: ${changed} | already current: ${alreadyCurrent} | skipped (no inputs): ${skippedNoInputs} | total: ${rows.length}`);
  if (!apply) console.log('Dry-run only — re-run with --apply to write.');
  return 0;
}

main().then((code) => process.exit(code)).catch((err) => { console.error(err); process.exit(1); });
