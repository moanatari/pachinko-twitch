// Génération procédurale PURE : seed → éléments du plateau. Aucun import Phaser ici.
import { Rng } from './rng';
import {
  BOARD_W, HEIGHT, WALL, PEG_R, BUMPER_R, SPINNER_R, RAMP_THICK,
  SPAWN_ZONE, BIN_H, BIN_CLEAR, MIN_GAP, SPINNER_SPEED,
} from './config';

export const PATTERNS = ['classique', 'symetrique', 'diagonale', 'trous', 'entonnoirs'] as const;
export type PatternId = (typeof PATTERNS)[number];

export interface Bounds { left: number; right: number; top: number; bottom: number }
export const BOARD_BOUNDS: Bounds = { left: WALL, right: BOARD_W - WALL, top: 0, bottom: HEIGHT };

export interface Peg { x: number; y: number; golden: boolean }
export interface Ramp { x: number; y: number; length: number; angle: number } // centre, angle en rad
export interface Spinner { x: number; y: number; radius: number; speed: number } // speed en rad/step, signe = sens
export interface Bumper { x: number; y: number; radius: number }
export interface Bin { x: number; width: number; points: number } // x = bord gauche
export interface MapData {
  seed: number;
  pattern: PatternId;
  pegs: Peg[];
  ramps: Ramp[];
  spinners: Spinner[];
  bumpers: Bumper[];
  bins: Bin[];
  binTop: number;
}

export const RAMP_MIN_ANGLE = 0.25; // rad : en dessous, la bille s'arrête sur la rampe

// --- Géométrie : tout obstacle est une capsule (segment épaissi) ; un cercle = segment de longueur 0 ---
interface Shape { x1: number; y1: number; x2: number; y2: number; r: number; name: string }

const circle = (x: number, y: number, r: number, name: string): Shape => ({ x1: x, y1: y, x2: x, y2: y, r, name });
const rampShape = (p: Ramp): Shape => {
  const dx = (Math.cos(p.angle) * p.length) / 2, dy = (Math.sin(p.angle) * p.length) / 2;
  return { x1: p.x - dx, y1: p.y - dy, x2: p.x + dx, y2: p.y + dy, r: RAMP_THICK / 2, name: 'rampe' };
};

function pointSeg(px: number, py: number, s: Shape): number {
  const vx = s.x2 - s.x1, vy = s.y2 - s.y1;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - s.x1) * vx + (py - s.y1) * vy) / len2));
  return Math.hypot(px - (s.x1 + t * vx), py - (s.y1 + t * vy));
}

const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
  Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));

function segDist(a: Shape, b: Shape): number {
  const crosses =
    orient(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1) * orient(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2) < 0 &&
    orient(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1) * orient(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2) < 0;
  if (crosses) return 0;
  return Math.min(pointSeg(a.x1, a.y1, b), pointSeg(a.x2, a.y2, b), pointSeg(b.x1, b.y1, a), pointSeg(b.x2, b.y2, a));
}

/** Espace libre entre les surfaces de deux obstacles. */
const gap = (a: Shape, b: Shape) => segDist(a, b) - a.r - b.r;

const ext = (s: Shape) => ({
  minX: Math.min(s.x1, s.x2) - s.r, maxX: Math.max(s.x1, s.x2) + s.r,
  minY: Math.min(s.y1, s.y2) - s.r, maxY: Math.max(s.y1, s.y2) + s.r,
});

/** Erreur liée à la position d'un obstacle seul (murs, zones réservées), ou null. */
function placementError(s: Shape, b: Bounds, binTop: number): string | null {
  const e = ext(s);
  // une rampe peut être collée au mur (déflecteur) ; sinon il faut un vrai passage, jamais une fente
  const attached = (gap: number) => s.name === 'rampe' && Math.abs(gap) <= 0.5;
  for (const gap of [e.minX - b.left, b.right - e.maxX])
    if (gap < MIN_GAP && !attached(gap)) return `${s.name} trop près d'un mur`;
  if (e.minY < b.top + SPAWN_ZONE) return `${s.name} dans la zone de spawn`;
  if (e.maxY > binTop - BIN_CLEAR) return `${s.name} dans la bande au-dessus des bacs`;
  return null;
}

