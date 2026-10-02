// Fonctions de dessin (Canvas 2D uniquement) : chaque texture est dessinée une fois par thème.
// Les canvas font 2× la taille de la hitbox (voir apply.ts) puis sont réduits à l'affichage.
import type { DrawFn } from './types';
import { WALL } from '../config';

type Ctx = CanvasRenderingContext2D;

const disc = (ctx: Ctx, x: number, y: number, r: number) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
};

const shine = (ctx: Ctx, x: number, y: number, rx: number, ry: number, alpha = 0.6) => {
  ctx.save();
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

/** Clou en laiton. */
export const drawPeg: DrawFn = (ctx, w, _h, p) => {
  const r = w / 2;
  const g = ctx.createRadialGradient(r * 0.7, r * 0.6, r * 0.1, r, r, r);
  g.addColorStop(0, '#fff6d8'); // reflet décalé
  g.addColorStop(0.35, p.peg); // laiton
  g.addColorStop(1, '#5a3d0a'); // bord sombre
  ctx.fillStyle = g;
  disc(ctx, r, r, r * 0.95);
};

/** Clou doré, plus vif, avec un liseré clair. */
export const drawPegGolden: DrawFn = (ctx, w, _h, p) => {
  const r = w / 2;
  const g = ctx.createRadialGradient(r * 0.7, r * 0.6, r * 0.05, r, r, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, p.pegGolden);
  g.addColorStop(0.85, '#a8740a');
  g.addColorStop(1, '#fff1b0');
  ctx.fillStyle = g;
  disc(ctx, r, r, r * 0.98);
};

/** Ampoule de pachinko : anneau chrome, gorge sombre, cœur coloré translucide. */
export const drawBumper: DrawFn = (ctx, w, h, p) => {
  const r = w / 2;
  const ring = ctx.createLinearGradient(0, 0, 0, h);
  ring.addColorStop(0, '#ffffff');
  ring.addColorStop(0.45, p.bumperRing);
  ring.addColorStop(1, '#4b515c');
  ctx.fillStyle = ring;
  disc(ctx, r, r, r * 0.98);
  ctx.fillStyle = '#14161c';
  disc(ctx, r, r, r * 0.8);
  const core = ctx.createRadialGradient(r * 0.8, r * 0.75, r * 0.05, r, r, r * 0.74);
  core.addColorStop(0, '#ffe2e2');
  core.addColorStop(0.35, p.bumperCore);
  core.addColorStop(1, 'rgba(40,0,8,0.9)');
  ctx.fillStyle = core;
  disc(ctx, r, r, r * 0.72);
  shine(ctx, r * 0.72, r * 0.58, r * 0.22, r * 0.11);
};

/** Croix chrome à moyeu rouge laqué (le canvas couvre tout le rayon de balayage). */
export const drawSpinner: DrawFn = (ctx, w, h, p) => {
  const c = w / 2, arm = w * 0.11;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.5, p.spinner);
  g.addColorStop(1, '#5b6270');
  ctx.fillStyle = g;
  for (const a of [0, Math.PI / 2]) {
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.roundRect(-c, -arm / 2, w, arm, arm / 2);
    ctx.fill();
    ctx.restore();
  }
  const hub = ctx.createRadialGradient(c * 0.92, c * 0.9, 1, c, c, w * 0.12);
  hub.addColorStop(0, '#ff8a8a');
  hub.addColorStop(0.5, '#c8102e');
  hub.addColorStop(1, '#4a0010');
  ctx.fillStyle = hub;
  disc(ctx, c, c, w * 0.12);
};

/** Barre de laiton biseautée. */
export const drawRamp: DrawFn = (ctx, w, h, p) => {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#fff2c4');
  g.addColorStop(0.4, p.ramp);
  g.addColorStop(1, '#6b4a0c');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, h / 2);
  ctx.fill();
};

/** Reflet chromé à superposer sur une bille (avatar ou acier). */
export function drawBallShine(ctx: Ctx, w: number) {
  const r = w / 2;
  const g = ctx.createRadialGradient(r * 0.65, r * 0.55, r * 0.05, r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.12)');
  g.addColorStop(0.75, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = g;
  disc(ctx, r, r, r);
}

/** Bille d'acier chromé (bille sans avatar). */
export const drawBall: DrawFn = (ctx, w) => {
  const r = w / 2;
  const g = ctx.createRadialGradient(r * 0.7, r * 0.6, r * 0.05, r, r, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, '#d8dde6');
  g.addColorStop(0.8, '#5c6370');
  g.addColorStop(1, '#262a31');
  ctx.fillStyle = g;
  disc(ctx, r, r, r * 0.98);
  shine(ctx, r * 0.68, r * 0.52, r * 0.24, r * 0.12, 0.8);
};

/** Laque sombre, veinage discret, cadre laiton, vignettage. */
export const drawBackground: DrawFn = (ctx, w, h, p) => {
  ctx.fillStyle = p.background;
  ctx.fillRect(0, 0, w, h);
  // veinage de laque : lignes ondulées très faibles (déterministes)
  ctx.strokeStyle = 'rgba(255,255,255,0.018)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 70; i++) {
    const y0 = (i / 70) * h;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 24) {
      const y = y0 + Math.sin(x / 180 + i * 1.7) * 9 + Math.sin(x / 47 + i) * 2;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, w * 0.7);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  // cadre laiton latéral (épaisseur = murs physiques)
  for (const x of [0, w - WALL]) {
    const g = ctx.createLinearGradient(x, 0, x + WALL, 0);
    g.addColorStop(0, '#3d2a08');
    g.addColorStop(0.5, p.frame);
    g.addColorStop(1, '#3d2a08');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, WALL, h);
  }
};

/** Étincelle : point lumineux flou (particule par défaut). */
export const drawSpark: DrawFn = (ctx, w, h) => {
  const r = w / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,240,200,0.8)');
  g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
};

/** Confetti : petit rectangle doré. */
export const drawConfetti: DrawFn = (ctx, w, h, p) => {
  ctx.fillStyle = p.accent;
  ctx.fillRect(w * 0.2, h * 0.35, w * 0.6, h * 0.3);
};
