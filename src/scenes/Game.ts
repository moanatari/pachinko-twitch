import Phaser from 'phaser';
import {
  params, BOARD_W, HEIGHT, WALL, BALL_R, PEG_R, MAX_SPEED, RAMP_THICK, SPINNER_ARM,
  PTS_PEG, PTS_PEG_GOLDEN, PTS_BUMPER, PTS_SPINNER, HIT_COOLDOWN_MS, BUMPER_SPEED,
  STUCK_NUDGE_MS, STUCK_KILL_MS, PODIUM_MS, BIG_WIN,
} from '../config';
import { generateMap, PATTERNS, type MapData, type PatternId } from '../mapgen';
import { applyTheme } from '../themes/apply';
import { resolveTheme, todayMMDD } from '../themes/resolve';
import type { Theme } from '../themes/types';
import { setupDebug } from '../debug';
import { GameState, type Viewer } from '../game/state';
import { connectTwitch } from '../twitch/connect';
import { users, colorFor } from '../twitch/users';
import { updateSettings, loadSettings, saveSettings, type Settings } from '../settings';
import { safeStorage } from '../storage';
import { Bans } from '../game/bans';
import { History } from '../game/history';
import { Monthly } from '../game/monthly';
import { avatarKey, fallbackKey, loadAvatar, clearBallTextures } from '../twitch/avatars';
import { THEMES } from '../themes/index';
import type { AdminAction } from '../twitch/chat';
import { Juice, type Pulse } from './fx';
import { ROWS } from './Hud';
import { Specials } from './specials';

type Body = MatterJS.BodyType;
export type ModAction = 'removeBall' | 'resetScore' | 'ban' | 'unban';
const STREAMER: Viewer = { id: 'streamer', name: 'Streamer', color: colorFor('streamer') }; // sans chaîne / avant le room-id

export interface Ball {
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
  pulse: Pulse;
  golden?: boolean;
  binX?: number; // centre du bac (pop-up)
}

interface SpinnerRt { body: Body; img: Phaser.GameObjects.Image; speed: number }
/** Taquet non doré de la carte : candidat aux taquets spéciaux, repeint par la pluie d'or. */
export interface PegRt { x: number; y: number; bodyId: number; img: Phaser.GameObjects.Image }

const DIVIDER = 6;
const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;

export class Game extends Phaser.Scene {
  theme!: Theme;
  map?: MapData;
  readonly balls = new Map<number, Ball>(); // id du body → bille
  private els = new Map<number, El>(); // id du body → obstacle
  private mapBodies: Body[] = [];
  private mapObjects: Phaser.GameObjects.GameObject[] = [];
  private spinners: SpinnerRt[] = [];
  private toRemove: Ball[] = [];
  readonly state = new GameState(params.maxBalls, PODIUM_MS);
  private readonly kv = safeStorage();
  readonly bans = new Bans(this.kv);
  readonly history = new History(this.kv);
  readonly monthly = new Monthly(this.kv);
  streamer: Viewer = STREAMER;
  private disconnect?: () => void;
  private recorded = false; // partie courante déjà entrée dans l'historique
  private loading = false;
  private pendingAvatars = new Set<string>();
  private forcedTheme?: string; // debug : touche T
  readonly pegs: PegRt[] = [];
  readonly fx = new Juice(this);
  private specials = new Specials(this);
  private frame = 0; // traînées : une frame sur deux
  private queued = new Map<string, () => void>(); // commandes reçues pendant un chargement, rejouées ensuite

  constructor() { super({ key: 'Game', active: true }); }

