import {
  buildBreakdownArray,
  buildFullBreakdownArray,
  bloodInflammScore,
  calcLevelA,
  calcLevelB,
  carditisScore,
  echoScore,
  finalDisplayBreakdown,
  generatePatientCode,
  getActions,
  getInterp,
  levelADisplayBreakdown,
  skinScore,
} from '@/lib/scoring';
import { buildInputs } from '../helpers/fixtures';

/* ------------------------------------------------------------------ *
 * Carditis
 * ------------------------------------------------------------------ */
describe('carditisScore', () => {
  it('murmur === true → 5', () => {
    expect(carditisScore(buildInputs({ murmur: true }))).toBe(5);
  });
  it('murmur === false → 0', () => {
    expect(carditisScore(buildInputs({ murmur: false }))).toBe(0);
  });
  it('severity sub-flags (sob/edema/chestpain/walking) add NO points', () => {
    expect(
      carditisScore(buildInputs({ murmur: true, sob: true, edema: true, chestpain: true, walking: true })),
    ).toBe(5);
  });
});

/* ------------------------------------------------------------------ *
 * Skin
 * ------------------------------------------------------------------ */
describe('skinScore', () => {
  it('em alone → 5', () => expect(skinScore(buildInputs({ em: true }))).toBe(5));
  it('sn alone → 5', () => expect(skinScore(buildInputs({ sn: true }))).toBe(5));
  it('both em + sn → 10', () => expect(skinScore(buildInputs({ em: true, sn: true }))).toBe(10));
  it('neither → 0', () => expect(skinScore(buildInputs())).toBe(0));
});

/* ------------------------------------------------------------------ *
 * Level A total
 * ------------------------------------------------------------------ */
describe('calcLevelA', () => {
  it('empty inputs → 0', () => expect(calcLevelA(buildInputs())).toBe(0));

  it('joint values map 0 / 2 / 3 / 5', () => {
    expect(calcLevelA(buildInputs({ joint: 0 }))).toBe(0);
    expect(calcLevelA(buildInputs({ joint: 2 }))).toBe(2);
    expect(calcLevelA(buildInputs({ joint: 3 }))).toBe(3);
    expect(calcLevelA(buildInputs({ joint: 5 }))).toBe(5);
  });

  it('murmur contributes +5', () => expect(calcLevelA(buildInputs({ murmur: true }))).toBe(5));
  it('em + sn together contribute +10', () =>
    expect(calcLevelA(buildInputs({ em: true, sn: true }))).toBe(10));
  it('"No Obvious Alternative Diagnosis" contributes +3', () =>
    expect(calcLevelA(buildInputs({ noad: true }))).toBe(3));
  it('choreaPositive contributes +5', () =>
    expect(calcLevelA(buildInputs({ choreaPositive: true }))).toBe(5));

  it('max Level A WITHOUT chorea = 23 (5+5+10+3)', () => {
    expect(
      calcLevelA(buildInputs({ joint: 5, murmur: true, em: true, sn: true, noad: true })),
    ).toBe(23);
  });

  it('max Level A WITH chorea = 28', () => {
    expect(
      calcLevelA(
        buildInputs({ joint: 5, murmur: true, em: true, sn: true, noad: true, choreaPositive: true }),
      ),
    ).toBe(28);
  });
});

/* ------------------------------------------------------------------ *
 * Blood inflammation markers
 * ------------------------------------------------------------------ */
describe('bloodInflammScore', () => {
  it('none → 0', () => expect(bloodInflammScore(buildInputs())).toBe(0));
  it('wbc alone → 3', () => expect(bloodInflammScore(buildInputs({ wbc: true }))).toBe(3));
  it('aso alone → 3', () => expect(bloodInflammScore(buildInputs({ aso: true }))).toBe(3));
  it('esr alone → 3', () => expect(bloodInflammScore(buildInputs({ esr: true }))).toBe(3));
  it('all three together still = 3 (grouped, NOT additive)', () => {
    expect(bloodInflammScore(buildInputs({ wbc: true, aso: true, esr: true }))).toBe(3);
  });
});

/* ------------------------------------------------------------------ *
 * Echo
 * ------------------------------------------------------------------ */
