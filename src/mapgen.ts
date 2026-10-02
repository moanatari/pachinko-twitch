// Génération procédurale PURE : seed → éléments du plateau. Aucun import Phaser ici.
import { Rng } from './rng';
import {
  BOARD_W, HEIGHT, WALL, PEG_R, BUMPER_R, SPINNER_R, RAMP_THICK,
  SPAWN_ZONE, BIN_H, BIN_CLEAR, MIN_GAP, SPINNER_SPEED,
} from './config';

export const PATTERNS = ['classique'] as const;
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
const BIN_VALUES = [10, 25, 50, 100, 250, 500];

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
  if (e.minX - b.left < MIN_GAP || b.right - e.maxX < MIN_GAP) return `${s.name} trop près d'un mur`;
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
class Builder {
  readonly shapes: Shape[] = [];
  constructor(readonly m: MapData, readonly b: Bounds, readonly rng: Rng) {}

  private add(s: Shape): boolean {
    if (placementError(s, this.b, this.m.binTop)) return false;
    if (this.shapes.some((o) => tooClose(o, s))) return false;
    this.shapes.push(s);
    return true;
  }

  peg(x: number, y: number, golden = this.rng.chance(0.03)) {
    if (this.add(circle(x, y, PEG_R, 'taquet'))) this.m.pegs.push({ x, y, golden });
  }
  bumper(x: number, y: number, radius = BUMPER_R): boolean {
    if (!this.add(circle(x, y, radius, 'bumper'))) return false;
    this.m.bumpers.push({ x, y, radius });
    return true;
  }
  spinner(x: number, y: number, radius = SPINNER_R): boolean {
    if (!this.add(circle(x, y, radius, 'tourniquet'))) return false;
    const speed = this.rng.pick([-1, 1]) * SPINNER_SPEED * this.rng.range(0.7, 1.3);
    this.m.spinners.push({ x, y, radius, speed });
    return true;
  }
  ramp(x: number, y: number, length: number, angle: number): boolean {
    const r = { x, y, length, angle };
    if (Math.abs(angle) < RAMP_MIN_ANGLE || !this.add(rampShape(r))) return false;
    this.m.ramps.push(r);
    return true;
  }

  /** Zone jouable verticale (hors spawn et bande des bacs). */
  get playTop() { return this.b.top + SPAWN_ZONE; }
  get playBottom() { return this.m.binTop - BIN_CLEAR; }
}

function makeBins(rng: Rng, b: Bounds): Bin[] {
  const count = rng.pick([7, 9, 11]);
  const width = (b.right - b.left) / count;
  const mid = (count - 1) / 2;
  return Array.from({ length: count }, (_, i) => ({
    x: b.left + i * width,
    width,
    // les bords, plus durs à atteindre, rapportent le plus
    points: BIN_VALUES[Math.round((Math.abs(i - mid) / mid) * (BIN_VALUES.length - 1))],
  }));
}

/** Grille en quinconce, en sautant les zones `skip`. */
function pegGrid(g: Builder, dx: number, dy: number, skip: (x: number, y: number) => boolean = () => false) {
  const { left, right } = g.b;
  const jitter = () => g.rng.range(-4, 4);
  for (let row = 0, y = g.playTop + PEG_R + 12; y < g.playBottom - PEG_R; y += dy, row++)
    for (let x = left + MIN_GAP + PEG_R + 4 + (row % 2) * (dx / 2); x < right - MIN_GAP - PEG_R; x += dx)
      if (!skip(x, y)) g.peg(x + jitter(), y + jitter());
}

function classique(g: Builder) {
  const { rng } = g;
  const holes: { x: number; y: number; r: number }[] = [];
  for (let tries = 0, want = rng.int(2, 4); holes.length < want && tries < 50; tries++) {
    const r = rng.range(90, 140);
    const h = { x: rng.range(g.b.left + r, g.b.right - r), y: rng.range(g.playTop + r, g.playBottom - r), r };
    if (holes.every((o) => Math.hypot(o.x - h.x, o.y - h.y) > o.r + h.r)) holes.push(h);
  }
  for (const h of holes) {
    if (rng.chance(0.7)) g.bumper(h.x, h.y);
    else g.spinner(h.x, h.y);
  }
  for (let tries = 0; g.m.bumpers.length < 2 && tries < 100; tries++)
    g.bumper(rng.range(g.b.left, g.b.right), rng.range(g.playTop, g.playBottom));

  pegGrid(g, rng.range(72, 90), rng.range(60, 74), (x, y) => holes.some((h) => Math.hypot(h.x - x, h.y - y) < h.r));
}

const GENERATORS: Record<PatternId, (g: Builder) => void> = { classique };

export function generateMap(seed: number, pattern?: PatternId, b: Bounds = BOARD_BOUNDS): MapData {
  const rng = new Rng(seed);
  const p = pattern ?? rng.pick(PATTERNS);
  const m: MapData = {
    seed, pattern: p, pegs: [], ramps: [], spinners: [], bumpers: [], bins: makeBins(rng, b), binTop: b.bottom - BIN_H,
  };
  GENERATORS[p](new Builder(m, b, rng));
  return m;
}
