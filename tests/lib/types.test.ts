import { approxDobFromAge, ageFromDateOfBirth, emptyInputs, formatAge } from '@/lib/types';

describe('emptyInputs', () => {
  it('returns the documented default state', () => {
    expect(emptyInputs()).toMatchObject({
      fever: null,
      chorea: null,
      altCause: null,
      historyArf: null,
      choreaPositive: false,
      joint: 0,
      murmur: false,
      sob: false,
      edema: false,
      em: false,
      sn: false,
      noad: false,
      naBlood: false,
      naEcg: false,
      naEcho: false,
      wbc: false,
      aso: false,
      esr: false,
      antidnase: false,
      pr: false,
      echo: null,
    });
  });

  it('has exactly 23 fields', () => {
    expect(Object.keys(emptyInputs())).toHaveLength(23);
  });

  it('returns a fresh object on each call (no shared reference)', () => {
    expect(emptyInputs()).not.toBe(emptyInputs());
    const a = emptyInputs();
    a.murmur = true;
    a.joint = 5;
    expect(emptyInputs().murmur).toBe(false);
    expect(emptyInputs().joint).toBe(0);
  });
});

describe('age helpers', () => {
  const now = new Date('2026-08-06');

  it('approxDobFromAge uses Jan 1 of the birth year', () => {
    expect(approxDobFromAge(14, now)).toBe('2012-01-01');
  });

  it('round-trips: age → approximate DOB → age', () => {
    expect(ageFromDateOfBirth(approxDobFromAge(14, now), now)).toBe(14);
  });

  it('formatAge prefixes approximate ages with ~', () => {
    expect(formatAge('2012-01-01', false, now)).toBe('14');
    expect(formatAge('2012-01-01', true, now)).toBe('~14');
  });

  it('formatAge returns null for unknown/unparseable DOB', () => {
    expect(formatAge(null, false, now)).toBeNull();
    expect(formatAge('not a date', true, now)).toBeNull();
  });
});