describe('echoScore', () => {
  it("echo === 'suggestive' → 5", () =>
    expect(echoScore(buildInputs({ echo: 'suggestive' }))).toBe(5));
  it("echo === 'not-suggestive' → 0", () =>
    expect(echoScore(buildInputs({ echo: 'not-suggestive' }))).toBe(0));
  it('echo === null → 0', () => expect(echoScore(buildInputs({ echo: null }))).toBe(0));
});

/* ------------------------------------------------------------------ *
 * Level B total
 * ------------------------------------------------------------------ */
describe('calcLevelB', () => {
  it('empty → 0', () => expect(calcLevelB(buildInputs())).toBe(0));
  it('blood markers → 3', () => expect(calcLevelB(buildInputs({ wbc: true }))).toBe(3));
  it('antidnase → +5', () => expect(calcLevelB(buildInputs({ antidnase: true }))).toBe(5));
  it('pr → +3', () => expect(calcLevelB(buildInputs({ pr: true }))).toBe(3));
  it("echo 'suggestive' → +5", () =>
    expect(calcLevelB(buildInputs({ echo: 'suggestive' }))).toBe(5));
  it('max Level B = 16 (3 + 5 + 3 + 5)', () => {
    expect(
      calcLevelB(buildInputs({ wbc: true, antidnase: true, pr: true, echo: 'suggestive' })),
    ).toBe(16);
  });

  // Documents that NA suppression is a UI/persistence concern (toggleNA clears
  // the underlying flags), NOT a scoring-layer concern. calcLevelB reads the
  // raw fields directly, matching the HTML source.
  it('does not itself consult na* flags (matches HTML calcLevelB)', () => {
    expect(calcLevelB(buildInputs({ wbc: true, naBlood: true }))).toBe(3);
  });
});

/* ------------------------------------------------------------------ *
 * Interpretation tiers
 * ------------------------------------------------------------------ */
describe('getInterp', () => {
  const cases: ReadonlyArray<[number, string, string, string]> = [
    [0, 'ARF Unlikely', 'unlikely', 'Score 0–5'],
    [3, 'ARF Unlikely', 'unlikely', 'Score 0–5'],
    [5, 'ARF Unlikely', 'unlikely', 'Score 0–5'],
    [6, 'ARF Possible', 'possible', 'Score 6–9'],
    [9, 'ARF Possible', 'possible', 'Score 6–9'],
    [10, 'ARF Likely', 'likely', 'Score 10–14'],
    [14, 'ARF Likely', 'likely', 'Score 10–14'],
    [15, 'ARF Highly Likely', 'urgent', 'Score ≥15'],
    [100, 'ARF Highly Likely', 'urgent', 'Score ≥15'],
  ];

  it.each(cases)('score %i → { %s, %s, %s }', (score, label, level, range) => {
    const r = getInterp(score);
    expect(r.label).toBe(label);
    expect(r.level).toBe(level);
    expect(r.range).toBe(range);
  });

  it('never returns the "chorea" level — chorea only adds points, no bypass', () => {
    for (let i = 0; i <= 50; i++) {
      expect(getInterp(i).level).not.toBe('chorea');
    }
  });
});

/* ------------------------------------------------------------------ *
 * Chorea derivation sanity
 * ------------------------------------------------------------------ */
describe('chorea effect on the total', () => {
  it('choreaPositive raises a low score into a higher tier (no auto-confirm)', () => {
    // 0 points otherwise → chorea makes it 5 → still 'unlikely'
    expect(getInterp(calcLevelA(buildInputs({ choreaPositive: true }))).level).toBe('unlikely');
    // chorea + noad = 8 → 'possible'
    expect(
      getInterp(calcLevelA(buildInputs({ choreaPositive: true, noad: true }))).level,
    ).toBe('possible');
  });
});

/* ------------------------------------------------------------------ *
 * Recommended actions
 * ------------------------------------------------------------------ */
