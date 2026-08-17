import { approxDobFromAge, ageFromDateOfBirth, emptyInputs, formatAge, maskDobInput, normalizeDobEntry } from '@/lib/types';

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

describe('normalizeDobEntry', () => {
  it('empty and whitespace-only entry mean unknown DOB', () => {
    expect(normalizeDobEntry('')).toEqual({ dateOfBirth: null, dobApproximate: false });
    expect(normalizeDobEntry('   ')).toEqual({ dateOfBirth: null, dobApproximate: false });
  });

  it('a bare birth year becomes an approximate Jan-1 DOB (the 22007 fix)', () => {
    expect(normalizeDobEntry('1998')).toEqual({ dateOfBirth: '1998-01-01', dobApproximate: true });
  });

  it('a real full date passes through unchanged, exact', () => {
    expect(normalizeDobEntry('2015-06-15')).toEqual({ dateOfBirth: '2015-06-15', dobApproximate: false });
  });

  it('rejects values Postgres would refuse (error 22007)', () => {
    // impossible date, partials, localized formats, garbage
    expect(normalizeDobEntry('2015-13-01')).toBeNull();
    expect(normalizeDobEntry('2015-06')).toBeNull();
    expect(normalizeDobEntry('15/06/2015')).toBeNull();
    expect(normalizeDobEntry('2015-6-15')).toBeNull(); // unpadded — strict format
    expect(normalizeDobEntry('0000')).toBeNull(); // bare year that isn't a real date
    expect(normalizeDobEntry('not a date')).toBeNull();
    expect(normalizeDobEntry('98')).toBeNull();
  });
});

describe('maskDobInput', () => {
  it('auto-inserts dashes as the date is typed', () => {
    expect(maskDobInput('2')).toBe('2');
    expect(maskDobInput('2015')).toBe('2015');
    expect(maskDobInput('20150')).toBe('2015-0');
    expect(maskDobInput('201506')).toBe('2015-06');
    expect(maskDobInput('2015061')).toBe('2015-06-1');
    expect(maskDobInput('20150615')).toBe('2015-06-15');
  });

  it('keeps a 4-digit value a bare year (approximate-DOB path)', () => {
    expect(maskDobInput('1998')).toBe('1998');
  });

  it('strips non-digits as they arrive (garbage is untypeable)', () => {
    expect(maskDobInput('2015-06-15')).toBe('2015-06-15'); // re-mask of valid input is stable
    expect(maskDobInput('2015/06/15')).toBe('2015-06-15'); // paste with slashes
    expect(maskDobInput('abc')).toBe('');
    expect(maskDobInput('20a1b5')).toBe('2015');
    expect(maskDobInput('15/06/2015')).toBe('1506-20-15'); // reordered — gate still rejects impossible dates
  });

  it('caps at 8 digits', () => {
    expect(maskDobInput('201506151')).toBe('2015-06-15');
    expect(maskDobInput('20150615999')).toBe('2015-06-15');
  });
});
