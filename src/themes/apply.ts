// Thème → textures aux clés fixes. Les scènes n'utilisent QUE ces clés, jamais le thème lui-même.
import type Phaser from 'phaser';
import type { Theme, SpriteSource, DrawFn } from './types';
import * as D from './draw';
import { PEG_R, BUMPER_R, SPINNER_R, BALL_R, RAMP_THICK, BOARD_W, HEIGHT } from '../config';

export const TEX_SCALE = 2; // textures dessinées à 2× puis réduites (net en 1080p)

const square = (r: number): [number, number] => [r * 2 * TEX_SCALE, r * 2 * TEX_SCALE];
const SIZES: Record<string, [number, number]> = {
  peg: square(PEG_R),
  pegGolden: square(PEG_R),
  bumper: square(BUMPER_R),
  spinner: square(SPINNER_R),
  ramp: [256, RAMP_THICK * TEX_SCALE], // étirée à la longueur de chaque rampe
  background: [BOARD_W, HEIGHT],
  ball: square(BALL_R),
  'fx-hit': [32, 32],
  'fx-bumper': [32, 32],
  'fx-bin': [32, 32],
  'fx-confetti': [32, 32],
};

const DEFAULTS: Record<string, DrawFn> = {
  peg: D.drawPeg,
  pegGolden: D.drawPegGolden,
  bumper: D.drawBumper,
  spinner: D.drawSpinner,
  ramp: D.drawRamp,
  background: D.drawBackground,
  ball: D.drawBall,
  'fx-hit': D.drawSpark,
  'fx-bumper': D.drawSpark,
  'fx-bin': D.drawSpark,
  'fx-confetti': D.drawConfetti,
};

export async function applyTheme(scene: Phaser.Scene, theme: Theme): Promise<void> {
  const sources: Record<string, SpriteSource | null | undefined> = {
    ...theme.sprites,
    'fx-hit': theme.particles.hit,
    'fx-bumper': theme.particles.bumper,
    'fx-bin': theme.particles.bin,
    'fx-confetti': theme.particles.confetti,
  };
  const images: [string, string][] = [];
  for (const [key, [w, h]] of Object.entries(SIZES)) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const src = sources[key] ?? DEFAULTS[key];
    if (typeof src === 'string') {
      images.push([key, src]);
      continue;
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    src(canvas.getContext('2d')!, w, h, theme.palette);
    scene.textures.addCanvas(key, canvas);
  }
  if (images.length) {
    await new Promise<void>((resolve) => {
      for (const [k, url] of images) scene.load.image(k, url);
      scene.load.once('complete', () => resolve());
      scene.load.start();
    });
  }
  await loadFont(theme.font.family, theme.font.url);
}

async function loadFont(family: string, url: string) {
  if ([...document.fonts].some((f) => f.family === family)) return;
  try {
    const face = new FontFace(family, `url(${url})`);
    await face.load();
    document.fonts.add(face);
  } catch (e) {
    console.warn(`Police ${family} indisponible, police par défaut utilisée`, e);
  }
}