function tooClose(a: Shape, b: Shape): boolean {
  const ea = ext(a), eb = ext(b);
  if (ea.minX - eb.maxX > MIN_GAP || eb.minX - ea.maxX > MIN_GAP) return false; // rejet rapide
  if (ea.minY - eb.maxY > MIN_GAP || eb.minY - ea.maxY > MIN_GAP) return false;
  return gap(a, b) < MIN_GAP;
}

function shapesOf(m: MapData): Shape[] {
  return [
    ...m.pegs.map((p) => circle(p.x, p.y, PEG_R, 'taquet')),
    ...m.bumpers.map((p) => circle(p.x, p.y, p.radius, 'bumper')),
    ...m.spinners.map((p) => circle(p.x, p.y, p.radius, 'tourniquet')), // rayon de balayage complet
    ...m.ramps.map(rampShape),
  ];
}

/** Liste des règles violées ; tableau vide = carte valide. */
export function validateMap(m: MapData, b: Bounds = BOARD_BOUNDS): string[] {
  const errors: string[] = [];
  const shapes = shapesOf(m);
  for (const s of shapes) {
    const err = placementError(s, b, m.binTop);
    if (err) errors.push(err);
  }
  for (let i = 0; i < shapes.length; i++)
    for (let j = i + 1; j < shapes.length; j++)
      if (tooClose(shapes[i], shapes[j]))
        errors.push(`écart ${gap(shapes[i], shapes[j]).toFixed(1)} < ${MIN_GAP} entre ${shapes[i].name} et ${shapes[j].name}`);
  for (const r of m.ramps) if (Math.abs(r.angle) < RAMP_MIN_ANGLE) errors.push('rampe trop plate');

  if (m.bins.length < 5) errors.push('moins de 5 bacs');
  let x = b.left;
  for (const bin of m.bins) {
    if (Math.abs(bin.x - x) > 0.5) errors.push('bacs non contigus');
    x = bin.x + bin.width;
  }
  if (Math.abs(x - b.right) > 0.5) errors.push('les bacs ne couvrent pas la largeur');
  return errors;
}


// --- Construction : chaque ajout est refusé s'il viole une règle ---
type Spec =
  | ({ kind: 'peg' } & Peg)
  | ({ kind: 'bumper' } & Bumper)
  | ({ kind: 'spinner' } & Spinner)
  | ({ kind: 'ramp' } & Ramp);

const shapeOf = (s: Spec): Shape =>
  s.kind === 'peg' ? circle(s.x, s.y, PEG_R, 'taquet')
    : s.kind === 'bumper' ? circle(s.x, s.y, s.radius, 'bumper')
    : s.kind === 'spinner' ? circle(s.x, s.y, s.radius, 'tourniquet') // rayon de balayage complet
    : rampShape(s);

class Builder {
  readonly shapes: Shape[] = [];
  constructor(readonly m: MapData, readonly b: Bounds, readonly rng: Rng) {}

  /** Pose tous les éléments, ou aucun si l'un d'eux viole une règle (paires symétriques). */
  place(specs: Spec[]): boolean {
    const shapes = specs.map(shapeOf);
    for (const [i, s] of shapes.entries()) {
      if (placementError(s, this.b, this.m.binTop)) return false;
      if (this.shapes.some((o) => tooClose(o, s))) return false;
      if (shapes.slice(0, i).some((o) => tooClose(o, s))) return false;
    }
    for (const s of specs) {
      if (s.kind === 'ramp' && Math.abs(s.angle) < RAMP_MIN_ANGLE) return false;
    }
    this.shapes.push(...shapes);
    for (const s of specs) {
      const { kind, ...e } = s;
      if (kind === 'peg') this.m.pegs.push(e as Peg);
      else if (kind === 'bumper') this.m.bumpers.push(e as Bumper);
      else if (kind === 'spinner') this.m.spinners.push(e as Spinner);
      else this.m.ramps.push(e as Ramp);
    }
    return true;
  }

  peg(x: number, y: number, golden = this.rng.chance(0.03)) { return this.place([{ kind: 'peg', x, y, golden }]); }
  bumper(x: number, y: number, radius = BUMPER_R) { return this.place([{ kind: 'bumper', x, y, radius }]); }
  spinner(x: number, y: number, radius = SPINNER_R) {
    return this.place([{ kind: 'spinner', x, y, radius, speed: this.spinnerSpeed() }]);
  }
  ramp(x: number, y: number, length: number, angle: number) { return this.place([{ kind: 'ramp', x, y, length, angle }]); }

