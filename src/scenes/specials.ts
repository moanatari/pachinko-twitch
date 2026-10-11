// Taquets spéciaux : un taquet de la carte s'allume de temps en temps et déclenche un effet au premier
// contact. État de taille fixe, comptes à rebours en ms de scène : figés en pause, comme la physique.
import Phaser from 'phaser';
import {
  params, BOARD_W, WALL, BALL_R, GRAVITY_Y, SPECIAL_TTL_MS, MOON_GRAVITY, MOON_MS, SLOW_SCALE, SLOW_MS,
  X2_MS, GOLD_MS, QUAKE_KICK, PEG_R,
} from '../config';
import { EFFECTS, pickEffect, type EffectId } from '../game/specials';
import type { Game, Ball, PegRt } from './Game';

const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;
const COLOR = Object.fromEntries(EFFECTS.map((e) => [e.id, hex(e.color)])) as Record<EffectId, number>;
const LABEL = Object.fromEntries(EFFECTS.map((e) => [e.id, e.label])) as Record<EffectId, string>;

export class Specials {
  private mark?: Phaser.GameObjects.Image; // pastille teintée posée sur le taquet allumé (hitbox inchangée)
  private halo?: Phaser.GameObjects.Image;
  private peg: PegRt | null = null; // taquet allumé
  private effect: EffectId | null = null; // tiré à l'apparition : la couleur l'annonce
  private idle = 0; // ms de jeu depuis la fin du dernier taquet spécial
  private ttl = 0;
  private hitBall: Ball | null = null; // contact reçu pendant le pas physique, appliqué dans update()
  private hitEffect: EffectId | null = null;
  private moonMs = 0;
  private slowMs = 0;
  private goldMs = 0;
  private x2 = new Map<string, number>(); // viewer → ms restants

  constructor(private game: Game) {}

  /** Pluie d'or en cours : tous les taquets valent un taquet doré. */
  get gold() { return this.goldMs > 0; }

  mult(userId: string) { return this.x2.has(userId) ? 2 : 1; }

  /** Nouvelle carte : images créées une fois par Game.buildMap, détruites avec la carte. */
  attach(mark: Phaser.GameObjects.Image, halo: Phaser.GameObjects.Image) {
    this.mark = mark;
    this.halo = halo;
  }

  /** Appelé par le handler de collision : rien n'est créé ni déplacé pendant le pas physique. */
  hit(bodyId: number, ball: Ball) {
    if (!this.effect || this.peg?.bodyId !== bodyId) return;
    this.hitBall = ball;
    this.hitEffect = this.effect;
    this.off();
  }

  /** Déclenche un effet pour la bille qui a touché le taquet (appelé aussi par scripts/verify-streamer.mjs). */
  apply(id: EffectId, ball: Ball) {
    const g = this.game, body = g.matter.body;
    g.fx.label(`${g.state.players.get(ball.userId)?.name ?? ''} · ${LABEL[id]}`, ball.body.position);
    if (id === 'double') g.bonusBall(ball);
    else if (id === 'moon') {
      this.moonMs = MOON_MS;
      g.matter.world.setGravity(0, GRAVITY_Y * MOON_GRAVITY);
    } else if (id === 'warp') {
      body.setPosition(ball.body, { x: Phaser.Math.Between(WALL + BALL_R * 2, BOARD_W - WALL - BALL_R * 2), y: BALL_R + 24 });
      body.setVelocity(ball.body, { x: 0, y: 0 });
      // sans ça, l'anti-blocage mesurerait l'immobilité depuis l'ancienne position
      ball.anchor.x = ball.body.position.x;
      ball.anchor.y = ball.body.position.y;
      ball.anchor.t = g.time.now;
    } else if (id === 'slow') {
      this.slowMs = SLOW_MS;
      for (const b of g.balls.values()) b.body.timeScale = b.userId === ball.userId ? 1 : SLOW_SCALE;
    } else if (id === 'x2') this.x2.set(ball.userId, X2_MS);
    else if (id === 'gold') {
      this.goldMs = GOLD_MS;
      for (const p of g.pegs) p.img.setTexture('pegGolden').setDisplaySize(PEG_R * 2, PEG_R * 2);
    } else {
      for (const b of g.balls.values()) {
        body.setVelocity(b.body, {
          x: b.body.velocity.x + Phaser.Math.FloatBetween(-QUAKE_KICK / 2, QUAKE_KICK / 2), y: -QUAKE_KICK,
        });
      }
      g.fx.quake();
    }
  }

  /** Podium ou nouvelle carte : taquet éteint, tout revient à la normale. À appeler AVANT Game.clearMap(). */
  clear() {
    this.off();
    this.hitBall = this.hitEffect = null;
    if (this.moonMs > 0) this.endMoon();
    if (this.slowMs > 0) this.endSlow();
    if (this.goldMs > 0) this.endGold();
    this.x2.clear();
  }

  update(dt: number) {
    const g = this.game, ball = this.hitBall, id = this.hitEffect;
    this.hitBall = this.hitEffect = null;
    if (ball && id && !ball.done) this.apply(id, ball);
    if (this.moonMs > 0 && (this.moonMs -= dt) <= 0) this.endMoon();
    if (this.slowMs > 0 && (this.slowMs -= dt) <= 0) this.endSlow();
    if (this.goldMs > 0 && (this.goldMs -= dt) <= 0) this.endGold();
    for (const [user, ms] of this.x2) {
      if (ms > dt) this.x2.set(user, ms - dt);
      else this.x2.delete(user);
    }
    if (g.state.phase !== 'playing' || g.state.waiting) return; // aucun taquet spécial hors partie lancée
    if (this.peg) {
      this.halo?.setAlpha(0.6 + 0.4 * Math.sin(g.time.now / 150));
      if ((this.ttl -= dt) <= 0) this.off();
    } else if (params.specialEvery > 0 && (this.idle += dt) >= params.specialEvery * 1000) this.light();
  }

  private light() {
    const g = this.game;
    this.idle = 0; // tirage impossible (aucun effet activé, carte sans taquet) : nouvel essai après un intervalle
    const id = pickEffect(params.specialEffects, g.ballCount < params.maxBalls, Math.random);
    if (!id || !g.pegs.length || !this.mark || !this.halo) return;
    const peg = g.pegs[Math.floor(Math.random() * g.pegs.length)];
    this.peg = peg;
    this.effect = id;
    this.ttl = SPECIAL_TTL_MS;
    this.mark.setPosition(peg.x, peg.y).setTint(COLOR[id]).setVisible(true);
    this.halo.setPosition(peg.x, peg.y).setTint(COLOR[id]).setVisible(true);
  }

  private off() {
    this.peg = null;
    this.effect = null;
    this.idle = 0;
    this.mark?.setVisible(false);
    this.halo?.setVisible(false);
  }

  private endMoon() {
    this.moonMs = 0;
    this.game.matter.world.setGravity(0, GRAVITY_Y);
  }

  private endSlow() {
    this.slowMs = 0;
    for (const b of this.game.balls.values()) b.body.timeScale = 1;
  }

  private endGold() {
    this.goldMs = 0;
    for (const p of this.game.pegs) p.img.setTexture('peg').setDisplaySize(PEG_R * 2, PEG_R * 2);
  }
}