  async create() {
    this.game.registry.set('state', this.state);
    this.game.registry.set('monthly', this.monthly);
    this.buildFrame();
    this.matter.world.on('collisionstart', this.onCollision, this);
    // le streamer joue en cliquant sur le plateau (menu ouvert : le calque DOM recouvre le canvas)
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x < BOARD_W) this.requestDrop(this.streamer, p.x);
    });
    setupDebug(this);
    await this.newGame(params.seed ?? undefined);
    this.connect();
  }

  /** (Re)connexion à la chaîne des réglages : sockets précédentes fermées proprement. */
  private connect() {
    this.disconnect?.();
    this.disconnect = undefined;
    this.streamer = STREAMER;
    if (params.channel) this.disconnect = connectTwitch(this, params.channel);
  }

  /** room-id reçu du tchat : nom et avatar résolus par users.resolve au premier drop. */
  setStreamer(roomId: string, login: string) {
    this.streamer = { id: roomId, name: login, color: colorFor(roomId) };
    this.monthly.remove(STREAMER.id); // l'identité provisoire quitte le top du mois une fois la vraie connue
  }

  /** Identité courante ou provisoire (clics avant le room-id) : jamais excluable. */
  isStreamer(id: string) { return id === this.streamer.id || id === STREAMER.id; }

  /** Réglages du menu : sauvegardés (sans les surcharges d'URL), puis appliqués.
   *  Chaîne, plafond, shake, taquets spéciaux : tout de suite ; durée, thème, enchaînement : partie suivante. */
  applySettings(patch: Partial<Settings>) {
    saveSettings(this.kv, updateSettings(loadSettings(this.kv), patch));
    const channel = params.channel;
    Object.assign(params, updateSettings(params, patch));
    this.state.maxBalls = params.maxBalls;
    if (patch.theme !== undefined) this.forcedTheme = undefined;
    if (params.channel !== channel) this.connect();
    this.game.events.emit('settings');
  }

  /** Modération depuis le menu. Le streamer ne peut pas s'exclure. */
  moderate(action: ModAction, id: string) {
    if (action === 'unban') this.bans.remove(id);
    else if (action === 'resetScore') this.state.resetScore(id);
    else {
      if (action === 'ban' && this.isStreamer(id)) return;
      for (const b of [...this.balls.values()]) if (b.userId === id) this.removeBall(b);
      if (action === 'ban') {
        this.bans.add({ id, name: this.state.players.get(id)?.name ?? users.get(id)?.name ?? id, at: Date.now() });
        this.state.remove(id);
        this.monthly.remove(id);
        this.warmMonthly();
      }
    }
    this.game.events.emit('player', id);
  }

  /** Fin du podium (ou partie quittée en plein podium) : entrée dans l'historique, une seule fois. */
  private recordGame() {
    if (this.recorded || this.state.phase !== 'podium' || !this.map) return;
    this.recorded = true;
    const s = this.state;
    this.history.add({
      at: Date.now(), durationMs: s.endsAt - s.startedAt, pattern: this.map.pattern, seed: this.map.seed,
      theme: this.theme.id, players: s.players.size,
      top3: s.top(3).map(({ id, name, score }) => ({ id, name, score })),
    });
    if (!params.debug) { // bots et parties de test hors du top
      // identité provisoire du streamer : hors du top dès que le vrai id de chaîne est connu
      const known = this.streamer.id !== STREAMER.id;
      this.monthly.record([...s.players.values()].filter((p) => !known || p.id !== STREAMER.id), Date.now());
    }
    this.game.events.emit('history');
  }

  /** Top du mois : bille de repli puis avatar pour les viewers pas encore vus dans cette session. */
  private warmMonthly() {
    for (const e of this.monthly.top(ROWS, Date.now())) {
      if (this.textures.exists(avatarKey(e.id))) continue;
      fallbackKey(this, e, this.theme.font.family, this.theme.palette.ballRim);
      this.fetchIdentity(e);
    }
  }

  /** Contrôle de partie (menu et commandes mods). Pendant un chargement : mis en file, rejoué à la fin. */
  admin(action: AdminAction) {
    if (this.loading) {
      this.queued.set(action, () => this.admin(action));
      return;
    }
    if (action === 'pause') return this.setPaused(true);
    this.setPaused(false); // toute autre action sort de la pause
    if (action === 'end') this.state.endNow(Date.now());
    else if (action === 'skip' || (action === 'start' && this.state.phase === 'podium')) void this.newGame();
  }

  /** Nouvelle partie sur la même carte (seed + pattern) : menu Partie ou Historique. */
  replay(seed: number, pattern?: PatternId) {
    if (this.loading) {
      this.queued.set('replay', () => this.replay(seed, pattern));
      return;
    }
    this.setPaused(false);
    void this.newGame(seed, pattern);
  }

  /** Gel complet : Game (physique, effets, tweens) et Backdrop (ambiance) ; le Hud reste actif pour le bandeau. */
  private setPaused(on: boolean) {
    if (on === this.state.paused) return;
    if (on) {
      this.state.pause(Date.now());
      this.scene.pause();
      this.scene.pause('Backdrop');
    } else {
      this.state.resume(Date.now());
      // l'horloge de la scène saute pendant la pause : sans ça, l'anti-blocage retirerait toutes les billes
      for (const b of this.balls.values()) b.anchor.t = this.game.loop.time;
      this.scene.resume();
      this.scene.resume('Backdrop');
    }
    this.game.events.emit('pause', on);
  }

  /** Debug (touche T) : thème suivant du registre, par le même chemin qu'un changement entre parties. */
  nextTheme() {
    const ids = Object.keys(THEMES);
    this.forcedTheme = ids[(ids.indexOf(this.theme?.id ?? 'base') + 1) % ids.length];
    void this.newGame();
  }

  /** Nouvelle partie : billes et carte détruites AVANT un éventuel changement de textures. */
  async newGame(seed = Math.floor(Math.random() * 1e9), pattern = patternParam()) {
    if (this.loading) return; // ex. touche T spammée pendant un changement de thème
    this.loading = true;
    try {
      await this.loadGame(seed, pattern);
    } finally {
      this.loading = false;
    }
    const queued = [...this.queued.values()];
    this.queued.clear();
    for (const run of queued) run();
  }

  private async loadGame(seed: number, pattern?: PatternId) {
    this.recordGame(); // carte suivante / Démarrer pendant le podium : la partie compte
    this.map = undefined; // suspend update() pendant la transition
    for (const ball of [...this.balls.values()]) this.removeBall(ball);
    this.toRemove.length = 0;
    this.specials.clear(); // avant clearMap : la pluie d'or repeint des images de taquets encore vivantes
    this.clearMap();
    const theme = resolveTheme(todayMMDD(params.date), this.forcedTheme ?? (params.theme === 'auto' ? null : params.theme));
    if (theme.id !== this.theme?.id) {
      // tout ce qui affiche une texture du thème disparaît AVANT que les textures soient remplacées
      this.game.events.emit('theme-unload');
      this.fx.clear();
      if ((theme.palette.ballRim ?? null) !== (this.theme?.palette.ballRim ?? null)) {
        clearBallTextures(this);
        this.pendingAvatars.clear();
      }
      this.theme = theme;
      await applyTheme(this, theme);
      this.fx.rebuild(theme);
      this.game.registry.set('theme', theme);
      this.game.events.emit('theme', theme);
    }
    this.buildMap(generateMap(seed, pattern));
    this.state.start(Date.now(), params.duration * 60_000);
    this.recorded = false;
    this.warmMonthly();
    this.game.events.emit('phase', 'playing');
  }

  private clearMap() {
    this.fx.clearHalos();
    for (const o of this.mapObjects) o.destroy();
    for (const b of this.mapBodies) this.matter.world.remove(b);
    this.mapObjects = [];
    this.mapBodies = [];
    this.spinners = [];
    this.pegs.length = 0;
    this.els.clear();
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
      if (p.golden) this.halo(p.x, p.y, PEG_R * 5, pal.pegGolden);
      const img = this.track(this.add.image(p.x, p.y, p.golden ? 'pegGolden' : 'peg').setDisplaySize(PEG_R * 2, PEG_R * 2));
      if (!p.golden) this.pegs.push({ x: p.x, y: p.y, bodyId: body.id, img });
      this.els.set(body.id, {
        kind: 'peg', points: p.golden ? PTS_PEG_GOLDEN : PTS_PEG, golden: p.golden,
        pulse: { kind: 'peg', v: 0, img, size: PEG_R * 2 },
      });
    }

    for (const r of map.ramps) {
      this.staticBody(this.matter.add.rectangle(r.x, r.y, r.length, RAMP_THICK,
        { isStatic: true, angle: r.angle, friction: 0, label: 'ramp' }));
      this.track(this.add.image(r.x, r.y, 'ramp').setDisplaySize(r.length, RAMP_THICK).setRotation(r.angle));
    }

    for (const b of map.bumpers) {
      const body = this.staticBody(this.matter.add.circle(b.x, b.y, b.radius, { isStatic: true, label: 'bumper' }));
      this.halo(b.x, b.y, b.radius * 3, pal.bumperCore);
      const img = this.track(this.add.image(b.x, b.y, 'bumper').setDisplaySize(b.radius * 2, b.radius * 2));
      // cœur de l'ampoule qui s'allume au contact
      const glow = this.track(this.add.image(b.x, b.y, 'fx-glow').setDisplaySize(b.radius * 2.4, b.radius * 2.4)
        .setBlendMode('ADD').setTint(hex(pal.bumperCore)).setAlpha(0));
      this.els.set(body.id, { kind: 'bumper', points: PTS_BUMPER, pulse: { kind: 'bumper', v: 0, img, size: b.radius * 2, glow } });
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
      this.els.set(body.id, { kind: 'spinner', points: PTS_SPINNER, pulse: { kind: 'spinner', v: 0, img } });
    }

    const g = this.track(this.add.graphics());
    const binH = HEIGHT - map.binTop;
    map.bins.forEach((bin, i) => {
      g.fillStyle(hex(pal.bins[i % pal.bins.length]), 1).fillRect(bin.x, map.binTop, bin.width, binH);
      const sensor = this.staticBody(this.matter.add.rectangle(
        bin.x + bin.width / 2, map.binTop + binH / 2 + BALL_R * 2, bin.width - DIVIDER, binH,
        { isStatic: true, isSensor: true, label: 'bin' }));
      const rect = this.track(this.add.rectangle(bin.x, map.binTop, bin.width, binH, hex(pal.binHighlight))
        .setOrigin(0).setBlendMode('ADD').setAlpha(0));
      this.els.set(sensor.id, { kind: 'bin', points: bin.points, binX: bin.x + bin.width / 2, pulse: { kind: 'bin', v: 0, rect } });
      if (bin.points >= BIG_WIN) {
        // gros bacs : liseré rouge laqué + or
        g.lineStyle(4, hex(pal.bumperCore), 1).strokeRect(bin.x + 5, map.binTop + 5, bin.width - 10, binH - 10);
        g.lineStyle(1, hex(pal.accent), 1).strokeRect(bin.x + 9, map.binTop + 9, bin.width - 18, binH - 18);
      }
      this.track(this.add.text(bin.x + bin.width / 2, map.binTop + binH * 0.55, String(bin.points), {
        fontFamily: this.theme.font.family, fontSize: '30px', color: pal.binHighlight,
      }).setOrigin(0.5));
      if (i > 0) {
        this.staticBody(this.matter.add.rectangle(bin.x, map.binTop + binH / 2, DIVIDER, binH, { isStatic: true, label: 'wall' }));
        g.fillStyle(hex(pal.frame), 1).fillRect(bin.x - DIVIDER / 2, map.binTop, DIVIDER, binH);
      }
    });
    g.fillStyle(hex(pal.frame), 1).fillRect(WALL, map.binTop - 2, BOARD_W - WALL * 2, 3);

    // taquet spécial : pastille + halo créés une fois par carte, déplacés et teintés à chaque apparition
    this.specials.attach(
      this.track(this.add.image(0, 0, 'pegSpecial').setDisplaySize(PEG_R * 2.6, PEG_R * 2.6).setVisible(false)),
      this.track(this.add.image(0, 0, 'fx-glow').setDisplaySize(PEG_R * 9, PEG_R * 9).setBlendMode('ADD').setDepth(-1).setVisible(false)),
    );
  }

  /** Halo additif pulsant, posé SOUS l'élément. Remplace le glow PostFX (une passe de rendu par objet :
   *  −15 fps mesurés sur iGPU à 150 billes) ; une image additive reste dans le lot de rendu. */
  private halo(x: number, y: number, size: number, color: string) {
    this.fx.addHalo(this.track(this.add.image(x, y, 'fx-glow').setDisplaySize(size, size).setBlendMode('ADD').setTint(hex(color))));
  }

  private staticBody(b: Body) { this.mapBodies.push(b); return b; }
  private track<T extends Phaser.GameObjects.GameObject>(o: T) { this.mapObjects.push(o); return o; }

  /** Point d'entrée unique des drops (tchat, Heat, souris). Refusé si exclu, bille déjà active, plafond, pause ou podium. */
  requestDrop(viewer: Viewer, x: number): boolean {
    if (!this.map || this.bans.isBanned(viewer.id) || !this.state.canDrop(viewer.id)) return false;
    this.state.ballStarted(viewer, Date.now());
    this.drop(viewer, x);
    this.game.events.emit('drop', viewer);
    return true;
  }

  /** Lâche une bille en x (coordonnée plateau). La bille tombe tout de suite, l'avatar arrive après. */
  private drop(viewer: Viewer, x: number, y = BALL_R + 24): Ball {
    const bx = Phaser.Math.Clamp(x, WALL + BALL_R + 2, BOARD_W - WALL - BALL_R - 2);
    const body = this.matter.add.circle(bx, y, BALL_R, {
      restitution: 0.5, friction: 0.001, frictionAir: 0.0008, label: 'ball',
    });
    this.matter.body.setVelocity(body, { x: Phaser.Math.FloatBetween(-0.6, 0.6), y: 0 });
    const hasAvatar = this.textures.exists(avatarKey(viewer.id));
    const key = hasAvatar ? avatarKey(viewer.id) : fallbackKey(this, viewer, this.theme.font.family, this.theme.palette.ballRim);
    if (!hasAvatar) this.fetchIdentity(viewer);
    const img = this.add.image(bx, y, key).setDisplaySize(BALL_R * 2, BALL_R * 2);
    const ball: Ball = {
      userId: viewer.id, body, img, done: false, hits: new Map(), anchor: { x: bx, y, t: this.time.now }, lastNudge: 0,
    };
    this.balls.set(body.id, ball);
    this.fx.label(viewer.name, body.position);
    return ball;
  }

  /** Bille bonus (taquet spécial) : part de la bille d'origine, à l'opposé ; refusée au plafond de billes. */
  bonusBall(from: Ball) {
    const viewer = this.state.players.get(from.userId);
    if (!viewer || !this.state.extraBall(from.userId)) return;
    const { x, y } = from.body.position;
    const dir = from.body.velocity.x > 0 ? -1 : 1;
    const ball = this.drop(viewer, x + dir * 2, y);
    this.matter.body.setVelocity(ball.body, { x: dir * 3, y: Math.min(from.body.velocity.y, 0) });
  }

  /** Nom + avatar en arrière-plan ; échange la texture des billes en jeu quand l'avatar arrive. */
  private fetchIdentity(viewer: Viewer) {
    if (this.pendingAvatars.has(viewer.id)) return;
    this.pendingAvatars.add(viewer.id);
    void users.resolve(viewer.id)
      .then((info) => {
        if (!info) return false;
        if (this.state.players.get(viewer.id)?.name !== info.name) {
          this.state.rename(viewer.id, info.name);
          this.game.events.emit('player', viewer.id);
        }
        return info.avatar ? loadAvatar(this, viewer, info.avatar, this.theme.palette.ballRim) : false;
      })
      .then((ok) => {
        this.pendingAvatars.delete(viewer.id);
        if (!ok) return;
        for (const b of this.balls.values())
          if (b.userId === viewer.id) b.img.setTexture(avatarKey(viewer.id)).setDisplaySize(BALL_R * 2, BALL_R * 2);
        this.game.events.emit('player', viewer.id);
      });
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
        const pts = this.score(ball, el.points, x, y);
        this.fx.bin(el.pulse, el.binX ?? x, this.map!.binTop, pts, el.points >= BIG_WIN);
        this.toRemove.push(ball);
        continue;
      }
      if (el.kind === 'bumper') this.bounce(ball, other);
      else if (el.kind === 'peg') this.specials.hit(other.id, ball); // avant le cooldown : le 1er contact compte toujours
      const last = ball.hits.get(other.id) ?? -Infinity;
      if (this.time.now - last < HIT_COOLDOWN_MS) continue;
      ball.hits.set(other.id, this.time.now);
      const gold = el.kind === 'peg' && this.specials.gold;
      const pts = this.score(ball, gold ? PTS_PEG_GOLDEN : el.points, x, y);
      this.fx.popup(x, y, pts);
      if (el.kind === 'peg') this.fx.peg(el.pulse, x, y, !!el.golden || gold);
      else if (el.kind === 'bumper') this.fx.bumper(el.pulse, x, y);
      else this.fx.spinner(el.pulse, x, y);
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
      ball.anchor.x = x;
      ball.anchor.y = y;
      ball.anchor.t = now;
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

  /** Renvoie les points réellement marqués (doublés par le taquet « points ×2 »). */
  private score(ball: Ball, points: number, x: number, y: number): number {
    const pts = points * this.specials.mult(ball.userId);
    this.state.addScore(ball.userId, pts, Date.now());
    this.game.events.emit('score', ball.userId, pts, x, y);
    return pts;
  }

  /** Seul chemin de fin de bille (bac, anti-blocage, reset) : libère toujours le viewer. */
  private removeBall(ball: Ball) {
    if (!this.balls.delete(ball.body.id)) return;
    this.matter.world.remove(ball.body);
    ball.img.destroy();
    this.state.ballFinished(ball.userId);
    this.game.events.emit('ballFinished', ball.userId);
  }

  update(_time: number, delta: number) {
    if (!this.map) return;
    const transition = this.state.tick(Date.now());
    if (transition === 'podium') {
      // score figé à 0:00 : aucune bille ne finit sa course pendant le podium
      for (const ball of [...this.balls.values()]) this.removeBall(ball);
      this.specials.clear();
      this.game.events.emit('phase', 'podium');
    }
    if (transition === 'next') {
      this.recordGame();
      if (params.autoNext) {
        void this.newGame();
        return;
      }
    }
    // deux sous-pas par frame : une bille rapide ne traverse pas un obstacle fin
    const dt = Math.min(delta, 33.3) / 2; // Matter recommande ≤ 16.67 ms par pas
    for (let i = 0; i < 2; i++) {
      // setAngle(..., true) met à jour anglePrev : le solveur transmet l'élan du tourniquet
      for (const s of this.spinners) this.matter.body.setAngle(s.body, s.body.angle + (s.speed * dt) / 16.667, true);
      this.matter.world.step(dt);
    }
    for (const s of this.spinners) s.img.setRotation(s.body.angle);
    const now = this.time.now;
    const trail = this.frame++ % 2 === 0;
    for (const ball of this.balls.values()) {
      if (!ball.done) this.unstick(ball, now);
      const v = ball.body.velocity;
      const speed = Math.hypot(v.x, v.y);
      if (speed > MAX_SPEED) this.matter.body.setVelocity(ball.body, { x: (v.x / speed) * MAX_SPEED, y: (v.y / speed) * MAX_SPEED });
      ball.img.setPosition(ball.body.position.x, ball.body.position.y);
      if (trail) this.fx.trailAt(ball.body.position.x, ball.body.position.y, speed);
    }
    this.fx.update(delta);
    this.specials.update(delta);
    for (const ball of this.toRemove) this.removeBall(ball);
    this.toRemove.length = 0;
  }
}

function patternParam(): PatternId | undefined {
  return (PATTERNS as readonly string[]).includes(params.pattern ?? '') ? (params.pattern as PatternId) : undefined;
}
