import Phaser from 'phaser';
import {
  params, BOARD_W, HEIGHT, WALL, BALL_R, PEG_R, MAX_SPEED, RAMP_THICK, SPINNER_ARM,
  PTS_PEG, PTS_PEG_GOLDEN, PTS_BUMPER, PTS_SPINNER, HIT_COOLDOWN_MS, BUMPER_SPEED,
  STUCK_NUDGE_MS, STUCK_KILL_MS,
} from '../config';
import { generateMap, PATTERNS, type MapData, type PatternId } from '../mapgen';
import { applyTheme } from '../themes/apply';
import { resolveTheme, todayMMDD } from '../themes/resolve';
import type { Theme } from '../themes/types';
import { setupDebug } from '../debug';

type Body = MatterJS.BodyType;

interface Ball {
  userId: string;
  body: Body;
  img: Phaser.GameObjects.Image;
  done: boolean; // a touché un bac : ignorer toute collision suivante
  hits: Map<number, number>; // id d'obstacle → dernier score (cooldown)
  anchor: { x: number; y: number; t: number }; // dernière position « éloignée » (anti-blocage)
  lastNudge: number;
}

interface El {
  kind: 'peg' | 'bin' | 'bumper' | 'spinner';
  points: number;
  img?: Phaser.GameObjects.Image;
}

interface SpinnerRt { body: Body; img: Phaser.GameObjects.Image; speed: number }

const DIVIDER = 6;
const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;

export class Game extends Phaser.Scene {
  theme!: Theme;
  map?: MapData;
  private balls = new Map<number, Ball>(); // id du body → bille
  private els = new Map<number, El>(); // id du body → obstacle
  private mapBodies: Body[] = [];
  private mapObjects: Phaser.GameObjects.GameObject[] = [];
  private spinners: SpinnerRt[] = [];
  private toRemove: Ball[] = [];

  constructor() { super({ key: 'Game', active: true }); }

  async create() {
    this.buildFrame();
    this.theme = resolveTheme(todayMMDD(params.date), params.theme);
    await applyTheme(this, this.theme);
    this.game.events.emit('theme', this.theme);
    this.buildMap(generateMap(params.seed ?? Math.floor(Math.random() * 1e9), patternParam()));
    this.matter.world.on('collisionstart', this.onCollision, this);
    setupDebug(this);
  }

  /** Murs, plafond et sol permanents. */
  private buildFrame() {
    const opts = { isStatic: true, label: 'wall' };
    this.matter.add.rectangle(WALL / 2, HEIGHT / 2, WALL, HEIGHT * 2, opts);
    this.matter.add.rectangle(BOARD_W - WALL / 2, HEIGHT / 2, WALL, HEIGHT * 2, opts);
    this.matter.add.rectangle(BOARD_W / 2, -10, BOARD_W, 20, opts);
    this.matter.add.rectangle(BOARD_W / 2, HEIGHT + 10, BOARD_W, 20, opts);
  }

