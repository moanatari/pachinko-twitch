// Génération procédurale PURE : seed → éléments du plateau. Aucun import Phaser ici.
import { Rng } from './rng';
import {
  BOARD_W, HEIGHT, WALL, PEG_R, BUMPER_R, SPINNER_R, RAMP_THICK,
  BAR_THICK, BAR_LEN_MIN, BAR_LEN_MAX, BAR_SHARE, BAR_ANGLE_MAX, SPINNER_R_LONG, SPINNER_LONG_SHARE, SPINNER_LONG_SPEED,
  SPAWN_ZONE, BIN_H, BIN_CLEAR, MIN_GAP, SPINNER_SPEED, PEG_VALUES, PEG_SHARE, RARE_PEG_SPACING,
  MOVERS_MIN, MOVERS_MAX, MOVE_LEN_MIN, MOVE_LEN_MAX, MOVE_PERIOD_MIN, MOVE_PERIOD_MAX, MOVE_FLAT_SHARE, MOVE_ANGLE_FLAT, MOVE_ANGLE_MAX, LANE_BAR_LEN, LANE_PERIOD_MS,
} from './config';

export const PATTERNS = ['classique', 'symetrique', 'diagonale', 'trous', 'entonnoirs'] as const;
export type PatternId = (typeof PATTERNS)[number];

export interface Bounds { left: number; right: number; top: number; bottom: number }
export const BOARD_BOUNDS: Bounds = { left: WALL, right: BOARD_W - WALL, top: 0, bottom: HEIGHT };

export type PegValue = (typeof PEG_VALUES)[number];
export interface Peg { x: number; y: number; value: PegValue } // valeur tirée après la pose (pegValues)
export interface Ramp { x: number; y: number; length: number; angle: number } // centre, angle en rad
export interface Move { x2: number; y2: number; periodMs: number; phase: number } // aller-retour (x,y) ↔ (x2,y2), phase ∈ [0, 1)
export interface Bar { x: number; y: number; length: number; angle: number; move?: Move } // mobile : glisse dans son axe
export interface Spinner { x: number; y: number; radius: number; speed: number; move?: Move } // speed en rad/step, signe = sens
export interface Bumper { x: number; y: number; radius: number; move?: Move }
export interface Bin { x: number; width: number; points: number } // x = bord gauche
export interface MapData {
  seed: number;
  pattern: PatternId;
  pegs: Peg[];
  ramps: Ramp[];
  spinners: Spinner[];
  bumpers: Bumper[];
  bars: Bar[];
  bins: Bin[];
  binTop: number;
  laneTop?: number; // haut de l'élément du couloir du bas, absent = pas de couloir
}

export const RAMP_MIN_ANGLE = 0.25; // rad : en dessous, la bille s'arrête sur la rampe

// --- Géométrie : tout obstacle est une capsule (segment épaissi) ; un cercle = segment de longueur 0 ---
interface Shape { x1: number; y1: number; x2: number; y2: number; r: number; name: string }

const circle = (x: number, y: number, r: number, name: string): Shape => ({ x1: x, y1: y, x2: x, y2: y, r, name });
const segment = (x: number, y: number, length: number, angle: number, r: number, name: string): Shape => {
  const dx = (Math.cos(angle) * length) / 2, dy = (Math.sin(angle) * length) / 2;
  return { x1: x - dx, y1: y - dy, x2: x + dx, y2: y + dy, r, name };
};
const rampShape = (p: Ramp) => segment(p.x, p.y, p.length, p.angle, RAMP_THICK / 2, 'rampe');
/** Cercle immobile, ou capsule balayée sur tout son trajet s'il est mobile. */
const sweep = (p: { x: number; y: number; move?: Move }, r: number, name: string): Shape =>
  ({ x1: p.x, y1: p.y, x2: p.move?.x2 ?? p.x, y2: p.move?.y2 ?? p.y, r, name });

/** Barre : segment. Mobile, elle glisse dans son axe : la zone balayée reste un segment, du bout le plus
 *  en arrière de la position de départ au bout le plus en avant de la position d'arrivée. */
