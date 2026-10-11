import { describe, it, expect } from 'vitest';
import { EFFECTS, ALL_EFFECTS, normalizeEffects, pickEffect } from './specials';

describe('normalizeEffects', () => {
  it('catalogue : sept effets, ordre canonique', () =>
    expect(ALL_EFFECTS).toBe('double,moon,warp,slow,x2,gold,quake'));

  it.each([
    [ALL_EFFECTS, ALL_EFFECTS],
    ['warp,moon', 'moon,warp'],
    [' moon , nope,moon,<script>', 'moon'],
    ['', ''],
  ])('%j → %j', (raw, expected) => expect(normalizeEffects(raw)).toBe(expected));
});

describe('pickEffect', () => {
  it('tire parmi les effets activés seulement', () => {
    expect(pickEffect('moon,warp', true, () => 0)).toBe('moon');
    expect(pickEffect('moon,warp', true, () => 0.99)).toBe('warp');
    expect(pickEffect('moon,warp', true, () => 1)).toBe('warp'); // tirage borné
  });

  it('chaque effet activé est atteignable', () => {
    const n = EFFECTS.length;
    expect(EFFECTS.map((_, i) => pickEffect(ALL_EFFECTS, true, () => (i + 0.5) / n))).toEqual(EFFECTS.map((e) => e.id));
  });

  it('bille bonus écartée au plafond de billes', () => {
    expect(pickEffect('double,moon', false, () => 0)).toBe('moon');
    expect(pickEffect('double', false, () => 0)).toBeNull();
  });

  it('aucun effet activé ou ids inconnus → null', () => {
    expect(pickEffect('', true, () => 0)).toBeNull();
    expect(pickEffect('nope', true, () => 0)).toBeNull();
  });
});
