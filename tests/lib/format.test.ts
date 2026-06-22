import {
  formatRecordDate,
  fullName,
  initials,
  maskMRN,
  maskPhone,
  normalizeCode,
} from '@/lib/format';

/* ------------------------------------------------------------------ *
 * maskPhone — exact transformation table from smart-arf-app.html
 * ------------------------------------------------------------------ */
describe('maskPhone', () => {
  it.each<[string, string]>([
    ['', ''],
    ['abc', '****'], // 0 digits (<4) → literal ****
    ['12', '****'], // 2 digits (<4)
    ['123', '****'], // 3 digits (<4)
    ['1234', '•• ••• **34'], // 4 digits: min(3, 4-2)=2 bullets
    ['12345', '••• ••• **45'], // 5 digits: min(3, 5-2)=3 bullets
    ['1234567', '••• ••• **67'], // longer: capped at 3 bullets
    ['+249 91 234 5678', '+••• ••• **78'], // international: keeps leading +
    ['249912345678', '••• ••• **78'], // same digits, no + → no + prefix
  ])('maskPhone(%j) === %j', (input, expected) => {
    expect(maskPhone(input)).toBe(expected);
  });

  it('uses the bullet character U+2022', () => {
    expect(maskPhone('12345')).toContain('•');
    expect(maskPhone('12345')).not.toContain('*•'); // sanity: bullets and stars distinct
  });
});

/* ------------------------------------------------------------------ *
 * maskMRN
 * ------------------------------------------------------------------ */
describe('maskMRN', () => {
  it.each<[string, string]>([
    ['', ''],
    ['A', '*'],
    ['AB', '**'],
    ['ABC', '**BC'], // max(2, 1) = 2 stars + last 2
    ['ABCD', '**CD'], // max(2, 2) = 2 stars + last 2
    ['ABCDE', '***DE'], // max(2, 3) = 3 stars + last 2
    ['00123456', '******56'],
    ['1234567890', '********90'],
  ])('maskMRN(%j) === %j', (input, expected) => {
    expect(maskMRN(input)).toBe(expected);
  });

  it('always exposes the last 2 characters for lengths > 2', () => {
    expect(maskMRN('SECRET99').endsWith('99')).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * formatRecordDate — deterministic "DD Mon YYYY, HH:MM"
 * ------------------------------------------------------------------ */
describe('formatRecordDate', () => {
  it('formats as "DD Mon YYYY, HH:MM"', () => {
    expect(formatRecordDate(new Date(2026, 5, 22, 14, 30))).toBe('22 Jun 2026, 14:30');
  });

  it('zero-pads day, hour and minute', () => {
    expect(formatRecordDate(new Date(2026, 0, 5, 9, 5))).toBe('05 Jan 2026, 09:05');
  });

  it('handles year-end / December', () => {
    expect(formatRecordDate(new Date(2026, 11, 31, 23, 59))).toBe('31 Dec 2026, 23:59');
  });

  it('defaults to the current time when called with no argument', () => {
    const before = Date.now();
    const out = formatRecordDate();
    const after = Date.now();
    // The formatted string must parse back to a time within the call window.
    const parsed = Date.parse(out.replace(/(\d{2} \w{3} \d{4}), (\d{2}:\d{2})/, '$1 $2'));
    expect(parsed).toBeGreaterThanOrEqual(before - 60_000);
    expect(parsed).toBeLessThanOrEqual(after + 60_000);
  });
});

/* ------------------------------------------------------------------ *
 * initials
 * ------------------------------------------------------------------ */
describe('initials', () => {
  it.each<[string, string, string]>([
    ['John', 'Smith', 'JS'],
    ['john', 'smith', 'JS'],
    ['A', 'B', 'AB'],
    ['John', '', 'J'],
    ['', '', '?'],
  ])('initials(%j, %j) === %j', (first, last, expected) => {
    expect(initials(first, last)).toBe(expected);
  });

  it('trims surrounding whitespace before taking the first char', () => {
    expect(initials('  John ', '  Smith ')).toBe('JS');
  });
});

/* ------------------------------------------------------------------ *
 * fullName
 * ------------------------------------------------------------------ */
describe('fullName', () => {
  it('joins first and last', () => expect(fullName('John', 'Smith')).toBe('John Smith'));
  it('both empty → "Unknown"', () => expect(fullName('', '')).toBe('Unknown'));
  it('last empty → first only (no trailing space)', () =>
    expect(fullName('John', '')).toBe('John'));
  it('first empty → last only (no leading space)', () =>
    expect(fullName('', 'Smith')).toBe('Smith'));
});

/* ------------------------------------------------------------------ *
 * normalizeCode
 * ------------------------------------------------------------------ */
describe('normalizeCode', () => {
  it('uppercases the code', () => {
    expect(normalizeCode('arf-aaaa-bbbb')).toBe('ARF-AAAA-BBBB');
  });

  it('strips all whitespace', () => {
    expect(normalizeCode(' arf aaaa ')).toBe('ARFAAAA');
  });

  it('is idempotent for an already-normalized code', () => {
    const code = 'ARF-AAAA-BBBB';
    expect(normalizeCode(code)).toBe(code);
  });
});