const barShape = (p: Bar): Shape => {
  const s = segment(p.x, p.y, p.length, p.angle, BAR_THICK / 2, 'barre');
  if (!p.move) return s;
  const e = segment(p.move.x2, p.move.y2, p.length, p.angle, BAR_THICK / 2, 'barre');
  const c = Math.cos(p.angle), sn = Math.sin(p.angle);
  const pts = [[s.x1, s.y1], [s.x2, s.y2], [e.x1, e.y1], [e.x2, e.y2]]
    .sort((a, b) => a[0] * c + a[1] * sn - (b[0] * c + b[1] * sn));
  return { x1: pts[0][0], y1: pts[0][1], x2: pts[3][0], y2: pts[3][1], r: BAR_THICK / 2, name: 'barre' };
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
    ...m.bumpers.map((p) => sweep(p, p.radius, 'bumper')),
    ...m.spinners.map((p) => sweep(p, p.radius, 'tourniquet')), // rayon de balayage complet
    ...m.ramps.map(rampShape),
    ...m.bars.map(barShape),
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
  for (const r of m.bars)
    if (r.move && Math.abs(Math.sin(Math.atan2(r.move.y2 - r.y, r.move.x2 - r.x) - r.angle)) > 1e-6)
      errors.push('barre mobile hors de son axe');

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
  | ({ kind: 'bar' } & Bar)
  | ({ kind: 'ramp' } & Ramp);

const shapeOf = (s: Spec): Shape =>
  s.kind === 'peg' ? circle(s.x, s.y, PEG_R, 'taquet')
    : s.kind === 'bumper' ? sweep(s, s.radius, 'bumper')
    : s.kind === 'spinner' ? sweep(s, s.radius, 'tourniquet') // rayon de balayage complet
    : s.kind === 'bar' ? barShape(s)
    : rampShape(s);

class Builder {
  readonly shapes: Shape[] = [];
  constructor(readonly m: MapData, readonly b: Bounds, readonly rng: Rng) {}

  private deferred: Spec[][] | null = null; // taquets du motif, posés après les mobiles

  /** Pose tous les éléments, ou aucun si l'un d'eux viole une règle (paires symétriques). */
  place(specs: Spec[]): boolean {
    if (this.deferred && specs.every((s) => s.kind === 'peg')) {
      this.deferred.push(specs);
      return true;
    }
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
      else if (kind === 'bar') this.m.bars.push(e as Bar);
      else this.m.ramps.push(e as Ramp);
    }
    return true;
  }

  /** Le motif pose sa structure maintenant ; ses taquets attendent `flushPegs` (les mobiles passent avant eux). */
  deferPegs() { this.deferred = []; }

  flushPegs() {
    const specs = this.deferred ?? [];
    this.deferred = null;
    for (const s of specs) this.place(s);
  }

  peg(x: number, y: number) { return this.place([{ kind: 'peg', x, y, value: 1 }]); }
  bumper(x: number, y: number, radius = BUMPER_R) { return this.place([{ kind: 'bumper', x, y, radius }]); }
  spinner(x: number, y: number, radius = this.spinnerRadius()) {
    return this.place([{ kind: 'spinner', x, y, radius, speed: this.spinnerSpeed(radius) }]);
  }
  ramp(x: number, y: number, length: number, angle: number) { return this.place([{ kind: 'ramp', x, y, length, angle }]); }

  spinnerRadius() { return this.rng.chance(SPINNER_LONG_SHARE) ? SPINNER_R_LONG : SPINNER_R; }

  spinnerSpeed(radius = SPINNER_R) {
    return this.rng.pick([-1, 1]) * SPINNER_SPEED * this.rng.range(0.7, 1.3) * (radius > SPINNER_R ? SPINNER_LONG_SPEED : 1);
  }

  /** Bumper rond ou, une fois sur trois, barre bumper. */
  bumperSpec(x: number, y: number): Spec {
    return this.rng.chance(BAR_SHARE)
      ? { kind: 'bar', x, y, length: this.rng.range(BAR_LEN_MIN, BAR_LEN_MAX), angle: this.rng.range(-BAR_ANGLE_MAX, BAR_ANGLE_MAX) }
      : { kind: 'bumper', x, y, radius: BUMPER_R };
  }

  get cx() { return (this.b.left + this.b.right) / 2; }

  /** Image miroir par rapport à l'axe vertical central (rampes, barres, tourniquets et trajets inversés). */
  mirror(s: Spec): Spec {
    const mx = (x: number) => this.b.left + this.b.right - x;
    if (s.kind === 'ramp') return { ...s, x: mx(s.x), angle: -s.angle };
    if (s.kind === 'peg') return { ...s, x: mx(s.x) };
    const mv = s.move && { move: { ...s.move, x2: mx(s.move.x2) } };
    if (s.kind === 'spinner') return { ...s, ...mv, x: mx(s.x), speed: -s.speed };
    if (s.kind === 'bar') return { ...s, ...mv, x: mx(s.x), angle: -s.angle };
    return { ...s, ...mv, x: mx(s.x) };
  }

  /** Pose l'élément et son miroir ; sur l'axe central, un seul élément (pas de doublon superposé). */
  sym(s: Spec) {
    return Math.abs(s.x - this.cx) < 1 ? this.place([{ ...s, x: this.cx }]) : this.place([s, this.mirror(s)]);
  }

  /** Zone jouable verticale (hors spawn et bande des bacs). */
  get playTop() { return this.b.top + SPAWN_ZONE; }
  get playBottom() { return this.m.laneTop !== undefined ? this.m.laneTop - MIN_GAP : this.m.binTop - BIN_CLEAR; }
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

/** Décalages k de la bande des valeurs (valeur i → bac (i + k) % n) qui gardent le jackpot loin des bords. Contient 0. */
export function binShifts(points: readonly number[]): number[] {
  const n = points.length, j = points.indexOf(Math.max(...points));
  return Array.from({ length: n }, (_, k) => k).filter((k) => (j + k) % n !== 0 && (j + k) % n !== n - 1);
}

/** Couloir du bas : deux bumpers ou deux barres en miroir, un par moitié, en aller-retour du mur au centre
 *  juste au-dessus de la bande des bacs (jamais d'hélice). La zone de jeu remonte au-dessus d'eux. */
function lane(g: Builder) {
  const { rng, b } = g;
  const kind = rng.pick(['bumper', 'bar'] as const);
  const r = kind === 'bumper' ? BUMPER_R : BAR_THICK / 2; // demi-hauteur
  const half = kind === 'bar' ? LANE_BAR_LEN / 2 + r : r; // demi-largeur, bouts arrondis compris
  const y = g.m.binTop - BIN_CLEAR - r - 1;
  const x = b.left + MIN_GAP + half + 1;
  const x2 = g.cx - MIN_GAP / 2 - half - 1;
  const move: Move = { x2, y2: y, periodMs: LANE_PERIOD_MS, phase: rng.next() };
  const spec: Spec = kind === 'bumper' ? { kind, x, y, radius: r, move } : { kind, x, y, length: LANE_BAR_LEN, angle: 0, move };
  if (g.place([spec, g.mirror(spec)])) g.m.laneTop = y - r;
}

/** Déflecteurs collés aux murs, en quinconce : pas de couloir libre le long des bords. */
function wallGuides(g: Builder, symmetric: boolean) {
  const r = RAMP_THICK / 2;
  for (const side of symmetric ? ['left'] : ['left', 'right']) {
    for (let y = g.playTop + (side === 'left' ? 50 : 140); y < g.playBottom - 40; y += g.rng.range(170, 210)) {
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
  // le bumper du couloir (mobile) ne compte pas : il est sous la zone de jeu
  for (let tries = 0; g.m.bumpers.filter((k) => !k.move).length < n && tries < 100; tries++)
    g.bumper(g.rng.range(g.b.left, g.b.right), g.rng.range(g.playTop, g.playBottom));
}

/** Grille en quinconce, quelques trous garnis de bumpers ou de tourniquets. */
function classique(g: Builder) {
  const holes = carveHoles(g, g.rng.int(2, 4), 90, 140);
  for (const h of holes) {
    if (g.rng.chance(0.7)) g.place([g.bumperSpec(h.x, h.y)]);
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
    if (rng.chance(0.6)) g.sym(g.bumperSpec(h.x, h.y));
    else {
      const radius = g.spinnerRadius();
      g.sym({ kind: 'spinner', x: h.x, y: h.y, radius, speed: g.spinnerSpeed(radius) });
    }
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
      if (!mirrored.some((h) => inHole(h, px, py))) g.sym({ kind: 'peg', x: px, y: py, value: 1 });
    }
  }
}

/** Bandes de taquets en diagonale + rampes en zigzag dans la partie haute. */
function diagonale(g: Builder) {
  const { rng } = g;
  const W = g.b.right - g.b.left;
  const rampZone = (g.playBottom - g.playTop) * 0.6; // les rampes restent au-dessus d'une zone de taquets (réduite par le couloir)
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
    if (g.rng.chance(0.5)) g.place([g.bumperSpec(h.x, h.y)]);
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
      const radius = g.spinnerRadius();
      const L = rng.range(150, 210), a = rng.range(0.42, 0.6);
      const dx = (L / 2) * Math.cos(a), dy = (L / 2) * Math.sin(a);
      const ok = g.place([
        { kind: 'ramp', x: fx - gap / 2 - dx, y: yb - dy, length: L, angle: a },
        { kind: 'ramp', x: fx + gap / 2 + dx, y: yb - dy, length: L, angle: -a },
      ]);
      if (ok) g.spinner(fx, yb + radius + MIN_GAP + 12, radius);
    }
  });
  if (!g.m.spinners.length) g.spinner(g.cx, g.playTop + H * 0.4, SPINNER_R);
  ensureBumpers(g, 2);
  pegGrid(g, rng.range(72, 88), rng.range(60, 72));
}

