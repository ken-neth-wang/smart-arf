import {
  buildEncounterExportRows,
  csvField,
  ENCOUNTER_EXPORT_COLUMNS,
  toCsv,
} from '@/lib/export';
import { buildInputs } from '../helpers/fixtures';
import type { AudioRecord, Clinic, Encounter, Patient, PhotoRecord } from '@/lib/types';

/* ------------------------------------------------------------------ *
 * Fixtures — minimal valid Patient / Encounter / media rows
 * ------------------------------------------------------------------ */

function patient(patch: Partial<Patient> = {}): Patient {
  return {
    id: 'p1',
    referralCode: 'ARF-AAAA-BBBB',
    firstName: 'Ana',
    lastName: 'Rai',
    mrn: 'MRN001',
    phone1: '+67912345',
    phone2: '',
    dateOfBirth: '2012-04-01',
    dobApproximate: false,
    gender: 'female',
    setting: 'endemic',
    isTest: false,
    clinicId: 'c1',
    inactive: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  };
}

function encounter(patch: Partial<Encounter> = {}): Encounter {
  return {
    id: 'e1',
    patientId: 'p1',
    type: 'initial',
    date: '02 Jan 2026, 09:30',
    inputs: null,
    score: 4,
    level: 'likely',
    resultLabel: 'Likely ARF',
    range: '3–5',
    breakdown: null,
    actions: ['Start penicillin', 'Echo in 2 weeks'],
    includesLevelB: false,
    facilityType: 'primary',
    confirmedDx: 'confirmed',
    finalDx: '',
    bpgStatus: 'started',
    echoFindings: '',
    complications: 'mild carditis',
    notes: 'Notes, with comma',
    referredTo: 'Divisional hospital',
    signedBy: 'Dr. Test',
    signedAt: '2026-01-02T09:35:00.000Z',
    createdAt: '2026-01-02T09:30:00.000Z',
    updatedAt: '2026-01-02T09:30:00.000Z',
    inactive: false,
    ...patch,
  };
}

function photo(patch: Partial<PhotoRecord> = {}): PhotoRecord {
  return {
    id: 'ph1',
    patientId: 'p1',
    encounterId: 'e1',
    clinicId: 'c1',
    storagePath: 'photos/e1/ph1.jpg',
    mimeType: 'image/jpeg',
    finding: 'rash',
    arfSuspected: true,
    confidence: 0.8,
    notes: '',
    model: 'dummy',
    clinicianLabel: null,
    inactive: false,
    createdAt: '2026-01-02T09:31:00.000Z',
    ...patch,
  };
}

function audio(patch: Partial<AudioRecord> = {}): AudioRecord {
  return {
    id: 'au1',
    patientId: 'p1',
    encounterId: 'e1',
    clinicId: 'c1',
    storagePath: 'audio/e1/au1.wav',
    mimeType: 'audio/wav',
    finding: 'murmur',
    classification: 'abnormal',
    confidence: 0.7,
    notes: '',
    model: 'dummy',
    clinicianLabel: null,
    inactive: false,
    createdAt: '2026-01-02T09:32:00.000Z',
    ...patch,
  };
}

const CLINICS: Clinic[] = [
  { id: 'c1', name: 'Nausori Health Centre', type: 'primary' },
  { id: 'c2', name: 'CWM Hospital', type: 'tertiary' },
];

const columnIndexOf = (name: string) => ENCOUNTER_EXPORT_COLUMNS.indexOf(name as (typeof ENCOUNTER_EXPORT_COLUMNS)[number]);

/* ------------------------------------------------------------------ *
 * buildEncounterExportRows
 * ------------------------------------------------------------------ */