  spinnerSpeed() { return this.rng.pick([-1, 1]) * SPINNER_SPEED * this.rng.range(0.7, 1.3); }

  get cx() { return (this.b.left + this.b.right) / 2; }

  /** Image miroir par rapport à l'axe vertical central (rampes et tourniquets inversés). */
  mirror(s: Spec): Spec {
    const x = this.b.left + this.b.right - s.x;
    if (s.kind === 'ramp') return { ...s, x, angle: -s.angle };
    if (s.kind === 'spinner') return { ...s, x, speed: -s.speed };
    return { ...s, x };
  }

  /** Pose l'élément et son miroir ; sur l'axe central, un seul élément (pas de doublon superposé). */
  sym(s: Spec) {
    return Math.abs(s.x - this.cx) < 1 ? this.place([{ ...s, x: this.cx }]) : this.place([s, this.mirror(s)]);
  }

  /** Zone jouable verticale (hors spawn et bande des bacs). */
  get playTop() { return this.b.top + SPAWN_ZONE; }
  get playBottom() { return this.m.binTop - BIN_CLEAR; }
}

/** Valeurs tirées à chaque carte : un seul jackpot (500), jamais sur un bord ; bords toujours bas.
 *  Les bords ne doivent pas payer : une bille qui longe un mur est la plus prévisible. */
function makeBins(rng: Rng, b: Bounds, symmetric: boolean): Bin[] {
  const n = rng.pick([7, 9, 11]);
  const width = (b.right - b.left) / n;
  const pts: number[] = Array.from({ length: n }, () => rng.pick([10, 25, 50, 100]));
  const half = symmetric ? (n - 1) / 2 : n - 1; // en symétrique, on décide la moitié gauche + le centre
  pts[0] = rng.pick([10, 25]);
  const jackpot = symmetric ? half : rng.int(1, n - 2);
  pts[jackpot] = 500;
  let big = rng.int(1, half);
  if (big === jackpot) big = big > 1 ? big - 1 : big + 1;
  pts[big] = 250;
  if (symmetric) for (let i = 0; i < half; i++) pts[n - 1 - i] = pts[i];
  else pts[n - 1] = rng.pick([10, 25]);
  return pts.map((points, i) => ({ x: b.left + i * width, width, points }));
}

/** Déflecteurs collés aux murs, en quinconce : pas de couloir libre le long des bords. */
function wallGuides(g: Builder, symmetric: boolean) {
  const r = RAMP_THICK / 2;
  for (const side of symmetric ? ['left'] : ['left', 'right']) {
    for (let y = g.playTop + (side === 'left' ? 50 : 140); y < g.playBottom - 90; y += g.rng.range(170, 210)) {
      const L = g.rng.range(55, 80), a = g.rng.range(0.5, 0.7);
      const dx = (Math.cos(a) * L) / 2, dy = (Math.sin(a) * L) / 2;
      const spec: Spec = side === 'left'
        ? { kind: 'ramp', x: g.b.left + r + dx, y: y + dy, length: L, angle: a }
        : { kind: 'ramp', x: g.b.right - r - dx, y: y + dy, length: L, angle: -a };
      if (symmetric) g.sym(spec);
      else g.place([spec]);
    }
  }
}

/** Grille en quinconce, en sautant les zones `skip`. */
function pegGrid(g: Builder, dx: number, dy: number, skip: (x: number, y: number) => boolean = () => false) {
  const { left, right } = g.b;
  const jitter = () => g.rng.range(-4, 4);
  for (let row = 0, y = g.playTop + PEG_R + 12; y < g.playBottom - PEG_R; y += dy, row++)
    for (let x = left + MIN_GAP + PEG_R + 4 + (row % 2) * (dx / 2); x < right - MIN_GAP - PEG_R; x += dx)
      if (!skip(x, y)) g.peg(x + jitter(), y + jitter());
}

