import { describe, it, expect } from 'vitest';
import { generateMap, validateMap, BOARD_BOUNDS, PATTERNS, type MapData } from './mapgen';
import { SPAWN_ZONE, BIN_H, BIN_CLEAR, RAMP_THICK, SPINNER_R_LONG, PEG_SHARE, RARE_PEG_SPACING } from './config';

const b = BOARD_BOUNDS;
const binTop = b.bottom - BIN_H;
const bins = Array.from({ length: 7 }, (_, i) => ({
  x: b.left + (i * (b.right - b.left)) / 7, width: (b.right - b.left) / 7, points: 10,
}));
const empty = (): MapData => ({
  seed: 0, pattern: 'classique', pegs: [], ramps: [], spinners: [], bumpers: [], bars: [], bins, binTop,
});
const midY = (b.top + SPAWN_ZONE + binTop - BIN_CLEAR) / 2;
/** Déflecteur mural : rampe dont une extrémité touche un mur. */
const isGuide = (r: { x: number; length: number; angle: number }) => {
  const ex = (Math.cos(r.angle) * r.length) / 2 + RAMP_THICK / 2;
  return r.x - ex <= b.left + 0.5 || r.x + ex >= b.right - 0.5;
};

describe('validateMap', () => {
  it('détecte un taquet trop proche d\'une barre bumper', () => {
    const m = empty();
    m.bars.push({ x: 500, y: midY, length: 140, angle: 0.3 });
    m.pegs.push({ x: 500, y: midY + 25, value: 1 });
    expect(validateMap(m).join()).toMatch(/écart/);
  });
  it('accepte une carte vide avec des bacs', () => expect(validateMap(empty())).toEqual([]));

  it('détecte deux taquets trop proches', () => {
    const m = empty();
    m.pegs.push({ x: 400, y: midY, value: 1 }, { x: 420, y: midY, value: 1 });
    expect(validateMap(m).join()).toMatch(/écart/);
  });

  it('détecte un taquet trop proche d\'un tourniquet (rayon de balayage)', () => {
    const m = empty();
    m.spinners.push({ x: 400, y: midY, radius: 46, speed: 0.03 });
    m.pegs.push({ x: 400 + 46 + 10, y: midY, value: 1 });
    expect(validateMap(m).join()).toMatch(/écart/);
  });

  it('détecte un taquet trop proche d\'une rampe (distance point–segment)', () => {
    const m = empty();
    m.ramps.push({ x: 500, y: midY, length: 300, angle: 0.4 });
    m.pegs.push({ x: 500, y: midY + 20, value: 1 });
    expect(validateMap(m).join()).toMatch(/écart/);
  });

  it('détecte un élément trop près d\'un mur', () => {
    const m = empty();
    m.pegs.push({ x: b.left + 12, y: midY, value: 1 });
    expect(validateMap(m).join()).toMatch(/mur/);
  });

  it('détecte un élément dans la zone de spawn', () => {
    const m = empty();
    m.pegs.push({ x: 600, y: b.top + SPAWN_ZONE / 2, value: 1 });
    expect(validateMap(m).join()).toMatch(/spawn/);
  });

  it('détecte un élément dans la bande au-dessus des bacs', () => {
    const m = empty();
    m.bumpers.push({ x: 600, y: binTop - 10, radius: 26 });
    expect(validateMap(m).join()).toMatch(/bacs/);
  });

  it('accepte un déflecteur collé au mur, refuse une rampe presque collée (piège)', () => {
    const attached = empty();
    // extrémité haute collée au mur gauche, descend vers l'intérieur
    const L = 70, a = 0.6, dx = (Math.cos(a) * L) / 2, dy = (Math.sin(a) * L) / 2;
    attached.ramps.push({ x: b.left + RAMP_THICK / 2 + dx, y: midY + dy, length: L, angle: a });
    expect(validateMap(attached)).toEqual([]);
    const nearly = empty();
    nearly.ramps.push({ x: b.left + RAMP_THICK / 2 + dx + 15, y: midY + dy, length: L, angle: a });
    expect(validateMap(nearly).join()).toMatch(/mur/);
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
  it('des barres bumpers et des hélices longues sur l\'ensemble des cartes', () => {
    const maps = Array.from({ length: 200 }, (_, s) => generateMap(s));
    expect(maps.some((m) => m.bars.length > 0)).toBe(true);
    expect(maps.some((m) => m.spinners.some((s) => s.radius === SPINNER_R_LONG))).toBe(true);
  });
  it('même seed → carte identique', () => expect(generateMap(123)).toEqual(generateMap(123)));

  it('seeds différentes → cartes différentes', () =>
    expect(generateMap(1).pegs).not.toEqual(generateMap(2).pegs));

  it('contient taquets, bumpers et au moins 5 bacs', () => {
    const m = generateMap(7, 'classique');
    expect(m.pegs.length).toBeGreaterThan(50);
    expect(m.bumpers.length).toBeGreaterThanOrEqual(2);
    expect(m.bins.length).toBeGreaterThanOrEqual(5);
  });

  it('bacs : un seul jackpot à 500, jamais sur un bord ; les bords rapportent peu', () => {
    for (let seed = 0; seed < 300; seed++) {
      const m = generateMap(seed);
      const pts = m.bins.map((x) => x.points);
      expect(pts.filter((p) => p === 500), `seed ${seed}`).toHaveLength(1);
      expect(pts[0]).toBeLessThanOrEqual(25);
      expect(pts[pts.length - 1]).toBeLessThanOrEqual(25);
    }
  });

  it('bacs symétriques pour le pattern symétrique', () => {
    for (let seed = 0; seed < 50; seed++) {
      const pts = generateMap(seed, 'symetrique').bins.map((x) => x.points);
      expect(pts).toEqual([...pts].reverse());
    }
  });

  it('déflecteurs sur les deux murs (pas de couloir libre le long des bords)', () => {
    for (const pattern of PATTERNS) {
      for (let seed = 0; seed < 30; seed++) {
        const m = generateMap(seed, pattern);
        const touching = (side: 'left' | 'right') => m.ramps.filter((r) => {
          const ex = (Math.cos(r.angle) * r.length) / 2 + RAMP_THICK / 2;
          return side === 'left' ? r.x - ex <= b.left + 0.5 : r.x + ex >= b.right - 0.5;
        }).length;
        expect(touching('left'), `${pattern} ${seed}`).toBeGreaterThanOrEqual(3);
        expect(touching('right'), `${pattern} ${seed}`).toBeGreaterThanOrEqual(3);
      }
    }
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
      for (const p of m.pegs)
        expect(m.pegs.some((q) => near(q.x, mx(p.x)) && near(q.y, p.y) && q.value === p.value), `seed ${seed} taquet`).toBe(true);
      for (const p of m.bumpers) expect(m.bumpers.some((q) => near(q.x, mx(p.x)) && near(q.y, p.y))).toBe(true);
      for (const p of m.spinners)
        expect(m.spinners.some((q) => near(q.x, mx(p.x)) && near(q.y, p.y) && (near(q.x, p.x) || near(q.speed, -p.speed)))).toBe(true);
      for (const r of m.ramps) expect(m.ramps.some((q) => near(q.x, mx(r.x)) && near(q.y, r.y) && near(q.angle, -r.angle))).toBe(true);
      for (const r of m.bars) expect(m.bars.some((q) => near(q.x, mx(r.x)) && near(q.y, r.y) && near(q.angle, -r.angle))).toBe(true);
    }
  });

  it('diagonale et entonnoirs : des rampes, et des taquets entre la dernière rampe et les bacs', () => {
    for (const pattern of ['diagonale', 'entonnoirs'] as const) {
      for (let seed = 0; seed < 50; seed++) {
        const m = generateMap(seed, pattern);
        expect(m.ramps.filter((r) => !isGuide(r)).length, `${pattern} ${seed}`).toBeGreaterThanOrEqual(2);
        const lowestRamp = Math.max(...m.ramps.filter((r) => !isGuide(r)).map((r) => r.y + (Math.abs(Math.sin(r.angle)) * r.length) / 2));
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

describe('taquets à valeur', () => {
  const count = (m: MapData, v: number) => m.pegs.filter((p) => p.value === v).length;

  it('exactement un taquet à 50, paliers 5 / 10 / 30 en nombres fixes', () => {
    for (const pattern of PATTERNS) {
      for (let seed = 0; seed < 100; seed++) {
        const m = generateMap(seed, pattern), n = m.pegs.length, at = `${pattern} ${seed}`;
        expect(count(m, 50), at).toBe(1);
        expect(count(m, 30), at).toBeGreaterThanOrEqual(1);
        expect(count(m, 30), at).toBeLessThanOrEqual(Math.max(1, Math.round(n * PEG_SHARE[30])) + 1);
        for (const v of [5, 10] as const)
          expect(Math.abs(count(m, v) - Math.round(n * PEG_SHARE[v])), `${at} palier ${v}`).toBeLessThanOrEqual(1);
        expect(count(m, 1), at).toBeGreaterThan(count(m, 5));
      }
    }
  });

  it('taquets à 30 et 50 espacés d\x27au moins RARE_PEG_SPACING', () => {
    for (const pattern of PATTERNS) {
      for (let seed = 0; seed < 100; seed++) {
        const rare = generateMap(seed, pattern).pegs.filter((p) => p.value >= 30);
        for (const p of rare)
          for (const q of rare)
            if (p !== q) expect(Math.hypot(p.x - q.x, p.y - q.y), `${pattern} ${seed}`).toBeGreaterThanOrEqual(RARE_PEG_SPACING);
      }
    }
  });

  it('symétrique : le 50 est sur l\x27axe central', () => {
    for (let seed = 0; seed < 100; seed++) {
      const fifty = generateMap(seed, 'symetrique').pegs.find((p) => p.value === 50)!;
      expect(Math.abs(fifty.x - (b.left + b.right) / 2), `seed ${seed}`).toBeLessThan(0.5);
    }
  });
});
