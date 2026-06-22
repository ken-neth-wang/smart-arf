import { emptyInputs } from '@/lib/types';

describe('emptyInputs', () => {
  it('returns the documented default state', () => {
    expect(emptyInputs()).toMatchObject({
      fever: null,
      chorea: null,
      altCause: null,
      choreaPositive: false,
      joint: 0,
      murmur: false,
      sob: false,
      edema: false,
      chestpain: false,
      walking: false,
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

  it('has exactly 22 fields', () => {
    expect(Object.keys(emptyInputs())).toHaveLength(22);
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