describe('getActions', () => {
  it('score 0–5 → 3 plain-text items', () => {
    expect(getActions(5)).toEqual([
      'Treat according to clinical diagnosis',
      'Arrange appropriate follow-up',
      'Reassess if fever persists or symptoms change',
    ]);
  });

  it('score 6–9 → 4 items', () => {
    const a = getActions(9);
    expect(a).toHaveLength(4);
    expect(a[0]).toBe('ARF is possible — do not dismiss');
    expect(a[1]).toBe('Start Benzathine Penicillin G (BPG) prophylaxis');
    expect(a[2]).toBe('Refer to secondary care for confirmation');
    expect(a[3]).toBe('Document findings and initiate prophylaxis plan');
  });

  it('score 10–14 → 5 items', () => {
    const a = getActions(14);
    expect(a).toHaveLength(5);
    expect(a[0]).toBe('ARF is likely — act promptly');
  });

  it('score ≥15 → 5 plain-text items (HTML stripped)', () => {
    expect(getActions(15)).toEqual([
      'ARF is highly likely — urgent action required',
      'Start Benzathine Penicillin G (BPG) prophylaxis now',
      'Urgent referral to secondary care',
      'Monitor for cardiac complications',
      'Initiate long-term secondary prophylaxis plan',
    ]);
  });

  it('boundary scores route to the correct tier', () => {
    expect(getActions(5)).toHaveLength(3);
    expect(getActions(6)).toHaveLength(4);
    expect(getActions(9)).toHaveLength(4);
    expect(getActions(10)).toHaveLength(5);
    expect(getActions(14)).toHaveLength(5);
    expect(getActions(15)).toHaveLength(5);
  });

  it('never contains residual HTML tags', () => {
    for (let i = 0; i <= 20; i++) {
      for (const line of getActions(i)) {
        expect(line).not.toMatch(/<\/?[a-z]+>/i);
      }
    }
  });

  it('uses an em-dash (—), not a hyphen, in the boundary tiers', () => {
    expect(getActions(6)[0]).toContain('—');
    expect(getActions(10)[0]).toContain('—');
    expect(getActions(15)[0]).toContain('—');
  });
});

/* ------------------------------------------------------------------ *
 * Patient code generation
 * ------------------------------------------------------------------ */
describe('generatePatientCode', () => {
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const RE = /^ARF-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

  it('matches the ARF-XXXX-XXXX format', () => {
    for (let i = 0; i < 50; i++) expect(generatePatientCode()).toMatch(RE);
  });

  it('is exactly 13 characters and starts with "ARF-"', () => {
    const c = generatePatientCode();
    expect(c).toHaveLength(13);
    expect(c.startsWith('ARF-')).toBe(true);
    // structure: 4 prefix + 4 + 1 dash + 4
    expect(c.split('-')).toEqual(['ARF', expect.any(String), expect.any(String)]);
    expect(c.split('-')[1]).toHaveLength(4);
    expect(c.split('-')[2]).toHaveLength(4);
  });

  it('every code char is from the 31-char alphabet (excludes 0/O/1/I/L)', () => {
    for (let i = 0; i < 100; i++) {
      const body = generatePatientCode().replace(/-/g, '').slice(3); // drop "ARF"
      for (const ch of body) expect(ALPHABET).toContain(ch);
      expect(body).not.toMatch(/[01OIL]/);
    }
  });

  it('produces unique codes across a large sample', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 500; i++) codes.add(generatePatientCode());
    expect(codes.size).toBe(500);
  });
});

/* ------------------------------------------------------------------ *
 * Level A breakdown (saved-record shape)
 * ------------------------------------------------------------------ */
