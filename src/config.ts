export interface Params {
  channel: string | null;
  duration: number; // minutes
  maxBalls: number;
  seed: number | null;
  shake: boolean;
  debug: boolean;
  bots: number;
  theme: string | null;
  date: string | null;
  pattern: string | null;
}

const clampInt = (raw: string | null, def: number, min: number, max: number) => {
  const n = raw === null ? NaN : parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

export function parseParams(search: string): Params {
  const q = new URLSearchParams(search);
  const debug = q.get('debug') === '1';
  const seed = parseInt(q.get('seed') ?? '', 10);
  return {
    channel: q.get('channel')?.trim().toLowerCase() || null,
    duration: clampInt(q.get('duration'), 5, 1, 60),
    maxBalls: clampInt(q.get('maxBalls'), 150, 1, 500),
    seed: Number.isFinite(seed) ? seed : null,
    shake: q.get('shake') !== '0',
    debug,
    bots: debug ? clampInt(q.get('bots'), 0, 0, 500) : 0,
    theme: q.get('theme') || null,
    date: q.get('date') || null,
    pattern: q.get('pattern') || null,
  };
}

// --- Écran ---
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const BOARD_W = 1440;
export const PANEL_W = WIDTH - BOARD_W;

// --- Plateau (px) ---
export const WALL = 24; // épaisseur du cadre
export const BALL_R = 14;
export const PEG_R = 7;
export const BUMPER_R = 26;
export const SPINNER_R = 46; // demi-longueur d'un bras
export const RAMP_THICK = 12;
export const SPAWN_ZONE = 120; // bande libre en haut
export const BIN_H = 110; // hauteur des bacs
export const BIN_CLEAR = 70; // bande libre au-dessus des bacs
export const MIN_GAP = 2.4 * BALL_R; // espace libre minimal entre deux obstacles

// --- Points ---
export const PTS_PEG = 1;
export const PTS_PEG_GOLDEN = 10;
export const PTS_SPINNER = 3;
export const PTS_BUMPER = 5;
export const HIT_COOLDOWN_MS = 150;
export const BIG_WIN = 200; // seuil « gros bac » (marquee + shake)

// --- Physique ---
export const MAX_SPEED = 22; // px / step
export const BUMPER_SPEED = 14;
export const SPINNER_SPEED = 0.03; // rad / step
export const STUCK_SPEED = 0.3;
export const STUCK_NUDGE_MS = 3000;
export const STUCK_KILL_MS = 8000;

// --- Partie ---
export const PODIUM_MS = 15000;

export const params = parseParams(typeof location === 'undefined' ? '' : location.search);
