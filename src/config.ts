import { mergeSettings, loadSettings, clampInt, DEFAULT_SETTINGS, type Settings } from './settings';
import { safeStorage } from './storage';

/** Réglages (menu, sauvegardés, surchargés par l'URL) + paramètres d'URL réservés au dev.
 *  Objet MUTABLE : `Game.applySettings` le met à jour à chaud, le code le relit à chaque usage. */
export interface Params extends Settings {
  seed: number | null;
  debug: boolean;
  bots: number;
  date: string | null;
  pattern: string | null;
  menu: boolean; // `menu=0` : lien pour OBS, aucun menu (une source navigateur n'est pas cliquable)
}

export function parseParams(search: string, saved: unknown = DEFAULT_SETTINGS): Params {
  const q = new URLSearchParams(search);
  const debug = q.get('debug') === '1';
  const seed = parseInt(q.get('seed') ?? '', 10);
  return {
    ...mergeSettings(DEFAULT_SETTINGS, saved, search),
    seed: Number.isFinite(seed) ? seed : null,
    debug,
    bots: debug ? clampInt(q.get('bots'), 0, 0, 500) : 0,
    date: q.get('date') || null,
    pattern: q.get('pattern') || null,
    menu: q.get('menu') !== '0',
  };
}

// --- Écran ---
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const BOARD_W = 1440;
export const PANEL_W = WIDTH - BOARD_W;

// --- Plateau (px) ---
export const WALL = 24; // épaisseur du cadre
export const BALL_R = 16; // 32 px : avatar reconnaissable
export const PEG_R = 7;
export const BUMPER_R = 26;
export const SPINNER_R = 46; // demi-longueur d'un bras
export const SPINNER_ARM = 10; // épaisseur des bras
export const RAMP_THICK = 12;
export const SPAWN_ZONE = 120; // bande libre en haut
export const BIN_H = 110; // hauteur des bacs
export const BIN_CLEAR = 70; // bande libre au-dessus des bacs
export const MIN_GAP = 2.4 * BALL_R; // espace libre minimal entre deux obstacles

// --- Points ---
export const PTS_PEG_GOLDEN = 10; // pluie d'or : valeur minimale de tout taquet
export const PEG_VALUES = [1, 5, 10, 30, 50] as const;
export const PEG_SHARE = { 5: 0.07, 10: 0.03, 30: 0.01 } as const; // part des taquets par palier ; un seul 50 par carte
export const RARE_PEG_SPACING = 200; // px minimum entre deux taquets à 30 ou 50
export const PTS_SPINNER = 3;
export const PTS_BUMPER = 5;
export const HIT_COOLDOWN_MS = 150;
export const BIG_WIN = 200; // seuil « gros bac » (marquee + shake)

// --- Physique ---
export const GRAVITY_Y = 1;
export const MAX_SPEED = 22; // px / step
export const BUMPER_SPEED = 14;
export const SPINNER_SPEED = 0.03; // rad / step
export const STUCK_SPEED = 0.3;
export const STUCK_NUDGE_MS = 3000;
export const STUCK_KILL_MS = 8000;

// --- Taquets spéciaux ---
export const SPECIAL_TTL_MS = 20000; // non touché : il s'éteint
export const MOON_GRAVITY = 0.3; // fraction de la gravité normale
export const MOON_MS = 6000;
export const SLOW_SCALE = 0.4; // vitesse des billes ralenties
export const SLOW_MS = 5000;
export const X2_MS = 10000;
export const GOLD_MS = 8000;
export const QUAKE_KICK = 9; // px / step vers le haut

// --- Partie ---
export const PODIUM_MS = 15000;

export const params = parseParams(typeof location === 'undefined' ? '' : location.search, loadSettings(safeStorage()));
