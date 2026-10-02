import { describe, it, expect } from 'vitest';
import { generateMap, validateMap, BOARD_BOUNDS, PATTERNS, type MapData } from './mapgen';
import { SPAWN_ZONE, BIN_H, BIN_CLEAR } from './config';

const b = BOARD_BOUNDS;
const binTop = b.bottom - BIN_H;
const bins = Array.from({ length: 7 }, (_, i) => ({
  x: b.left + (i * (b.right - b.left)) / 7, width: (b.right - b.left) / 7, points: 10,
}));
const empty = (): MapData => ({
  seed: 0, pattern: 'classique', pegs: [], ramps: [], spinners: [], bumpers: [], bins, binTop,
});
const midY = (b.top + SPAWN_ZONE + binTop - BIN_CLEAR) / 2;

describe('validateMap', () => {
  it('accepte une carte vide avec des bacs', () => expect(validateMap(empty())).toEqual([]));

  it('détecte deux taquets trop proches', () => {
    const m = empty();
    m.pegs.push({ x: 400, y: midY, golden: false }, { x: 420, y: midY, golden: false });
    expect(validateMap(m).join()).toMatch(/écart/);
  });

  it('détecte un taquet trop proche d\'un tourniquet (rayon de balayage)', () => {
    const m = empty();
    m.spinners.push({ x: 400, y: midY, radius: 46, speed: 0.03 });
    m.pegs.push({ x: 400 + 46 + 10, y: midY, golden: false });
    expect(validateMap(m).join()).toMatch(/écart/);
  });

  it('détecte un taquet trop proche d\'une rampe (distance point–segment)', () => {
    const m = empty();
    m.ramps.push({ x: 500, y: midY, length: 300, angle: 0.4 });
    m.pegs.push({ x: 500, y: midY + 20, golden: false });
    expect(validateMap(m).join()).toMatch(/écart/);
  });

  it('détecte un élément trop près d\'un mur', () => {
    const m = empty();
    m.pegs.push({ x: b.left + 12, y: midY, golden: false });
    expect(validateMap(m).join()).toMatch(/mur/);
  });

  it('détecte un élément dans la zone de spawn', () => {
    const m = empty();
    m.pegs.push({ x: 600, y: b.top + SPAWN_ZONE / 2, golden: false });
    expect(validateMap(m).join()).toMatch(/spawn/);
  });

  it('détecte un élément dans la bande au-dessus des bacs', () => {
    const m = empty();
    m.bumpers.push({ x: 600, y: binTop - 10, radius: 26 });
    expect(validateMap(m).join()).toMatch(/bacs/);
  });

  it('détecte une rampe trop plate', () => {
    const m = empty();
    m.ramps.push({ x: 600, y: midY, length: 200, angle: 0.05 });
    expect(validateMap(m).join()).toMatch(/plate/);
  });

  it('détecte moins de 5 bacs ou des bacs qui ne couvrent pas la largeur', () => {
    const m = empty();
    m.bins = bins.slice(0, 4);
    expect(validateMap(m).join()).toMatch(/bacs/);
  });
});

describe('generateMap', () => {
  it('même seed → carte identique', () => expect(generateMap(123)).toEqual(generateMap(123)));

  it('seeds différentes → cartes différentes', () =>
    expect(generateMap(1).pegs).not.toEqual(generateMap(2).pegs));

  it('contient taquets, bumpers et au moins 5 bacs', () => {
    const m = generateMap(7, 'classique');
    expect(m.pegs.length).toBeGreaterThan(50);
    expect(m.bumpers.length).toBeGreaterThanOrEqual(2);
    expect(m.bins.length).toBeGreaterThanOrEqual(5);
  });

  for (const pattern of PATTERNS) {
    it(`${pattern} : 1000 seeds valides`, () => {
      for (let seed = 0; seed < 1000; seed++) {
        const errors = validateMap(generateMap(seed, pattern));
        if (errors.length) throw new Error(`seed ${seed} : ${errors.slice(0, 3).join(' ; ')}`);
      }
    });
  }
});