describe('buildBreakdownArray', () => {
  it('empty inputs → empty array', () => {
    expect(buildBreakdownArray(buildInputs())).toEqual([]);
  });

  it('chorea → first row "Chorea (major criterion)" worth 5', () => {
    expect(buildBreakdownArray(buildInputs({ choreaPositive: true }))).toContainEqual({
      label: 'Chorea (major criterion)',
      points: 5,
    });
  });

  it.each([
    [2, 'Monoarthralgia'],
    [3, 'Polyarthralgia'],
    [5, 'Migratory Polyarthritis'],
  ] as const)('joint %i → "%s" with matching points', (value, label) => {
    expect(buildBreakdownArray(buildInputs({ joint: value }))).toContainEqual({
      label,
      points: value,
    });
  });

  it('joint 0 → no joint row', () => {
    const rows = buildBreakdownArray(buildInputs({ joint: 0 }));
    expect(rows.find((r) => /arthralgia|Arthritis/.test(r.label))).toBeUndefined();
  });

  it('murmur → "Heart Murmur" +5 and a severity sub-row', () => {
    const rows = buildBreakdownArray(
      buildInputs({ murmur: true, sob: true, edema: true, chestpain: true, walking: true }),
    );
    expect(rows).toContainEqual({ label: 'Heart Murmur', points: 5 });
    const sev = rows.find((r) => r.label.startsWith('↳ Severity:'));
    expect(sev).toBeDefined();
    expect(sev?.points).toBeNull(); // severity sub-row is null, NOT 0
    expect(sev?.kind).toBe('sub');
    expect(sev?.label).toBe("↳ Severity: SOB, Edema, Chest pain, Can't walk normal distances");
  });

  it('murmur with no severity flags → no sub-row', () => {
    const rows = buildBreakdownArray(buildInputs({ murmur: true }));
    expect(rows.find((r) => r.label.startsWith('↳'))).toBeUndefined();
  });

  it('em → "Erythema Marginatum" +5', () =>
    expect(buildBreakdownArray(buildInputs({ em: true }))).toContainEqual({
      label: 'Erythema Marginatum',
      points: 5,
    }));

  it('sn → "Subcutaneous Nodules" +5', () =>
    expect(buildBreakdownArray(buildInputs({ sn: true }))).toContainEqual({
      label: 'Subcutaneous Nodules',
      points: 5,
    }));

  it('noad → "No Obvious Alternative Diagnosis" +3', () =>
    expect(buildBreakdownArray(buildInputs({ noad: true }))).toContainEqual({
      label: 'No Obvious Alternative Diagnosis',
      points: 3,
    }));

  it('preserves documented order: chorea, joint, murmur, severity, em, sn, noad', () => {
    const rows = buildBreakdownArray(
      buildInputs({
        choreaPositive: true,
        joint: 5,
        murmur: true,
        sob: true,
        em: true,
        sn: true,
        noad: true,
      }),
    );
    const labels = rows.map((r) => r.label);
    const idx = (needle: string) => labels.findIndex((l) => l.startsWith(needle));
    expect(idx('Chorea')).toBeLessThan(idx('Migratory'));
    expect(idx('Migratory')).toBeLessThan(idx('Heart Murmur'));
    expect(idx('Heart Murmur')).toBeLessThan(idx('↳'));
    expect(idx('↳')).toBeLessThan(idx('Erythema'));
    expect(idx('Erythema')).toBeLessThan(idx('Subcutaneous'));
    expect(idx('Subcutaneous')).toBeLessThan(idx('No Obvious'));
  });
});

/* ------------------------------------------------------------------ *
 * Full (Level A + B) breakdown (saved-record shape)
 * ------------------------------------------------------------------ */