/** Bumpers, barres et hélices en aller-retour, posés après la structure du motif et avant ses taquets :
 *  tout leur trajet est interdit aux taquets. En symétrique, paires miroir hors de l'axe. */
function movers(g: Builder, symmetric: boolean) {
  const { rng, b } = g;
  const want = symmetric ? 2 * rng.int(MOVERS_MIN / 2, MOVERS_MAX / 2) : rng.int(MOVERS_MIN, MOVERS_MAX);
  for (let tries = 0, placed = 0; placed < want && tries < 600; tries++) {
    const len = rng.range(MOVE_LEN_MIN, MOVE_LEN_MAX);
    const a = rng.chance(MOVE_FLAT_SHARE) ? rng.range(-MOVE_ANGLE_FLAT, MOVE_ANGLE_FLAT) : rng.range(-MOVE_ANGLE_MAX, MOVE_ANGLE_MAX);
    const x = rng.range(b.left, symmetric ? g.cx : b.right), y = rng.range(g.playTop, g.playBottom);
    const move: Move = {
      x2: x + Math.cos(a) * len, y2: y + Math.sin(a) * len,
      periodMs: rng.range(MOVE_PERIOD_MIN, MOVE_PERIOD_MAX), phase: rng.next(),
    };
    const kind = rng.pick(['bumper', 'bar', 'spinner'] as const);
    const radius = kind === 'spinner' ? g.spinnerRadius() : BUMPER_R;
    const spec: Spec = kind === 'bumper' ? { kind, x, y, radius, move }
      : kind === 'bar' ? { kind, x, y, length: rng.range(BAR_LEN_MIN, BAR_LEN_MAX), angle: a, move } // glisse dans son axe
        : { kind, x, y, radius, speed: g.spinnerSpeed(radius), move };
    if (symmetric ? g.place([spec, g.mirror(spec)]) : g.place([spec])) placed += symmetric ? 2 : 1;
  }
}