  buildMap(map: MapData) {
    this.map = map;
    const pal = this.theme.palette;

    for (const p of map.pegs) {
      const body = this.staticBody(this.matter.add.circle(p.x, p.y, PEG_R, { isStatic: true, label: 'peg' }));
      const img = this.track(this.add.image(p.x, p.y, p.golden ? 'pegGolden' : 'peg').setDisplaySize(PEG_R * 2, PEG_R * 2));
      this.els.set(body.id, { kind: 'peg', points: p.golden ? PTS_PEG_GOLDEN : PTS_PEG, img });
    }

    for (const r of map.ramps) {
      this.staticBody(this.matter.add.rectangle(r.x, r.y, r.length, RAMP_THICK,
        { isStatic: true, angle: r.angle, friction: 0, label: 'ramp' }));
      this.track(this.add.image(r.x, r.y, 'ramp').setDisplaySize(r.length, RAMP_THICK).setRotation(r.angle));
    }

    for (const b of map.bumpers) {
      const body = this.staticBody(this.matter.add.circle(b.x, b.y, b.radius, { isStatic: true, label: 'bumper' }));
      const img = this.track(this.add.image(b.x, b.y, 'bumper').setDisplaySize(b.radius * 2, b.radius * 2));
      this.els.set(body.id, { kind: 'bumper', points: PTS_BUMPER, img });
    }

    for (const s of map.spinners) {
      // croix : deux barres fusionnées en un corps composé statique, tourné à chaque pas
      const parts = [0, Math.PI / 2].map((angle) =>
        this.matter.bodies.rectangle(s.x, s.y, s.radius * 2, SPINNER_ARM, { angle, chamfer: { radius: SPINNER_ARM / 2 } }));
      const body = this.matter.body.create({ parts, isStatic: true, label: 'spinner' });
      this.matter.world.add(body);
      this.staticBody(body);
      const img = this.track(this.add.image(s.x, s.y, 'spinner').setDisplaySize(s.radius * 2, s.radius * 2));
      this.spinners.push({ body, img, speed: s.speed });
      this.els.set(body.id, { kind: 'spinner', points: PTS_SPINNER, img });
    }

    const g = this.track(this.add.graphics());
    const binH = HEIGHT - map.binTop;
    map.bins.forEach((bin, i) => {
      g.fillStyle(hex(pal.bins[i % pal.bins.length]), 1).fillRect(bin.x, map.binTop, bin.width, binH);
      const sensor = this.staticBody(this.matter.add.rectangle(
        bin.x + bin.width / 2, map.binTop + binH / 2 + BALL_R * 2, bin.width - DIVIDER, binH,
        { isStatic: true, isSensor: true, label: 'bin' }));
      this.els.set(sensor.id, { kind: 'bin', points: bin.points });
      this.track(this.add.text(bin.x + bin.width / 2, map.binTop + binH * 0.55, String(bin.points), {
        fontFamily: this.theme.font.family, fontSize: '30px', color: pal.binHighlight,
      }).setOrigin(0.5));
      if (i > 0) {
        this.staticBody(this.matter.add.rectangle(bin.x, map.binTop + binH / 2, DIVIDER, binH, { isStatic: true, label: 'wall' }));
        g.fillStyle(hex(pal.frame), 1).fillRect(bin.x - DIVIDER / 2, map.binTop, DIVIDER, binH);
      }
    });
    g.fillStyle(hex(pal.frame), 1).fillRect(WALL, map.binTop - 2, BOARD_W - WALL * 2, 3);
  }

  private staticBody(b: Body) { this.mapBodies.push(b); return b; }
  private track<T extends Phaser.GameObjects.GameObject>(o: T) { this.mapObjects.push(o); return o; }

  /** Lâche une bille en x (coordonnée plateau). */
  drop(userId: string, x: number): Ball | null {
    if (!this.map) return null;
    const bx = Phaser.Math.Clamp(x, WALL + BALL_R + 2, BOARD_W - WALL - BALL_R - 2);
    const y = BALL_R + 24;
    const body = this.matter.add.circle(bx, y, BALL_R, {
      restitution: 0.5, friction: 0.001, frictionAir: 0.0008, label: 'ball',
    });
    this.matter.body.setVelocity(body, { x: Phaser.Math.FloatBetween(-0.6, 0.6), y: 0 });
    const img = this.add.image(bx, y, 'ball').setDisplaySize(BALL_R * 2, BALL_R * 2);
    const ball: Ball = {
      userId, body, img, done: false, hits: new Map(), anchor: { x: bx, y, t: this.time.now }, lastNudge: 0,
    };
    this.balls.set(body.id, ball);
    return ball;
  }

  hasBall(userId: string) {
    for (const b of this.balls.values()) if (b.userId === userId) return true;
    return false;
  }

  get ballCount() { return this.balls.size; }

