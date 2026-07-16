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
      __store: store,
    },
  };
});

import AsyncStorageMock from '@react-native-async-storage/async-storage';
import type { Encounter, Patient } from '@/lib/types';
import { emptyInputs } from '@/lib/types';
import { loadData, saveData } from '@/lib/storage';

const store = (AsyncStorageMock as unknown as { __store: Map<string, string> }).__store;
const getItem = AsyncStorageMock.getItem as jest.Mock;
const setItem = AsyncStorageMock.setItem as jest.Mock;

function mkPatient(id: number, over: Partial<Patient> = {}): Patient {
  return {
    id: `pat-${id}`,
    referralCode: `ARF-${id.toString().padStart(4, '0')}-AAAA`,
    firstName: 'Test',
    lastName: String(id),
    mrn: 'MRN' + id,
    phone1: '',
    phone2: '',
    dateOfBirth: '2015-01-01',
    gender: '',
    setting: '',
    isTest: false,
    inactive: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function mkEncounter(id: number, patientId: string, over: Partial<Encounter> = {}): Encounter {
  return {
    id: `enc-${id}`,
    patientId,
    type: 'initial',
    date: '01 Jan 2026, 10:00',
    inputs: emptyInputs(),
    score: id,
    level: 'unlikely',
    resultLabel: 'ARF Unlikely',
    range: 'Score 0–5',
    breakdown: [],
    actions: [],
    includesLevelB: false,
    facilityType: null,
    confirmedDx: '',
    finalDx: '',
    bpgStatus: '',
    echoFindings: '',
    complications: '',
    notes: '',
    referredTo: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  store.clear();
  getItem.mockClear();
  setItem.mockClear();
});

describe('loadData', () => {
  it('returns empty patients+encounters when nothing is stored', async () => {
    const data = await loadData();
    expect(data).toEqual({ patients: [], encounters: [] });
  });

  it('returns the stored patients + encounters', async () => {
    const p = [mkPatient(1), mkPatient(2)];
    const e = [mkEncounter(1, 'pat-1')];
    store.set('smartarf_data_v1', JSON.stringify({ patients: p, encounters: e }));
    const data = await loadData();
    expect(data.patients).toHaveLength(2);
    expect(data.encounters).toHaveLength(1);
    expect(data.encounters[0].patientId).toBe('pat-1');
  });

  it('round-trips through save → load with full fidelity', async () => {
    const patients = [mkPatient(1, { score: 0 } as never)];
    const encounters = [mkEncounter(1, 'pat-1', { score: 14, level: 'likely', includesLevelB: true })];
    await saveData({ patients, encounters });
    const loaded = await loadData();
    expect(loaded.encounters).toEqual(encounters);
    expect(loaded.encounters[0].inputs).toEqual(emptyInputs());
  });

  it('returns empty when stored JSON is malformed (never throws)', async () => {
    store.set('smartarf_data_v1', '{ broken !!!');
    const data = await loadData();
    expect(data).toEqual({ patients: [], encounters: [] });
  });

  it('returns empty when stored value is not an object', async () => {
    store.set('smartarf_data_v1', JSON.stringify([1, 2, 3]));
    const data = await loadData();
    expect(data.patients).toEqual([]);
    expect(data.encounters).toEqual([]);
  });

  it('coerces a missing encounters array to []', async () => {
    store.set('smartarf_data_v1', JSON.stringify({ patients: [mkPatient(1)] }));
    const data = await loadData();
    expect(data.patients).toHaveLength(1);
    expect(data.encounters).toEqual([]);
  });
});

describe('saveData', () => {
  it('writes to the versioned key "smartarf_data_v1"', async () => {
    await saveData({ patients: [mkPatient(1)], encounters: [] });
    expect(setItem).toHaveBeenCalledWith('smartarf_data_v1', expect.any(String));
  });

  it('serializes patients + encounters as JSON', async () => {
    const p = [mkPatient(1)];
    const e = [mkEncounter(1, 'pat-1')];
    await saveData({ patients: p, encounters: e });
    const [, value] = setItem.mock.calls[0];
    expect(JSON.parse(value)).toEqual({ patients: p, encounters: e });
  });

  it('HARD CAPS patients at 200 and cascades encounters', async () => {
    const patients = Array.from({ length: 250 }, (_, i) => mkPatient(i));
    // encounters attached to some dropped patients (ids 200..249)
    const encounters = Array.from({ length: 10 }, (_, i) => mkEncounter(i, `pat-${220 + i}`));
    await saveData({ patients, encounters });
    const loaded = await loadData();
    expect(loaded.patients).toHaveLength(200);
    // encounters whose patient was dropped are removed too
    expect(loaded.encounters).toHaveLength(0);
  });

  it('cap keeps the FIRST 200 patients', async () => {
    const patients = Array.from({ length: 203 }, (_, i) => mkPatient(i));
    await saveData({ patients, encounters: [] });
    const loaded = await loadData();
    expect(loaded.patients[0].id).toBe('pat-0');
    expect(loaded.patients[199].id).toBe('pat-199');
    expect(loaded.patients.find((p) => p.id === 'pat-202')).toBeUndefined();
  });

  it('does NOT mutate the input arrays when capping', async () => {
    const input = Array.from({ length: 250 }, (_, i) => mkPatient(i));
    await saveData({ patients: input, encounters: [] });
    expect(input).toHaveLength(250);
  });

  it('stores empty cleanly', async () => {
    await saveData({ patients: [], encounters: [] });
    const loaded = await loadData();
    expect(loaded).toEqual({ patients: [], encounters: [] });
  });
});

describe('storage key', () => {
  it('read and write share the same versioned key', async () => {
    await saveData({ patients: [mkPatient(1)], encounters: [] });
    await loadData();
    const writeKey = setItem.mock.calls[0][0];
    const readKey = getItem.mock.calls[getItem.mock.calls.length - 1][0];
    expect(writeKey).toBe('smartarf_data_v1');
    expect(readKey).toBe('smartarf_data_v1');
  });
});