describe('buildEncounterExportRows', () => {
  it('emits the header plus one row per encounter with patient data inlined', () => {
    const rows = buildEncounterExportRows({
      patients: [patient()],
      encounters: [encounter()],
      clinics: CLINICS,
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual([...ENCOUNTER_EXPORT_COLUMNS]);
    const row = rows[1];
    expect(row[columnIndexOf('Referral Code')]).toBe('ARF-AAAA-BBBB');
    expect(row[columnIndexOf('Clinic')]).toBe('Nausori Health Centre');
    expect(row[columnIndexOf('Encounter Type')]).toBe('Assessment');
    expect(row[columnIndexOf('Total Score')]).toBe('4');
    expect(row[columnIndexOf('Risk Tier')]).toBe('Likely ARF');
    expect(row[columnIndexOf('Confirmed Dx')]).toBe('Confirmed');
    expect(row[columnIndexOf('BPG Status')]).toBe('Started');
    expect(row[columnIndexOf('Recommended Actions')]).toBe('Start penicillin ; Echo in 2 weeks');
  });

  it('orders rows newest encounter first and includes follow-ups', () => {
    const rows = buildEncounterExportRows({
      patients: [patient()],
      encounters: [
        encounter({ id: 'e1', createdAt: '2026-01-02T09:30:00.000Z' }),
        encounter({ id: 'e2', type: 'followup', createdAt: '2026-03-01T00:00:00.000Z', score: null, level: null, resultLabel: null, range: null, actions: null, facilityType: null, confirmedDx: '', bpgStatus: '' }),
      ],
      clinics: CLINICS,
    });
    expect(rows).toHaveLength(3); // header + 2 encounters
    expect(rows[1][columnIndexOf('Encounter Type')]).toBe('Follow-Up');
    expect(rows[1][columnIndexOf('Total Score')]).toBe('');
    expect(rows[2][columnIndexOf('Encounter Type')]).toBe('Assessment');
  });

  it('drops inactive patients, inactive encounters, and orphaned encounters', () => {
    const rows = buildEncounterExportRows({
      patients: [
        patient({ id: 'p1' }),
        patient({ id: 'p2', inactive: true }),
        patient({ id: 'p3' }),
      ],
      encounters: [
        encounter({ patientId: 'p1' }),
        encounter({ id: 'e-inactive', patientId: 'p3', inactive: true }),
        encounter({ id: 'e-orphan', patientId: 'p-missing' }),
      ],
      clinics: CLINICS,
    });
    expect(rows).toHaveLength(2); // header + only p1's active encounter
    expect(rows[1][columnIndexOf('Referral Code')]).toBe('ARF-AAAA-BBBB');
  });


describe('assessment criteria block (encounter.inputs)', () => {
  it('renders Level A and Level B selections as labeled cells', () => {
    const rows = buildEncounterExportRows({
      patients: [patient()],
      encounters: [encounter({
        includesLevelB: true,
        inputs: buildInputs({
          fever: true, chorea: false, altCause: null, historyArf: true,
          choreaPositive: false, joint: 5,
          murmur: true, sob: true, edema: false,
          em: true, sn: false, noad: false,
          wbc: true, esr: false, aso: true, antidnase: false, pr: false,
          echo: 'suggestive', feverDuration: 'over2w', facilityType: 'secondary',
        }),
      })],
      clinics: CLINICS,
    });
    const row = rows[1];
    expect(row[columnIndexOf('Fever')]).toBe('Yes');
    expect(row[columnIndexOf('Chorea Reported')]).toBe('No'); // explicit tri-state No
    expect(row[columnIndexOf('Alternative Cause')]).toBe(''); // null = not asked
    expect(row[columnIndexOf('History of ARF')]).toBe('Yes');
    expect(row[columnIndexOf('Joint Finding')]).toBe('Migratory Polyarthritis');
    expect(row[columnIndexOf('Heart Murmur')]).toBe('Yes');
    expect(row[columnIndexOf('Murmur Severity')]).toBe('SOB');
    expect(row[columnIndexOf('Erythema Marginatum')]).toBe('Yes');
    expect(row[columnIndexOf('Subcutaneous Nodules')]).toBe('');
    expect(row[columnIndexOf('WBC Raised')]).toBe('Yes');
    expect(row[columnIndexOf('ASO Raised')]).toBe('Yes');
    expect(row[columnIndexOf('Echo Suggestive')]).toBe('Yes');
    expect(row[columnIndexOf('Fever Duration')]).toBe('Over 2 weeks');
    expect(row[columnIndexOf('Includes Level B')]).toBe('Yes');
  });

  it('blanks the whole criteria block when the encounter has no scoring inputs', () => {
    const rows = buildEncounterExportRows({
      patients: [patient()],
      encounters: [encounter({ type: 'followup', inputs: null })],
      clinics: CLINICS,
    });
    const row = rows[1];
    for (const name of ['Fever', 'Joint Finding', 'Heart Murmur', 'WBC Raised', 'Fever Duration']) {
      expect(row[columnIndexOf(name)]).toBe('');
    }
    expect(row[columnIndexOf('Includes Level B')]).toBe('No');
  });

  it('exports Level A and Level B subtotals recomputed from the stored inputs', () => {
    const rows = buildEncounterExportRows({
      patients: [patient()],
      encounters: [encounter({
        score: 28,
        includesLevelB: true,
        inputs: buildInputs({ joint: 5, murmur: true, em: true, wbc: true, aso: true, echo: 'suggestive' }),
      })],
      clinics: CLINICS,
    });
    const row = rows[1];
    expect(row[columnIndexOf('Level A Score')]).toBe('15'); // joint 5 + murmur 5 + em 5
    expect(row[columnIndexOf('Level B Score')]).toBe('13'); // blood 3 + strep 5 + echo 5
    expect(row[columnIndexOf('Total Score')]).toBe('28'); // the persisted total
  });

  it('leaves Level B blank on Level-A-only encounters even when Level B fields were touched', () => {
    const rows = buildEncounterExportRows({
      patients: [patient()],
      encounters: [encounter({
        includesLevelB: false,
        inputs: buildInputs({ joint: 2, wbc: true }), // commit(false) scores Level A alone
      })],
      clinics: CLINICS,
    });
    const row = rows[1];
    expect(row[columnIndexOf('Level A Score')]).toBe('2');
    expect(row[columnIndexOf('Level B Score')]).toBe('');
  });

  it('blanks both subtotal columns on unscored follow-ups', () => {
    const rows = buildEncounterExportRows({
      patients: [patient()],
      encounters: [encounter({ type: 'followup', inputs: null, score: null })],
      clinics: CLINICS,
    });
    const row = rows[1];
    expect(row[columnIndexOf('Level A Score')]).toBe('');
    expect(row[columnIndexOf('Level B Score')]).toBe('');
  });
});

  it('marks approximate ages with ~ and leaves unknown DOB blank', () => {
    const rows = buildEncounterExportRows({
      patients: [
        patient({ id: 'p1', dateOfBirth: '2012-01-01', dobApproximate: true }),
        patient({ id: 'p2', referralCode: 'ARF-CCCC-DDDD', dateOfBirth: null, dobApproximate: false }),
      ],
      encounters: [encounter({ patientId: 'p1' }), encounter({ id: 'e2', patientId: 'p2' })],
      clinics: CLINICS,
    });
    // Fixture dates are in the past relative to any realistic "now"; the ~
    // marker is the contract under test, not the exact number of years.
    expect(rows[1][columnIndexOf('Age')]).toMatch(/^~\d+$/);
    expect(rows[2][columnIndexOf('Date of Birth')]).toBe('');
    expect(rows[2][columnIndexOf('Age')]).toBe('');
  });

  it('joins signed photo and audio links per encounter and skips unsigned media', () => {
    const rows = buildEncounterExportRows({
      patients: [patient()],
      encounters: [encounter()],
      clinics: CLINICS,
      photos: [
        photo({ id: 'ph1', encounterId: 'e1' }),
        photo({ id: 'ph2', encounterId: 'e1', storagePath: 'photos/e1/ph2.jpg' }),
        photo({ id: 'ph3', encounterId: 'e2' }), // other encounter → excluded
      ],
      audio: [audio()],
      photoUrls: { ph1: 'https://example.com/signed/ph1', ph2: 'https://example.com/signed/ph2' },
      audioUrls: { au1: '' }, // failed signature → dropped
    });
    const row = rows[1];
    expect(row[columnIndexOf('Photo Links')]).toBe('https://example.com/signed/ph1 ; https://example.com/signed/ph2');
    expect(row[columnIndexOf('Audio Links')]).toBe('');
  });

  it('falls back to the raw clinic id when the clinic row is not in the list', () => {
    const rows = buildEncounterExportRows({
      patients: [patient({ clinicId: 'cX' })],
      encounters: [encounter()],
      clinics: CLINICS,
    });
    expect(rows[1][columnIndexOf('Clinic')]).toBe('cX');
  });
});

/* ------------------------------------------------------------------ *
 * csvField / toCsv — RFC 4180 quoting + Excel hardening
 * ------------------------------------------------------------------ */

describe('csvField', () => {
  it('passes plain values through untouched', () => {
    expect(csvField('Ana')).toBe('Ana');
    expect(csvField('ARF-AAAA-BBBB')).toBe('ARF-AAAA-BBBB');
  });
  it('quotes commas, quotes (doubled), and line breaks', () => {
    expect(csvField('Notes, with comma')).toBe('"Notes, with comma"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('toCsv', () => {
  it('joins rows with CRLF, terminates the final line, and prefixes a BOM', () => {
    const csv = toCsv([['A', 'B'], ['1', '2'], ['3', '4']]);
    expect(csv).toBe('\uFEFFA,B\r\n1,2\r\n3,4\r\n');
  });
  it('neutralises cells that start with a formula character', () => {
    const csv = toCsv([['=cmd'], ['@x'], ['normal']]);
    expect(csv).toContain("'=cmd");
    expect(csv).toContain("'@x");
    expect(csv).toContain('normal');
  });
  it('round-trips a full export row containing commas and quotes', () => {
    const rows = buildEncounterExportRows({ patients: [patient()], encounters: [encounter()], clinics: CLINICS });
    const csv = toCsv(rows);
    const lines = csv.slice(1).split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    // notes cell contains a comma → must have been quoted
    expect(lines[1]).toContain('"Notes, with comma"');
  });
  it('renders undefined cells as empty fields instead of crashing (legacy inputs rows)', () => {
    expect(() => toCsv([['a', undefined as unknown as string, 'b'], ['1', undefined as unknown as string]])).not.toThrow();
    expect(toCsv([['a', undefined as unknown as string, 'b']])).toBe('\uFEFFa,,b\r\n');
  });
});
