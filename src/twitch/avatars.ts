// Textures de billes par viewer : une par utilisateur, créée une fois, réutilisée à chaque relance.
import type Phaser from 'phaser';
import { BALL_R } from '../config';
import { TEX_SCALE } from '../themes/apply';
import { drawBallShine } from '../themes/draw';
import type { Viewer } from '../game/state';

const SIZE = BALL_R * 2 * TEX_SCALE;
const R = SIZE / 2;

export const avatarKey = (id: string) => `avatar-${id}`;

/** Liseré imposé par un thème : les billes déjà dessinées doivent être refaites. */
export function clearBallTextures(scene: Phaser.Scene) {
  for (const key of scene.textures.getTextureKeys())
    if (key.startsWith('avatar-') || key.startsWith('fb-')) scene.textures.remove(key);
}

function newCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  return { c, ctx: c.getContext('2d')! };
}

/** Liseré couleur du viewer + reflet chromé : la bille reste « en métal ». */
function finish(ctx: CanvasRenderingContext2D, rim: string) {
  const lw = SIZE * 0.09;
  ctx.lineWidth = lw;
  ctx.strokeStyle = rim;
  ctx.beginPath();
  ctx.arc(R, R, R - lw / 2, 0, Math.PI * 2);
  ctx.stroke();
  drawBallShine(ctx, SIZE);
}

function put(scene: Phaser.Scene, key: string, c: HTMLCanvasElement) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, c);
}

/** Bille de repli immédiate : couleur du viewer + initiale. */
export function fallbackKey(scene: Phaser.Scene, v: Viewer, font: string, rim?: string | null): string {
  const key = `fb-${v.id}`;
  if (scene.textures.exists(key)) return key;
  const { c, ctx } = newCanvas();
  ctx.fillStyle = v.color;
  ctx.beginPath();
  ctx.arc(R, R, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#10131a';
  ctx.font = `${Math.round(SIZE * 0.5)}px "${font}", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((v.name.trim()[0] ?? '?').toUpperCase(), R, R * 1.08);
  finish(ctx, rim ?? '#d8dde6');
  put(scene, key, c);
  return key;
}

/** Charge l'avatar Twitch (CDN avec CORS) et l'enregistre sous avatar-<id>. false si indisponible. */
export function loadAvatar(scene: Phaser.Scene, v: Viewer, url: string, rim?: string | null): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // sinon canvas « tainted » et texture WebGL refusée
    img.onload = () => {
      const { c, ctx } = newCanvas();
      ctx.save();
      ctx.beginPath();
      ctx.arc(R, R, R, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      ctx.restore();
      finish(ctx, rim ?? v.color);
      put(scene, avatarKey(v.id), c);
      resolve(true);
    };
    img.onerror = () => resolve(false);
    img.src = url.replace('300x300', '70x70'); // variante légère proposée par le CDN Twitch
  });
}