/** Valeurs tirées après la pose, en nombres fixes : un seul 50 par carte, taquets à 30 et 50 espacés.
 *  En symétrique, on tire des « unités » (taquet de l'axe ou paire miroir) : les valeurs restent en miroir. */
function pegValues(g: Builder, symmetric: boolean) {
  const { m, rng } = g;
  const near = (a: number, c: number) => Math.abs(a - c) < 0.5;
  const mx = (x: number) => g.b.left + g.b.right - x;
  const units: Peg[][] = symmetric
    ? m.pegs.filter((p) => p.x < g.cx + 0.5).flatMap((p) => {
      if (near(p.x, g.cx)) return [[p]];
      const q = m.pegs.find((o) => near(o.x, mx(p.x)) && near(o.y, p.y));
      return q ? [[p, q]] : [];
    })
    : m.pegs.map((p) => [p]);
  // axe vide (bumper central, trous) : un taquet posé sur l'axe pour porter le 50
  for (let tries = 0; symmetric && !units.some((u) => u.length === 1) && tries < 60; tries++)
    if (g.place([{ kind: 'peg', x: g.cx, y: rng.range(g.playTop, g.playBottom), value: 1 }])) units.push([m.pegs[m.pegs.length - 1]]);
  for (let i = units.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [units[i], units[j]] = [units[j], units[i]];
  }
  const rare: Peg[] = [];
  const spaced = (u: Peg[]) => u.every((p) =>
    [...rare, ...u].every((q) => q === p || Math.hypot(p.x - q.x, p.y - q.y) >= RARE_PEG_SPACING));
  const take = (value: PegValue, count: number, ok: (u: Peg[]) => boolean) => {
    for (let i = 0, n = 0; i < units.length && n < count; i++) {
      const u = units[i];
      if (u[0].value !== 1 || !ok(u)) continue;
      for (const p of u) p.value = value;
      n += u.length;
      if (value >= 30) rare.push(...u);
    }
  };
  const n = m.pegs.length;
  take(50, 1, (u) => u.length === 1);
  take(30, Math.max(1, Math.round(n * PEG_SHARE[30])), spaced);
  take(10, Math.round(n * PEG_SHARE[10]), () => true);
  take(5, Math.round(n * PEG_SHARE[5]), () => true);
}

const GENERATORS: Record<PatternId, (g: Builder) => void> = { classique, symetrique, diagonale, trous, entonnoirs };

export function generateMap(seed: number, pattern?: PatternId, b: Bounds = BOARD_BOUNDS, opts: { lane?: boolean } = {}): MapData {
  const rng = new Rng(seed);
  const p = pattern ?? rng.pick(PATTERNS);
  const m: MapData = {
    seed, pattern: p, pegs: [], ramps: [], spinners: [], bumpers: [], bars: [], bins: makeBins(rng, b, p === 'symetrique'), binTop: b.bottom - BIN_H,
  };
  const g = new Builder(m, b, rng);
  const symmetric = p === 'symetrique';
  if (opts.lane ?? true) lane(g);
  wallGuides(g, symmetric);
  g.deferPegs();
  GENERATORS[p](g);
  movers(g, symmetric);
  g.flushPegs();
  pegValues(g, symmetric);
  return m;
}
