// Effets « juicy » de la scène Game. Règle : rien n'est alloué dans les handlers de collision ni
// dans update() — pop-ups, ondes et étiquettes viennent de pools, animés à la main (pas de tweens).
import Phaser from 'phaser';
import { params, BOARD_W, HEIGHT, WALL } from '../config';
import type { Theme } from '../themes/types';

const POPUPS = 64, RINGS = 12, LABELS = 32, BULBS_PER_SIDE = 20;
const CHASE_MS = 150; // pas du chenillard au repos
const FRENZY_MS = 1500;
const SHAKE_COOLDOWN_MS = 350;
export const NAME_FONT = '"Segoe UI", Roboto, "Helvetica Neue", sans-serif';

const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;

interface Popup { t: Phaser.GameObjects.BitmapText; life: number; max: number; scale: number }
interface Ring { img: Phaser.GameObjects.Image; life: number; max: number; size: number }
interface Label { t: Phaser.GameObjects.Text; life: number; pos: { x: number; y: number } }

/** État lumineux d'un obstacle : v = 1 au contact, décroît jusqu'à 0. */
export interface Pulse {
  kind: 'peg' | 'bumper' | 'spinner' | 'bin';
  v: number;
  img?: Phaser.GameObjects.Image;
  size?: number; // taille d'affichage au repos
  glow?: Phaser.GameObjects.Image; // halo additif (bumper)
  rect?: Phaser.GameObjects.Rectangle; // flash de bac
}

const DECAY: Record<Pulse['kind'], number> = { peg: 180, bumper: 320, spinner: 220, bin: 450 };

export class Juice {
  private popups: Popup[] = [];
  private rings: Ring[] = [];
  private labels: Label[] = [];
  private pi = 0; private ri = 0; private li = 0;
  private pulses = new Set<Pulse>();
  private bulbs: Phaser.GameObjects.Image[] = [];
  private emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private golden!: Phaser.GameObjects.Particles.ParticleEmitter;
  private bursts!: Phaser.GameObjects.Particles.ParticleEmitter;
  private confetti!: Phaser.GameObjects.Particles.ParticleEmitter;
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private chase = 0;
  private frenzyUntil = 0;
  private lastShake = 0;
  private wasFrenzy = false;
  private colors = { text: 0, accent: 0, core: 0, marquee: [0] }; // pré-calculées : pas de parsing dans update

  constructor(private scene: Phaser.Scene) {}

