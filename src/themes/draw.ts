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

/** Taquet à 5 : chrome. */
export const drawPegChrome: DrawFn = (ctx, w, _h, p) => {
  const r = w / 2;
  const g = ctx.createRadialGradient(r * 0.7, r * 0.6, r * 0.1, r, r, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, p.bumperRing);
  g.addColorStop(1, '#3a3f48');
  ctx.fillStyle = g;
  disc(ctx, r, r, r * 0.95);
};

/** Taquet à 30 : rouge laqué cerclé d'or. */
export const drawPegRed: DrawFn = (ctx, w, _h, p) => {
  const r = w / 2;
  ctx.fillStyle = p.accent;
  disc(ctx, r, r, r * 0.98);
  const g = ctx.createRadialGradient(r * 0.7, r * 0.6, r * 0.05, r, r, r * 0.8);
  g.addColorStop(0, '#ffd0d0');
  g.addColorStop(0.35, p.bumperCore);
  g.addColorStop(1, '#3a0008');
  ctx.fillStyle = g;
  disc(ctx, r, r, r * 0.8);
};

/** Taquet à 50 : blanc éclatant (le gros halo fait le reste). */
export const drawPegBright: DrawFn = (ctx, w) => {
  const r = w / 2;
  const g = ctx.createRadialGradient(r * 0.7, r * 0.6, 0, r, r, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.6, '#fff8e0');
  g.addColorStop(0.9, '#ffe9a8');
  g.addColorStop(1, '#ffffff');
  ctx.fillStyle = g;
  disc(ctx, r, r, r * 0.98);
};

/** Taquet spécial : perle blanche à liseré, teintée à l'usage de la couleur de l'effet. */
export const drawPegSpecial: DrawFn = (ctx, w) => {
  const r = w / 2;
  const g = ctx.createRadialGradient(r * 0.7, r * 0.6, r * 0.05, r, r, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.6, '#e6e6e6');
  g.addColorStop(0.85, '#9a9a9a');
  g.addColorStop(1, '#ffffff');
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

/** Anneau d'onde (bumper), blanc : teinté à l'usage. */
export const drawRing: DrawFn = (ctx, w) => {
  const r = w / 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = w * 0.06;
  ctx.beginPath();
  ctx.arc(r, r, r * 0.9, 0, Math.PI * 2);
  ctx.stroke();
};

/** Confetti : petit rectangle doré. */
export const drawConfetti: DrawFn = (ctx, w, h, p) => {
  ctx.fillStyle = p.accent;
  ctx.fillRect(w * 0.2, h * 0.35, w * 0.6, h * 0.3);
};

// --- Sprites saisonniers (v1 : dessinés en code ; remplaçables par une image sans toucher au reste) ---
// Les sprites de particules sont clairs : les émetteurs les teintent.

const starPath = (ctx: Ctx, cx: number, cy: number, spikes: number, outer: number, inner: number) => {
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + (i * Math.PI) / spikes;
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
};

/** Citrouille (bumper Halloween) : tient dans le cercle de la hitbox. */
export const drawPumpkin: DrawFn = (ctx, w, _h, p) => {
  const r = w / 2;
  const g = ctx.createRadialGradient(r * 0.8, r * 0.75, r * 0.1, r, r, r);
  g.addColorStop(0, '#ffd08a');
  g.addColorStop(0.45, p.bumperCore);
  g.addColorStop(1, '#4a1600');
  ctx.fillStyle = g;
  for (const [dx, rx] of [[-0.42, 0.52], [0.42, 0.52], [0, 0.6]]) {
    ctx.beginPath();
    ctx.ellipse(r + dx * r, r * 1.08, r * rx, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(60,20,0,0.45)';
  ctx.lineWidth = w * 0.02;
  for (const dx of [-0.24, 0.24]) {
    ctx.beginPath();
    ctx.ellipse(r + dx * r, r * 1.08, r * 0.22, r * 0.76, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#4a6b2a';
  ctx.fillRect(r - w * 0.05, r * 0.12, w * 0.1, r * 0.3);
  ctx.fillStyle = '#ffe066'; // visage, éclairé par le halo additif au contact
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(r + sx * r * 0.42, r * 1.0);
    ctx.lineTo(r + sx * r * 0.18, r * 1.0);
    ctx.lineTo(r + sx * r * 0.3, r * 0.76);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(r - r * 0.45, r * 1.22);
  for (let i = 1; i <= 6; i++) ctx.lineTo(r - r * 0.45 + (i * r * 0.9) / 6, r * (i % 2 ? 1.42 : 1.26));
  ctx.lineTo(r + r * 0.45, r * 1.22);
  ctx.closePath();
  ctx.fill();
};

/** Bonbon emballé (taquet doré Halloween, particules). */
export const drawCandy: DrawFn = (ctx, w, h, p) => {
  const cx = w / 2, cy = h / 2, r = w * 0.26;
  ctx.fillStyle = p.pegGolden;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * r * 0.8, cy);
    ctx.lineTo(cx + s * w * 0.48, cy - r * 0.9);
    ctx.lineTo(cx + s * w * 0.48, cy + r * 0.9);
    ctx.fill();
  }
  disc(ctx, cx, cy, r);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = w * 0.06;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * r * 0.7 - r, cy - r);
    ctx.lineTo(cx + i * r * 0.7 + r, cy + r);
    ctx.stroke();
  }
  ctx.restore();
};

/** Chauve-souris (ambiance Halloween). */
export const drawBat: DrawFn = (ctx, w, h) => {
  const cx = w / 2, cy = h / 2;
  ctx.fillStyle = '#3b2458';
  ctx.beginPath();
  ctx.moveTo(cx, cy - h * 0.08);
  for (const s of [1, -1]) {
    ctx.lineTo(cx + s * w * 0.2, cy - h * 0.2);
    ctx.lineTo(cx + s * w * 0.48, cy - h * 0.12);
    ctx.lineTo(cx + s * w * 0.4, cy + h * 0.06);
    ctx.lineTo(cx + s * w * 0.3, cy);
    ctx.lineTo(cx + s * w * 0.2, cy + h * 0.1);
    ctx.lineTo(cx + s * w * 0.08, cy + h * 0.04);
    ctx.lineTo(cx, cy + h * 0.16);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff9a1f';
  disc(ctx, cx - w * 0.035, cy - h * 0.02, w * 0.02);
  disc(ctx, cx + w * 0.035, cy - h * 0.02, w * 0.02);
};

/** Flocon (ambiance et particules Hiver). */
export const drawSnowflake: DrawFn = (ctx, w, h) => {
  const cx = w / 2, cy = h / 2, r = w * 0.44;
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.lineWidth = w * 0.07;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    const x = Math.cos(a), y = Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + x * r, cy + y * r);
    for (const s of [-1, 1]) {
      const b = a + s * 0.6;
      ctx.moveTo(cx + x * r * 0.55, cy + y * r * 0.55);
      ctx.lineTo(cx + x * r * 0.55 + Math.cos(b) * r * 0.3, cy + y * r * 0.55 + Math.sin(b) * r * 0.3);
    }
    ctx.stroke();
  }
};

