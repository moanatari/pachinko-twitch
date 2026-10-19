// Thème → textures aux clés fixes. Les scènes n'utilisent QUE ces clés, jamais le thème lui-même.
import Phaser from 'phaser';
import type { Theme, SpriteSource, DrawFn } from './types';
import * as D from './draw';
import type { PegValue } from '../mapgen';
import { KANJI_FONT } from './base';
import { PEG_R, BUMPER_R, SPINNER_R, BALL_R, RAMP_THICK, BAR_THICK, SPINNER_R_LONG, BOARD_W, HEIGHT } from '../config';

export const TEX_SCALE = 2; // textures dessinées à 2× puis réduites (net en 1080p)

const square = (r: number): [number, number] => [r * 2 * TEX_SCALE, r * 2 * TEX_SCALE];
const SIZES: Record<string, [number, number]> = {
  peg: square(PEG_R),
  pegGolden: square(PEG_R),
  peg5: square(PEG_R), peg30: square(PEG_R), peg50: square(PEG_R),
  pegSpecial: square(PEG_R),
  bumper: square(BUMPER_R),
  spinner: square(SPINNER_R),
  spinnerLong: square(SPINNER_R_LONG),
  bar: [256, BAR_THICK * TEX_SCALE], // étirée à la longueur de chaque barre
  ramp: [256, RAMP_THICK * TEX_SCALE], // étirée à la longueur de chaque rampe
  background: [BOARD_W, HEIGHT],
  ball: square(BALL_R),
  'fx-hit': [32, 32],
  'fx-bumper': [32, 32],
  'fx-bin': [32, 32],
  'fx-confetti': [32, 32],
  'fx-ring': [128, 128],
  'fx-glow': [32, 32], // lumière (ampoules, halos, traînées) : jamais remplacée par un thème
  ambient: [48, 48],
};

const DEFAULTS: Record<string, DrawFn> = {
  peg: D.drawPeg,
  pegGolden: D.drawPegGolden,
  peg5: D.drawPegChrome, peg30: D.drawPegRed, peg50: D.drawPegBright,
  pegSpecial: D.drawPegSpecial,
  bumper: D.drawBumper,
  spinner: D.drawSpinner,
  spinnerLong: D.drawSpinnerLong, bar: D.drawBar,
  ramp: D.drawRamp,
  background: D.drawBackground,
  ball: D.drawBall,
  'fx-hit': D.drawSpark,
  'fx-bumper': D.drawSpark,
  'fx-bin': D.drawSpark,
  'fx-confetti': D.drawConfetti,
  'fx-ring': D.drawRing,
  'fx-glow': D.drawSpark,
  ambient: D.drawSpark,
};

/** Texture de chaque palier de taquet (le 10 garde l'ancienne clé du taquet doré). */
export const PEG_TEX: Record<PegValue, string> = { 1: 'peg', 5: 'peg5', 10: 'pegGolden', 30: 'peg30', 50: 'peg50' };

export async function applyTheme(scene: Phaser.Scene, theme: Theme): Promise<void> {
  const sources: Record<string, SpriteSource | null | undefined> = {
    ...theme.sprites,
    'fx-hit': theme.particles.hit,
    'fx-bumper': theme.particles.bumper,
    'fx-bin': theme.particles.bin,
    'fx-confetti': theme.particles.confetti,
    ambient: theme.ambient?.sprite,
  };
  const images: [string, string][] = [];
  for (const [key, [w, h]] of Object.entries(SIZES)) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    // hélice longue : reprend l'hélice du thème s'il en dessine une (étoile de mer de Plage)
    const src = sources[key] ?? (key === 'spinnerLong' ? sources.spinner : null) ?? DEFAULTS[key];
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
  await Promise.all([loadFont(theme.font.family, theme.font.url), loadFont(KANJI_FONT.family, KANJI_FONT.url)]);
  makeDigits(scene, theme.font.family);
}

const DIGITS = '+0123456789';
const DIGIT_W = 48, DIGIT_H = 64;

/** Police bitmap des pop-ups, dessinée avec la police du thème (déjà chargée) : clé 'digits'. */
function makeDigits(scene: Phaser.Scene, family: string) {
  const canvas = document.createElement('canvas');
  canvas.width = DIGIT_W * DIGITS.length;
  canvas.height = DIGIT_H;
  const ctx = canvas.getContext('2d')!;
  ctx.font = `52px "${family}", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)'; // contour : lisible sur n'importe quel fond
  ctx.fillStyle = '#ffffff'; // blanc : teinté à l'usage
  [...DIGITS].forEach((ch, i) => {
    const x = i * DIGIT_W + DIGIT_W / 2;
    ctx.strokeText(ch, x, DIGIT_H / 2 + 2);
    ctx.fillText(ch, x, DIGIT_H / 2 + 2);
  });
  if (scene.textures.exists('digits')) scene.textures.remove('digits');
  scene.textures.addCanvas('digits', canvas);
  const font = Phaser.GameObjects.RetroFont.Parse(scene, {
    image: 'digits', width: DIGIT_W, height: DIGIT_H, chars: DIGITS, charsPerRow: DIGITS.length,
    'offset.x': 0, 'offset.y': 0, 'spacing.x': 0, 'spacing.y': 0, lineSpacing: 0,
  });
  if (scene.cache.bitmapFont.exists('digits')) scene.cache.bitmapFont.remove('digits');
  scene.cache.bitmapFont.add('digits', font);
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
