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

  it('5 patterns disponibles', () =>
    expect([...PATTERNS].sort()).toEqual(['classique', 'diagonale', 'entonnoirs', 'symetrique', 'trous']));

  it('le tirage par seed couvre les 5 patterns', () => {
    const seen = new Set(Array.from({ length: 200 }, (_, s) => generateMap(s).pattern));
    expect(seen.size).toBe(5);
  });

  it('symétrique : chaque élément a son miroir', () => {
    const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
    const mx = (x: number) => b.left + b.right - x;
    for (let seed = 0; seed < 50; seed++) {
      const m = generateMap(seed, 'symetrique');
      for (const p of m.pegs) expect(m.pegs.some((q) => near(q.x, mx(p.x)) && near(q.y, p.y)), `seed ${seed} taquet`).toBe(true);
      for (const p of m.bumpers) expect(m.bumpers.some((q) => near(q.x, mx(p.x)) && near(q.y, p.y))).toBe(true);
      for (const p of m.spinners)
        expect(m.spinners.some((q) => near(q.x, mx(p.x)) && near(q.y, p.y) && (near(q.x, p.x) || near(q.speed, -p.speed)))).toBe(true);
      for (const r of m.ramps) expect(m.ramps.some((q) => near(q.x, mx(r.x)) && near(q.y, r.y) && near(q.angle, -r.angle))).toBe(true);
    }
  });

  it('diagonale et entonnoirs : des rampes, et des taquets entre la dernière rampe et les bacs', () => {
    for (const pattern of ['diagonale', 'entonnoirs'] as const) {
      for (let seed = 0; seed < 50; seed++) {
        const m = generateMap(seed, pattern);
        expect(m.ramps.length, `${pattern} ${seed}`).toBeGreaterThanOrEqual(2);
        const lowestRamp = Math.max(...m.ramps.map((r) => r.y + (Math.abs(Math.sin(r.angle)) * r.length) / 2));
        const pegsBelow = m.pegs.filter((p) => p.y > lowestRamp + 20).length;
        expect(pegsBelow, `${pattern} ${seed}`).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('entonnoirs : des tourniquets sous les entonnoirs', () => {
    for (let seed = 0; seed < 50; seed++) expect(generateMap(seed, 'entonnoirs').spinners.length).toBeGreaterThanOrEqual(1);
  });

  it('trous : au moins 2 éléments spéciaux et une grille dense', () => {
    for (let seed = 0; seed < 50; seed++) {
      const m = generateMap(seed, 'trous');
      expect(m.bumpers.length + m.spinners.length).toBeGreaterThanOrEqual(2);
      expect(m.pegs.length).toBeGreaterThan(100);
    }
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