interface Hole { x: number; y: number; r: number; w?: number; h?: number } // cercle, ou rectangle si w/h
const inHole = (h: Hole, x: number, y: number) =>
  h.w ? Math.abs(x - h.x) < h.w / 2 && Math.abs(y - h.y) < h.h! / 2 : Math.hypot(h.x - x, h.y - y) < h.r;

/** Zones vides qui ne se chevauchent pas. */
function carveHoles(g: Builder, want: number, rMin: number, rMax: number, rects = false): Hole[] {
  const holes: Hole[] = [];
  for (let tries = 0; holes.length < want && tries < 60; tries++) {
    const r = g.rng.range(rMin, rMax);
    const h: Hole = { x: g.rng.range(g.b.left + r, g.b.right - r), y: g.rng.range(g.playTop + r, g.playBottom - r), r };
    if (rects && g.rng.chance(0.5)) Object.assign(h, { w: r * 2.2, h: r * 1.5 });
    if (holes.every((o) => Math.hypot(o.x - h.x, o.y - h.y) > o.r + h.r)) holes.push(h);
  }
  return holes;
}

function ensureBumpers(g: Builder, n: number) {
  for (let tries = 0; g.m.bumpers.length < n && tries < 100; tries++)
    g.bumper(g.rng.range(g.b.left, g.b.right), g.rng.range(g.playTop, g.playBottom));
}

/** Grille en quinconce, quelques trous garnis de bumpers ou de tourniquets. */
function classique(g: Builder) {
  const holes = carveHoles(g, g.rng.int(2, 4), 90, 140);
  for (const h of holes) {
    if (g.rng.chance(0.7)) g.bumper(h.x, h.y);
    else g.spinner(h.x, h.y);
  }
  ensureBumpers(g, 2);
  pegGrid(g, g.rng.range(72, 90), g.rng.range(60, 74), (x, y) => holes.some((h) => inHole(h, x, y)));
}

/** Moitié gauche générée puis reflétée : tout élément a son miroir. */
function symetrique(g: Builder) {
  const { rng, cx } = g;
  const half = (cx - g.b.left) * 0.9;
  if (rng.chance(0.5)) g.place([{ kind: 'bumper', x: cx, y: rng.range(g.playTop + 120, g.playBottom - 200), radius: BUMPER_R }]);
  const holes: Hole[] = [];
  for (let tries = 0, want = rng.int(1, 2); holes.length < want && tries < 40; tries++) {
    const r = rng.range(90, 130);
    const h = { x: rng.range(g.b.left + r, cx - r - 30), y: rng.range(g.playTop + r, g.playBottom - r), r };
    if (holes.every((o) => Math.hypot(o.x - h.x, o.y - h.y) > o.r + h.r)) holes.push(h);
  }
  for (const h of holes) {
    if (rng.chance(0.6)) g.sym({ kind: 'bumper', x: h.x, y: h.y, radius: BUMPER_R });
    else g.sym({ kind: 'spinner', x: h.x, y: h.y, radius: SPINNER_R, speed: g.spinnerSpeed() });
  }
  if (rng.chance(0.6)) {
    // paire de rampes en chevron, symétrique
    const x = cx - rng.range(180, half), y = rng.range(g.playTop + 80, g.playBottom - 260);
    g.sym({ kind: 'ramp', x, y, length: rng.range(140, 200), angle: rng.pick([-1, 1]) * rng.range(0.3, 0.5) });
  }
  const mirrored = holes.flatMap((h) => [h, { ...h, x: g.b.left + g.b.right - h.x }]);
  const dx = rng.range(72, 90), dy = rng.range(60, 74);
  for (let row = 0, y = g.playTop + PEG_R + 12; y < g.playBottom - PEG_R; y += dy, row++) {
    for (let x = cx - (row % 2) * (dx / 2); x > g.b.left + MIN_GAP + PEG_R; x -= dx) {
      const px = x + (Math.abs(x - cx) < 1 ? 0 : rng.range(-4, 4)), py = y + rng.range(-4, 4);
      if (!mirrored.some((h) => inHole(h, px, py))) g.sym({ kind: 'peg', x: px, y: py, golden: rng.chance(0.03) });
    }
  }
}