describe('buildFullBreakdownArray', () => {
  it('starts from the Level A rows and appends Level B rows after them', () => {
    const rows = buildFullBreakdownArray(buildInputs({ murmur: true, wbc: true }));
    expect(rows).toContainEqual({ label: 'Heart Murmur', points: 5 });
    expect(rows).toContainEqual({ label: 'Inflammation markers (WBC)', points: 3 });
    expect(rows.findIndex((r) => r.label === 'Heart Murmur')).toBeLessThan(
      rows.findIndex((r) => r.label.startsWith('Inflammation')),
    );
  });

  it('inflammation markers join WBC, ASO, ESR/CRP in fixed order', () => {
    const rows = buildFullBreakdownArray(buildInputs({ wbc: true, aso: true, esr: true }));
    expect(rows).toContainEqual({ label: 'Inflammation markers (WBC, ASO, ESR/CRP)', points: 3 });
  });

  it('antidnase → "Anti-DNase B positive" +5', () =>
    expect(buildFullBreakdownArray(buildInputs({ antidnase: true }))).toContainEqual({
      label: 'Anti-DNase B positive',
      points: 5,
    }));

  it('pr → "Prolonged PR interval" +3 (lowercase i)', () =>
    expect(buildFullBreakdownArray(buildInputs({ pr: true }))).toContainEqual({
      label: 'Prolonged PR interval',
      points: 3,
    }));

  it("echo 'suggestive' → 'Echocardiogram — Suggestive' +5", () =>
    expect(buildFullBreakdownArray(buildInputs({ echo: 'suggestive' }))).toContainEqual({
      label: 'Echocardiogram — Suggestive',
      points: 5,
    }));

  it("echo 'not-suggestive' → row IS present with points 0 (not omitted)", () => {
    expect(buildFullBreakdownArray(buildInputs({ echo: 'not-suggestive' }))).toContainEqual({
      label: 'Echocardiogram — Not suggestive',
      points: 0,
    });
  });

  describe('NA (Not Available) suppression', () => {
    it('naBlood hides both inflammation markers and Anti-DNase B', () => {
      const rows = buildFullBreakdownArray(
        buildInputs({ naBlood: true, wbc: true, aso: true, esr: true, antidnase: true }),
      );
      expect(rows.find((r) => r.label.startsWith('Inflammation'))).toBeUndefined();
      expect(rows.find((r) => r.label.includes('Anti-DNase'))).toBeUndefined();
    });

    it('naEcg hides prolonged PR', () => {
      const rows = buildFullBreakdownArray(buildInputs({ naEcg: true, pr: true }));
      expect(rows.find((r) => r.label.includes('PR'))).toBeUndefined();
    });

    it('naEcho hides both echo rows', () => {
      const rows = buildFullBreakdownArray(buildInputs({ naEcho: true, echo: 'suggestive' }));
      expect(rows.find((r) => r.label.includes('Echocardiogram'))).toBeUndefined();
    });
  });
});

/* ------------------------------------------------------------------ *
 * Display helpers (TS-only)
 * ------------------------------------------------------------------ */
describe('levelADisplayBreakdown', () => {
  it('empty → placeholder row then a Total row', () => {
    expect(levelADisplayBreakdown(buildInputs(), 0)).toEqual([
      { label: 'No findings selected', points: 0, kind: 'empty' },
      { label: 'Total', points: 0, kind: 'total' },
    ]);
  });

  it('with findings → items + trailing Total', () => {
    const rows = levelADisplayBreakdown(buildInputs({ murmur: true }), 5);
    expect(rows[rows.length - 1]).toEqual({ label: 'Total', points: 5, kind: 'total' });
    expect(rows).toContainEqual({ label: 'Heart Murmur', points: 5 });
  });
});

describe('finalDisplayBreakdown', () => {
  it('always starts with the Level A Subtotal header', () => {
    expect(finalDisplayBreakdown(buildInputs(), 0, 0)[0]).toEqual({
      label: 'Level A Subtotal',
      points: 0,
      kind: 'subtotal',
    });
  });

  it('no findings → "No findings selected" placeholder then Total', () => {
    const rows = finalDisplayBreakdown(buildInputs(), 0, 0);
    expect(rows).toContainEqual({ label: 'No findings selected', points: 0, kind: 'empty' });
    expect(rows[rows.length - 1]).toEqual({ label: 'Total', points: 0, kind: 'total' });
  });

  it('renders a Level B block when scoreB > 0', () => {
    const rows = finalDisplayBreakdown(buildInputs({ wbc: true }), 0, 3);
    expect(rows.find((r) => r.label === 'Level B' && r.kind === 'subtotal')).toBeDefined();
    expect(rows.find((r) => r.label.startsWith('Inflammation'))).toBeDefined();
  });

  it('renders a Level B block when any NA flag is set (even with scoreB 0)', () => {
    const rows = finalDisplayBreakdown(buildInputs({ naBlood: true }), 5, 0);
    expect(rows.find((r) => r.label === 'Level B' && r.kind === 'subtotal')).toBeDefined();
    // NA section renders a placeholder row with null points
    expect(rows.find((r) => r.label === 'Blood Tests' && r.points === null)).toBeDefined();
  });

  it('omits the Level B block when there is no scoreB and no NA flag', () => {
    const rows = finalDisplayBreakdown(buildInputs({ murmur: true }), 5, 0);
    expect(rows.find((r) => r.label === 'Level B')).toBeUndefined();
    expect(rows[rows.length - 1]).toEqual({ label: 'Total', points: 5, kind: 'total' });
  });
});
