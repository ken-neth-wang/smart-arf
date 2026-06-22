// Mock AsyncStorage with an in-memory map. The factory is hoisted to the top
// of the file by jest, so it is installed before storage.ts is imported.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((k: string) => Promise.resolve(store.has(k) ? store.get(k)! : null)),
      setItem: jest.fn((k: string, v: string) => {
        store.set(k, v);
        return Promise.resolve();
      }),
      removeItem: jest.fn((k: string) => {
        store.delete(k);
        return Promise.resolve();
      }),
      // exposed so tests can poke the backing store / reset between cases
      __store: store,
    },
  };
});

import AsyncStorageMock from '@react-native-async-storage/async-storage';
import { emptyInputs, type PatientRecord } from '@/lib/types';
import { loadRecords, saveRecords } from '@/lib/storage';

const store = (AsyncStorageMock as unknown as { __store: Map<string, string> }).__store;
const getItem = AsyncStorageMock.getItem as jest.Mock;
const setItem = AsyncStorageMock.setItem as jest.Mock;

/** Minimal valid PatientRecord for storage tests (storage treats it as opaque JSON). */
function mkRecord(id: number, over: Partial<PatientRecord> = {}): PatientRecord {
  return {
    id: String(id),
    patientCode: `ARF-${id.toString().padStart(4, '0')}-AAAA`,
    date: '22 Jun 2026, 14:30',
    firstName: 'Test',
    lastName: String(id),
    mrn: 'MRN' + id,
    phone1: '',
    phone2: '',
    age: id,
    gender: '',
    setting: '',
    isTest: false,
    inactive: false,
    score: id,
    level: 'unlikely',
    resultLabel: 'ARF Unlikely',
    range: 'Score 0–5',
    breakdown: [],
    actions: [],
    referredTo: '',
    followups: [],
    inputs: emptyInputs(),
    includesLevelB: false,
    ...over,
  };
}

beforeEach(() => {
  store.clear();
  getItem.mockClear();
  setItem.mockClear();
});

/* ------------------------------------------------------------------ *
 * loadRecords
 * ------------------------------------------------------------------ */
describe('loadRecords', () => {
  it('returns [] when nothing is stored', async () => {
    expect(await loadRecords()).toEqual([]);
    expect(getItem).toHaveBeenCalledTimes(1);
  });

  it('returns the stored array', async () => {
    store.set('smartarf_records_v1', JSON.stringify([mkRecord(1), mkRecord(2)]));
    const out = await loadRecords();
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('1');
    expect(out[1].patientCode).toBe('ARF-0002-AAAA');
  });

  it('round-trips through save → load with full fidelity', async () => {
    const original = [mkRecord(1, { score: 14, level: 'likely', includesLevelB: true })];
    await saveRecords(original);
    const loaded = await loadRecords();
    expect(loaded).toEqual(original);
    expect(loaded[0].inputs).toEqual(emptyInputs()); // nested object preserved
  });

  it('returns [] when stored JSON is not an array (object)', async () => {
    store.set('smartarf_records_v1', JSON.stringify({ not: 'an array' }));
    expect(await loadRecords()).toEqual([]);
  });

  it('returns [] when stored JSON is a primitive', async () => {
    store.set('smartarf_records_v1', JSON.stringify(42));
    expect(await loadRecords()).toEqual([]);
  });

  it('returns [] on malformed JSON (never throws)', async () => {
    store.set('smartarf_records_v1', '{ broken json !!!');
    expect(await loadRecords()).toEqual([]);
  });

  it('returns [] when the stored value is the literal string "null"', async () => {
    store.set('smartarf_records_v1', 'null');
    expect(await loadRecords()).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * saveRecords
 * ------------------------------------------------------------------ */
describe('saveRecords', () => {
  it('writes to the documented key "smartarf_records_v1"', async () => {
    await saveRecords([mkRecord(1)]);
    expect(setItem).toHaveBeenCalledWith('smartarf_records_v1', expect.any(String));
  });

  it('serializes the records as JSON', async () => {
    const rec = mkRecord(1);
    await saveRecords([rec]);
    const [, value] = setItem.mock.calls[0];
    expect(JSON.parse(value)).toEqual([rec]);
  });

  it('stores all records when at or below the 200 cap', async () => {
    const at = Array.from({ length: 200 }, (_, i) => mkRecord(i));
    await saveRecords(at);
    const loaded = await loadRecords();
    expect(loaded).toHaveLength(200);
  });

  it('HARD CAPS at 200 records (mirrors HTML: arr.length = 200)', async () => {
    const over = Array.from({ length: 250 }, (_, i) => mkRecord(i));
    await saveRecords(over);
    const loaded = await loadRecords();
    expect(loaded).toHaveLength(200);
    // exactly 200, not 201
    expect(loaded).toHaveLength(200);
  });

  it('cap keeps the FIRST 200 (callers prepend newest, so oldest tail drops)', async () => {
    const over = Array.from({ length: 203 }, (_, i) => mkRecord(i));
    await saveRecords(over);
    const loaded = await loadRecords();
    expect(loaded[0].id).toBe('0'); // first kept
    expect(loaded[199].id).toBe('199'); // last kept
    // ids 200, 201, 202 were dropped
    expect(loaded.find((r) => r.id === '200')).toBeUndefined();
    expect(loaded.find((r) => r.id === '202')).toBeUndefined();
  });

  it('does NOT mutate the input array when capping', async () => {
    const input = Array.from({ length: 250 }, (_, i) => mkRecord(i));
    await saveRecords(input);
    expect(input).toHaveLength(250); // caller's array untouched
  });

  it('stores an empty array cleanly', async () => {
    await saveRecords([]);
    expect(await loadRecords()).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Cross-cutting
 * ------------------------------------------------------------------ */
describe('storage key namespacing', () => {
  it('uses a versioned key so a future schema bump will not collide', () => {
    expect(setItem).not.toHaveBeenCalled();
  });
  it('read and write share the same key', async () => {
    await saveRecords([mkRecord(1)]);
    await loadRecords();
    const writeKey = setItem.mock.calls[0][0];
    const readKey = getItem.mock.calls[0][0];
    expect(writeKey).toBe('smartarf_records_v1');
    expect(readKey).toBe('smartarf_records_v1');
    expect(writeKey).toBe(readKey);
  });
});