/** Bandes de taquets en diagonale + rampes en zigzag dans la partie haute. */
function diagonale(g: Builder) {
  const { rng } = g;
  const W = g.b.right - g.b.left;
  const rampZone = (g.playBottom - g.playTop) * 0.7; // les rampes restent au-dessus d'une zone de taquets
  const n = rng.int(3, 5);
  for (let i = 0; i < n; i++) {
    const y = g.playTop + 60 + (i + 0.5) * ((rampZone - 60) / n);
    const right = i % 2 === 0;
    const x = g.b.left + W * (right ? rng.range(0.6, 0.78) : rng.range(0.22, 0.4));
    g.ramp(x, y, rng.range(170, 260), (right ? 1 : -1) * rng.range(0.32, 0.5));
  }
  ensureBumpers(g, 2);
  const dx = rng.range(70, 84), dy = rng.range(58, 68);
  const shift = dx * rng.pick([0.3, -0.3]); // décalage par rangée → réseau cisaillé en diagonales
  const lane = rng.int(3, 4); // une diagonale sur `lane` reste vide
  for (let row = 0, y = g.playTop + PEG_R + 12; y < g.playBottom - PEG_R; y += dy, row++) {
    const offset = (((row * shift) % dx) + dx) % dx;
    for (let col = 0, x = g.b.left + MIN_GAP + PEG_R + 4 + offset; x < g.b.right - MIN_GAP - PEG_R; x += dx, col++) {
      if ((col + Math.floor((row * shift) / dx)) % lane === 0) continue;
      g.peg(x + rng.range(-3, 3), y + rng.range(-3, 3));
    }
  }
}

/** Grille dense creusée de zones vides (cercles ou rectangles), garnies au centre. */
function trous(g: Builder) {
  const holes = carveHoles(g, g.rng.int(3, 6), 80, 130, true);
  for (const h of holes) {
    if (g.rng.chance(0.5)) g.bumper(h.x, h.y);
    else g.spinner(h.x, h.y);
  }
  ensureBumpers(g, 2);
  pegGrid(g, g.rng.range(60, 68), g.rng.range(52, 60), (x, y) => holes.some((h) => inHole(h, x, y)));
}

/** Rampes en V qui concentrent les billes vers un tourniquet, entre des rangées de taquets. */
function entonnoirs(g: Builder) {
  const { rng } = g;
  const H = g.playBottom - g.playTop;
  const levels = [g.playTop + H * rng.range(0.18, 0.26), g.playTop + H * rng.range(0.5, 0.58)];
  const gap = MIN_GAP + RAMP_THICK + 10; // ouverture au fond du V
  levels.forEach((yb, level) => {
    const count = level === 0 ? rng.int(1, 2) : rng.int(1, 2);
    for (let k = 0; k < count; k++) {
      const fx = g.b.left + ((k + 0.5) / count) * (g.b.right - g.b.left) + rng.range(-60, 60);
      const L = rng.range(150, 210), a = rng.range(0.42, 0.6);
      const dx = (L / 2) * Math.cos(a), dy = (L / 2) * Math.sin(a);
      const ok = g.place([
        { kind: 'ramp', x: fx - gap / 2 - dx, y: yb - dy, length: L, angle: a },
        { kind: 'ramp', x: fx + gap / 2 + dx, y: yb - dy, length: L, angle: -a },
      ]);
      if (ok) g.spinner(fx, yb + SPINNER_R + MIN_GAP + 12);
    }
  });
  if (!g.m.spinners.length) g.spinner(g.cx, g.playTop + H * 0.4);
  ensureBumpers(g, 2);
  pegGrid(g, rng.range(72, 88), rng.range(60, 72));
}

const GENERATORS: Record<PatternId, (g: Builder) => void> = { classique, symetrique, diagonale, trous, entonnoirs };

export function generateMap(seed: number, pattern?: PatternId, b: Bounds = BOARD_BOUNDS): MapData {
  const rng = new Rng(seed);
  const p = pattern ?? rng.pick(PATTERNS);
  const m: MapData = {
    seed, pattern: p, pegs: [], ramps: [], spinners: [], bumpers: [], bins: makeBins(rng, b, p === 'symetrique'), binTop: b.bottom - BIN_H,
  };
  const g = new Builder(m, b, rng);
  wallGuides(g, p === 'symetrique');
  GENERATORS[p](g);
  return m;
}