  /** (Re)crée tout ce qui dépend des textures et couleurs du thème. */
  rebuild(theme: Theme) {
    const s = this.scene, pal = theme.palette;
    for (const o of [...this.popups.map((p) => p.t), ...this.rings.map((r) => r.img), ...this.labels.map((l) => l.t), ...this.bulbs, ...this.emitters]) o.destroy();
    this.pulses.clear();

    this.trail = s.add.particles(0, 0, 'fx-hit', {
      lifespan: 260, scale: { start: 0.42, end: 0 }, alpha: { start: 0.3, end: 0 },
      blendMode: 'ADD', emitting: false, maxParticles: 900, tint: hex(pal.text),
    }).setDepth(5);
    this.sparks = s.add.particles(0, 0, 'fx-hit', {
      speed: { min: 60, max: 170 }, lifespan: 320, scale: { start: 0.32, end: 0 },
      blendMode: 'ADD', emitting: false, maxParticles: 400, tint: hex(pal.peg),
    }).setDepth(30);
    this.golden = s.add.particles(0, 0, 'fx-hit', {
      speed: { min: 90, max: 260 }, lifespan: 520, scale: { start: 0.5, end: 0 },
      blendMode: 'ADD', emitting: false, maxParticles: 200, tint: hex(pal.pegGolden),
    }).setDepth(30);
    this.bursts = s.add.particles(0, 0, 'fx-bumper', {
      speed: { min: 160, max: 400 }, lifespan: 480, scale: { start: 0.6, end: 0 },
      blendMode: 'ADD', emitting: false, maxParticles: 300, tint: [hex(pal.bumperCore), 0xffffff],
    }).setDepth(30);
    this.confetti = s.add.particles(0, 0, 'fx-confetti', {
      speed: { min: 180, max: 520 }, angle: { min: 235, max: 305 }, gravityY: 700, lifespan: 1400,
      rotate: { min: 0, max: 360 }, scale: { min: 0.5, max: 1 }, emitting: false, maxParticles: 400,
      tint: [hex(pal.accent), hex(pal.bumperCore), hex(pal.text)],
    }).setDepth(30);
    this.emitters = [this.trail, this.sparks, this.golden, this.bursts, this.confetti];

    this.popups = Array.from({ length: POPUPS }, () => ({
      t: s.add.bitmapText(0, 0, 'digits', '', 64).setLetterSpacing(-14).setOrigin(0.5).setVisible(false).setDepth(50),
      life: 0, max: 1, scale: 1,
    }));
    this.rings = Array.from({ length: RINGS }, () => ({
      img: s.add.image(0, 0, 'fx-ring').setVisible(false).setBlendMode('ADD').setDepth(20),
      life: 0, max: 1, size: 1,
    }));
    this.labels = Array.from({ length: LABELS }, () => ({
      t: s.add.text(0, 0, '', {
        fontFamily: NAME_FONT, fontSize: '18px', color: pal.text, stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5, 1).setVisible(false).setDepth(45),
      life: 0, pos: { x: 0, y: 0 },
    }));

    this.colors = {
      text: hex(pal.text), accent: hex(pal.accent), core: hex(pal.bumperCore), marquee: pal.marquee.map(hex),
    };
    // marquee : ampoules le long des deux montants, ordonnées en boucle (gauche ↑ puis droite ↓)
    const down = Array.from({ length: BULBS_PER_SIDE }, (_, i) => 30 + (i * (HEIGHT - 60)) / (BULBS_PER_SIDE - 1));
    const up = [...down].reverse();
    const spots = [...up.map((y) => [WALL / 2, y]), ...down.map((y) => [BOARD_W - WALL / 2, y])];
    this.bulbs = spots.map(([x, y]) => s.add.image(x, y, 'fx-hit').setScale(0.7).setBlendMode('ADD').setDepth(6));
    this.wasFrenzy = true; // force la pose des teintes au premier update
  }

  pulse(p: Pulse) {
    p.v = 1;
    this.pulses.add(p);
  }

  popup(x: number, y: number, points: number) {
    const p = this.popups[this.pi++ % POPUPS];
    p.scale = points >= 250 ? 0.95 : points >= 50 ? 0.75 : points >= 10 ? 0.55 : 0.32;
    p.max = p.life = points >= 50 ? 1300 : points >= 10 ? 800 : 550;
    const margin = 60 * p.scale + 30; // un gros « +500 » ne déborde pas du plateau
    p.t.setText(`+${points}`).setPosition(Phaser.Math.Clamp(x, margin, BOARD_W - margin), y - 14).setVisible(true).setAlpha(1)
      .setTint(points >= 10 ? this.colors.accent : this.colors.text);
  }

  peg(p: Pulse, x: number, y: number, golden: boolean) {
    this.pulse(p);
    if (golden) this.golden.explode(10, x, y);
    else this.sparks.explode(4, x, y);
  }

  bumper(p: Pulse, x: number, y: number) {
    this.pulse(p);
    this.bursts.explode(14, x, y);
    const r = this.rings[this.ri++ % RINGS];
    r.max = r.life = 380;
    r.size = (p.size ?? 52) * 2.6;
    r.img.setPosition(p.img!.x, p.img!.y).setTint(this.colors.core).setVisible(true);
    this.shake(70, 0.0025);
  }

  spinner(p: Pulse, x: number, y: number) {
    this.pulse(p);
    this.sparks.explode(6, x, y);
  }

  bin(p: Pulse, x: number, y: number, points: number, big: boolean) {
    this.pulse(p);
    this.confetti.explode(big ? 40 : 10, x, y);
    if (big) {
      this.frenzyUntil = this.scene.time.now + FRENZY_MS;
      this.shake(260, 0.006);
    }
    this.popup(x, y - 30, points);
  }

  /** Nom du viewer au-dessus de sa bille pendant ~1 s (pos = body.position, mise à jour par Matter). */
  label(name: string, pos: { x: number; y: number }) {
    const l = this.labels[this.li++ % LABELS];
    l.life = 1200;
    l.pos = pos;
    l.t.setText(name).setVisible(true).setAlpha(1);
  }

  trailAt(x: number, y: number, speed: number) {
    if (speed > 5) this.trail.emitParticleAt(x, y, speed > 12 ? 2 : 1);
  }

  private shake(duration: number, intensity: number) {
    const now = this.scene.time.now;
    if (!params.shake || now - this.lastShake < SHAKE_COOLDOWN_MS) return;
    this.lastShake = now;
    this.scene.cameras.main.shake(duration, intensity);
  }

  update(dt: number) {
    const now = this.scene.time.now;
    for (const p of this.popups) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.t.setVisible(false); continue; }
      const age = p.max - p.life;
      const pop = age < 120 ? 0.6 + (0.4 * age) / 120 : 1;
      p.t.setScale(p.scale * pop).setAlpha(Math.min(1, p.life / 300));
      p.t.y -= dt * 0.05;
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) { r.img.setVisible(false); continue; }
      const k = 1 - r.life / r.max;
      r.img.setDisplaySize(r.size * (0.4 + k), r.size * (0.4 + k)).setAlpha(1 - k);
    }
    for (const l of this.labels) {
      if (l.life <= 0) continue;
      l.life -= dt;
      if (l.life <= 0) { l.t.setVisible(false); continue; }
      l.t.setPosition(l.pos.x, l.pos.y - 18).setAlpha(Math.min(1, l.life / 400));
    }
    for (const p of this.pulses) {
      p.v = Math.max(0, p.v - dt / DECAY[p.kind]);
      const v = p.v;
      if (p.img && p.size) {
        const grow = p.kind === 'peg' ? 0.35 : p.kind === 'bumper' ? 0.15 : 0;
        if (grow) p.img.setDisplaySize(p.size * (1 + grow * v), p.size * (1 + grow * v));
        if (p.kind === 'peg' || p.kind === 'spinner') {
          if (v > 0.5) p.img.setTintFill(0xffffff);
          else p.img.clearTint();
        }
      }
      p.glow?.setAlpha(v);
      p.rect?.setAlpha(0.5 * v);
      if (v === 0) this.pulses.delete(p);
    }
    // chenillard : une ampoule sur quatre allumée, frénétique et dorée après un gros gain
    const frenzy = now < this.frenzyUntil;
    this.chase += dt * (frenzy ? 4 : 1);
    const phase = Math.floor(this.chase / CHASE_MS);
    const { marquee, accent } = this.colors;
    const retint = frenzy !== this.wasFrenzy;
    this.wasFrenzy = frenzy;
    for (let i = 0; i < this.bulbs.length; i++) {
      const b = this.bulbs[i];
      b.setAlpha((i + phase) % 4 === 0 ? 1 : frenzy ? 0.6 : 0.18);
      if (retint) b.setTint(frenzy ? accent : marquee[i % marquee.length]);
    }
  }
}