  private onCollision(e: Phaser.Physics.Matter.Events.CollisionStartEvent) {
    for (const pair of e.pairs) {
      const a = pair.bodyA.parent, b = pair.bodyB.parent;
      const ball = this.balls.get(a.id) ?? this.balls.get(b.id);
      if (!ball || ball.done) continue;
      const other = ball.body === a ? b : a;
      const el = this.els.get(other.id);
      if (!el) continue;
      const { x, y } = ball.body.position;
      if (el.kind === 'bin') {
        ball.done = true; // avant destruction : un 2e événement dans la même frame est ignoré
        this.score(ball, el.points, x, y);
        this.toRemove.push(ball);
        continue;
      }
      if (el.kind === 'bumper') this.bounce(ball, other);
      const last = ball.hits.get(other.id) ?? -Infinity;
      if (this.time.now - last < HIT_COOLDOWN_MS) continue;
      ball.hits.set(other.id, this.time.now);
      this.score(ball, el.points, x, y);
    }
  }

  /** Bumper : vitesse imposée le long de la normale, biaisée vers le haut. */
  private bounce(ball: Ball, bumper: Body) {
    let nx = ball.body.position.x - bumper.position.x;
    let ny = ball.body.position.y - bumper.position.y - 0.6 * Math.hypot(nx, ball.body.position.y - bumper.position.y);
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    this.matter.body.setVelocity(ball.body, { x: nx * BUMPER_SPEED, y: ny * BUMPER_SPEED });
  }

  /** Bille qui ne s'éloigne pas de 2 rayons : coup de pouce à 3 s, retirée sans points à 8 s. */
  private unstick(ball: Ball, now: number) {
    const { x, y } = ball.body.position;
    if (Math.hypot(x - ball.anchor.x, y - ball.anchor.y) > BALL_R * 2) {
      ball.anchor = { x, y, t: now };
      return;
    }
    const idle = now - ball.anchor.t;
    if (idle > STUCK_KILL_MS) {
      ball.done = true;
      this.toRemove.push(ball);
    } else if (idle > STUCK_NUDGE_MS && now - ball.lastNudge > 1000) {
      ball.lastNudge = now;
      this.matter.body.setVelocity(ball.body, { x: Phaser.Math.FloatBetween(-3, 3), y: -3 });
    }
  }

  private score(ball: Ball, points: number, x: number, y: number) {
    this.game.events.emit('score', ball.userId, points, x, y);
    // ponytail: pop-up provisoire non poolé, remplacé par le pool BitmapText à l'étape 8
    const t = this.add.text(x, y - 10, `+${points}`, {
      fontFamily: this.theme.font.family, fontSize: '22px', color: this.theme.palette.text,
    }).setOrigin(0.5);
    this.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  private removeBall(ball: Ball) {
    this.matter.world.remove(ball.body);
    ball.img.destroy();
    this.balls.delete(ball.body.id);
    this.game.events.emit('ballFinished', ball.userId);
  }

  update(_time: number, delta: number) {
    if (!this.map) return;
    // deux sous-pas par frame : une bille rapide ne traverse pas un obstacle fin
    const dt = Math.min(delta, 33.3) / 2; // Matter recommande ≤ 16.67 ms par pas
    for (let i = 0; i < 2; i++) {
      // setAngle(..., true) met à jour anglePrev : le solveur transmet l'élan du tourniquet
      for (const s of this.spinners) this.matter.body.setAngle(s.body, s.body.angle + (s.speed * dt) / 16.667, true);
      this.matter.world.step(dt);
    }
    for (const s of this.spinners) s.img.setRotation(s.body.angle);
    const now = this.time.now;
    for (const ball of this.balls.values()) {
      if (!ball.done) this.unstick(ball, now);
      const v = ball.body.velocity;
      const speed = Math.hypot(v.x, v.y);
      if (speed > MAX_SPEED) this.matter.body.setVelocity(ball.body, { x: (v.x / speed) * MAX_SPEED, y: (v.y / speed) * MAX_SPEED });
      ball.img.setPosition(ball.body.position.x, ball.body.position.y);
    }
    for (const ball of this.toRemove) this.removeBall(ball);
    this.toRemove.length = 0;
  }
}

function patternParam(): PatternId | undefined {
  return (PATTERNS as readonly string[]).includes(params.pattern ?? '') ? (params.pattern as PatternId) : undefined;
}