/** Boule de Noël (taquet doré Noël). */
export const drawChristmasBall: DrawFn = (ctx, w, _h, p) => {
  const r = w / 2;
  const g = ctx.createRadialGradient(r * 0.7, r * 0.75, r * 0.05, r, r * 1.1, r * 0.8);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, p.pegGolden);
  g.addColorStop(1, '#3a0006');
  ctx.fillStyle = g;
  disc(ctx, r, r * 1.12, r * 0.8);
  ctx.fillStyle = '#e8c45a';
  ctx.fillRect(r - w * 0.12, r * 0.18, w * 0.24, r * 0.22);
};

/** Étoile (particules Noël). */
export const drawStar: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = '#fff5cc';
  starPath(ctx, w / 2, h / 2, 5, w * 0.46, w * 0.2);
  ctx.fill();
};

/** Fleur de cerisier (taquet doré Sakura). */
export const drawSakuraFlower: DrawFn = (ctx, w, h, p) => {
  const cx = w / 2, cy = h / 2;
  ctx.fillStyle = p.pegGolden;
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * w * 0.25, cy + Math.sin(a) * w * 0.25, w * 0.2, w * 0.14, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffe27a';
  disc(ctx, cx, cy, w * 0.1);
};

/** Pétale (ambiance et particules Sakura). */
export const drawPetal: DrawFn = (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#fff0f5');
  g.addColorStop(1, '#ffb3cf');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w * 0.42, h * 0.24, -0.5, 0, Math.PI * 2);
  ctx.fill();
};

/** Bulle (ambiance Plage). */
export const drawBubble: DrawFn = (ctx, w, h) => {
  ctx.strokeStyle = 'rgba(210,245,255,0.85)';
  ctx.lineWidth = w * 0.07;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w * 0.4, 0, Math.PI * 2);
  ctx.stroke();
  shine(ctx, w * 0.36, h * 0.34, w * 0.1, h * 0.05, 0.8);
};

/** Goutte (particules Plage). */
export const drawDrop: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = '#eaf8ff';
  ctx.beginPath();
  ctx.moveTo(w / 2, h * 0.08);
  ctx.quadraticCurveTo(w * 0.85, h * 0.6, w / 2, h * 0.9);
  ctx.quadraticCurveTo(w * 0.15, h * 0.6, w / 2, h * 0.08);
  ctx.fill();
};

/** Coquillage (particules Plage). */
export const drawShell: DrawFn = (ctx, w, h) => {
  const cx = w / 2, by = h * 0.82, r = w * 0.42;
  ctx.fillStyle = '#fff1dc';
  ctx.beginPath();
  ctx.moveTo(cx, by);
  ctx.arc(cx, by, r, Math.PI * 1.05, Math.PI * 1.95);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(180,130,90,0.6)';
  ctx.lineWidth = w * 0.03;
  for (let i = 1; i < 5; i++) {
    const a = Math.PI * (1.05 + (i * 0.9) / 5);
    ctx.beginPath();
    ctx.moveTo(cx, by);
    ctx.lineTo(cx + Math.cos(a) * r, by + Math.sin(a) * r);
    ctx.stroke();
  }
};

/** Étoile de mer à 4 bras (tourniquet Plage : mêmes bras que la croix physique). */
export const drawStarfish: DrawFn = (ctx, w, _h, p) => {
  const c = w / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, '#ffd1a8');
  g.addColorStop(0.5, p.spinner);
  g.addColorStop(1, '#a8441e');
  ctx.fillStyle = g;
  starPath(ctx, c, c, 4, c * 0.98, c * 0.22);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,240,220,0.7)';
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 2;
    for (const k of [0.35, 0.55, 0.75]) disc(ctx, c + Math.cos(a) * c * k, c + Math.sin(a) * c * k, w * 0.018);
  }
};

/** Bouée rouge et blanche (bumper Plage). */
export const drawBuoy: DrawFn = (ctx, w, _h, p) => {
  const r = w / 2;
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#ffffff' : p.bumperCore;
    ctx.beginPath();
    ctx.moveTo(r, r);
    ctx.arc(r, r, r * 0.96, (i * Math.PI) / 4, ((i + 1) * Math.PI) / 4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#0b3440';
  disc(ctx, r, r, r * 0.46);
  shine(ctx, r * 0.62, r * 0.42, r * 0.22, r * 0.1, 0.5);
};
