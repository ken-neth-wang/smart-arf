/**
 * PII masking + date formatting — mirrors maskPhone / maskMRN and the date format
 * used in smart-arf-app.html saveRecord().
 */
export function maskPhone(input: string): string {
  if (!input) return '';
  const digits = String(input).replace(/\D/g, '');
  if (digits.length < 4) return '****';
  const tail = digits.slice(-2);
  const prefix = String(input).trim().startsWith('+') ? '+' : '';
  return `${prefix}${digits.slice(0, Math.min(3, digits.length - 2)).replace(/./g, '•')} ••• **${tail}`;
}

export function maskMRN(input: string): string {
  if (!input) return '';
  const str = String(input);
  if (str.length <= 2) return '*'.repeat(str.length);
  return '*'.repeat(Math.max(2, str.length - 2)) + str.slice(-2);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "DD Mon YYYY, HH:MM" — matches `new Date().toLocaleDateString('en-GB', {...})` in the HTML. */
export function formatRecordDate(d: Date = new Date()): string {
  const day = String(d.getDate()).padStart(2, '0');
  const mon = MONTHS[d.getMonth()];
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${mon} ${year}, ${hh}:${mm}`;
}

export function initials(first: string, last: string): string {
  const a = (first || '').trim()[0] || '';
  const b = (last || '').trim()[0] || '';
  return (a + b).toUpperCase() || '?';
}

export function fullName(first: string, last: string): string {
  return `${first || ''} ${last || ''}`.trim() || 'Unknown';
}

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/\s+/g, '');
}
