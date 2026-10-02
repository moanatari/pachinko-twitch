export interface Palette {
  background: string;
  frame: string;
  marquee: string[]; // couleurs des ampoules du cadre
  peg: string;
  pegGolden: string;
  bumperRing: string;
  bumperCore: string;
  spinner: string;
  ramp: string;
  bins: string[];
  binHighlight: string;
  text: string;
  accent: string;
  ballRim: string | null; // null = couleur du viewer
}

export type DrawFn = (ctx: CanvasRenderingContext2D, w: number, h: number, palette: Palette) => void;
export type SpriteSource = string | DrawFn; // chemin d'image dans public/ ou fonction de dessin

export type ElementKey = 'peg' | 'pegGolden' | 'bumper' | 'spinner' | 'ramp' | 'background';
export type ParticleKey = 'hit' | 'bumper' | 'bin' | 'confetti';

export interface Ambient {
  sprite: SpriteSource;
  count: number;
  speed: number;
  drift: number;
  spin: number;
  direction: 'down' | 'up' | 'across';
}

export interface Theme {
  id: string;
  extends?: string;
  period?: { from: string; to: string }; // 'MM-DD' inclusif, peut chevaucher l'année
  priority?: number;
  palette: Palette;
  sprites: Partial<Record<ElementKey, SpriteSource>>;
  particles: Record<ParticleKey, SpriteSource | null>;
  ambient: Ambient | null;
  font: { family: string; url: string };
  texts: { podiumTitle: string; watermark?: string };
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...a: never[]) => unknown ? T[K]
    : T[K] extends object ? DeepPartial<T[K]> : T[K];
};
export type ThemeDef = DeepPartial<Theme> & { id: string; extends?: string };
