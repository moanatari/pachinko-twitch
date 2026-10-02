import Phaser from 'phaser';
import { BOARD_W, PANEL_W, HEIGHT, WIDTH } from '../config';
import type { GameState, Player } from '../game/state';
import type { Theme } from '../themes/types';
import { avatarKey } from '../twitch/avatars';
import { NAME_FONT } from './fx';

const ROWS = 10;
const ROW_H = 54;
const ROWS_TOP = 288;
const RENDER_EVERY_MS = 250; // le top 10 n'est recalculé qu'au plus 4 fois par seconde

const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;
const short = (s: string, n = 15) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const mmss = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const slotY = (i: number) => ROWS_TOP + i * ROW_H;

/** Ligne du classement, attachée à un joueur ; glisse vers son rang quand il change. */
interface Line {
  id: string | null;
  slot: number;
  score: number;
  c: Phaser.GameObjects.Container;
  avatar: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  points: Phaser.GameObjects.Text;
}

interface PodiumSlot {
  parts: Phaser.GameObjects.GameObject[];
  avatar: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  score: Phaser.GameObjects.Text;
}

/** Panneau latéral (timer, classement) + podium de fin de partie par-dessus le plateau. */
export class Hud extends Phaser.Scene {
  private theme?: Theme;
  private ui?: Phaser.GameObjects.Container;
  private timer?: Phaser.GameObjects.Text;
  private count?: Phaser.GameObjects.Text;
  private ranks: Phaser.GameObjects.Text[] = [];
  private lines: Line[] = [];
  private podium?: Phaser.GameObjects.Container;
  private podiumEmpty?: Phaser.GameObjects.Text;
  private podiumSlots: PodiumSlot[] = [];
  private dirty = true;
  private lastRender = 0;

  constructor() { super({ key: 'Hud', active: true }); }

  private get state() { return this.game.registry.get('state') as GameState | undefined; }

  create() {
    const ev = this.game.events;
    ev.on('theme', (t: Theme) => { this.theme = t; this.build(); });
    for (const e of ['score', 'drop', 'phase', 'player']) ev.on(e, () => { this.dirty = true; });
    ev.on('phase', (p: string) => (p === 'podium' ? this.showPodium() : this.hidePodium()));
  }

  /** Texture de bille du joueur : avatar si chargé, sinon bille de repli, sinon bille d'acier. */
  private ballTexture(id: string) {
    if (this.textures.exists(avatarKey(id))) return avatarKey(id);
    return this.textures.exists(`fb-${id}`) ? `fb-${id}` : 'ball';
  }

  /** (Re)construit le panneau aux couleurs du thème. */
  private build() {
    const t = this.theme!;
    const pal = t.palette;
    const font = t.font.family;
    this.ui?.destroy();
    this.lines = [];
    this.ranks = [];
    const x0 = BOARD_W, cx = BOARD_W + PANEL_W / 2;
    const ui = this.add.container(0, 0);
    this.ui = ui;

    ui.add(this.add.rectangle(x0, 0, PANEL_W, HEIGHT, hex(pal.background)).setOrigin(0));
    ui.add(this.add.rectangle(x0, 0, 4, HEIGHT, hex(pal.frame)).setOrigin(0));
    if (t.texts.watermark) {
      ui.add(this.add.text(cx, HEIGHT / 2, t.texts.watermark.split('').join('\n'), {
        fontFamily: font, fontSize: '170px', color: pal.accent, align: 'center', lineSpacing: -30,
      }).setOrigin(0.5).setAlpha(0.06));
    }
    ui.add(this.add.text(cx, 34, 'PACHINKO', { fontFamily: font, fontSize: '40px', color: pal.accent }).setOrigin(0.5, 0));
    this.timer = this.add.text(cx, 96, '', { fontFamily: font, fontSize: '84px', color: pal.text }).setOrigin(0.5, 0);
    ui.add(this.timer);
    ui.add(this.add.rectangle(x0 + 40, 222, PANEL_W - 80, 2, hex(pal.frame)).setOrigin(0));
    ui.add(this.add.text(x0 + 40, 240, 'CLASSEMENT', { fontFamily: font, fontSize: '22px', color: pal.accent }));

    for (let i = 0; i < ROWS; i++) {
      const rank = this.add.text(x0 + 40, slotY(i) + 6, `${i + 1}`, {
        fontFamily: font, fontSize: '26px', color: i < 3 ? pal.accent : pal.text,
      }).setAlpha(0.25);
      ui.add(rank);
      this.ranks.push(rank);
    }
    // 2× ROWS lignes : celles qui sortent du top s'effacent pendant que d'autres entrent
    for (let i = 0; i < ROWS * 2; i++) {
      const avatar = this.add.image(x0 + 106, 20, 'ball').setDisplaySize(36, 36);
      const name = this.add.text(x0 + 132, 6, '', { fontFamily: NAME_FONT, fontSize: '25px', color: pal.text });
      const points = this.add.text(WIDTH - 40, 6, '', { fontFamily: font, fontSize: '26px', color: pal.text }).setOrigin(1, 0);
      const c = this.add.container(0, slotY(ROWS), [avatar, name, points]).setAlpha(0);
      ui.add(c);
      this.lines.push({ id: null, slot: -1, score: 0, c, avatar, name, points });
    }
    this.count = this.add.text(cx, HEIGHT - 110, '', { fontFamily: NAME_FONT, fontSize: '22px', color: pal.text })
      .setOrigin(0.5).setAlpha(0.7);
    ui.add(this.count);
    ui.add(this.add.text(cx, HEIGHT - 60, 'Clique sur le stream\nou tape !drop dans le tchat', {
      fontFamily: NAME_FONT, fontSize: '22px', color: pal.accent, align: 'center',
    }).setOrigin(0.5));
    this.dirty = true;
  }

  private renderTop() {
    const s = this.state;
    if (!s) return;
    const top = s.top(ROWS);
    const inTop = new Set(top.map((p) => p.id));
    for (const l of this.lines) {
      if (l.id && !inTop.has(l.id)) {
        l.id = null;
        l.slot = -1;
        this.tweens.killTweensOf(l.c);
        this.tweens.add({ targets: l.c, alpha: 0, x: 40, duration: 300 });
      }
    }
    top.forEach((p: Player, i) => {
      let l = this.lines.find((x) => x.id === p.id);
      if (!l) {
        l = this.lines.find((x) => x.id === null)!;
        this.tweens.killTweensOf(l.c);
        l.id = p.id;
        l.slot = -1;
        l.score = p.score;
        l.c.setPosition(0, slotY(i) + 30).setAlpha(0);
      }
      l.name.setText(short(p.name));
      l.points.setText(p.score.toLocaleString('fr-FR'));
      l.avatar.setTexture(this.ballTexture(p.id)).setDisplaySize(36, 36);
      if (p.score > l.score) {
        l.score = p.score;
        this.tweens.add({ targets: l.points, scale: { from: 1.25, to: 1 }, duration: 250, ease: 'Back.easeOut' });
      }
      if (l.slot !== i) {
        l.slot = i;
        this.tweens.killTweensOf(l.c);
        this.tweens.add({ targets: l.c, x: 0, y: slotY(i), alpha: 1, duration: 380, ease: 'Cubic.easeOut' });
      }
    });
    this.ranks.forEach((r, i) => r.setAlpha(i < top.length ? 1 : 0.25));
    const n = s.players.size;
    this.count?.setText(n ? `${n} joueur${n > 1 ? 's' : ''}` : '');
  }

  private showPodium() {
    const t = this.theme!, pal = t.palette, font = t.font.family;
    this.hidePodium();
    const c = this.add.container(0, 0).setDepth(10);
    this.podium = c;
    c.add(this.add.rectangle(0, 0, BOARD_W, HEIGHT, 0x000000, 0.78).setOrigin(0));
    c.add(this.add.particles(0, 0, 'fx-confetti', {
      x: { min: 0, max: BOARD_W }, y: -20, speedY: { min: 120, max: 320 }, speedX: { min: -60, max: 60 },
      rotate: { min: 0, max: 360 }, scale: { min: 0.6, max: 1.2 }, lifespan: 5000, frequency: 45, quantity: 2,
      tint: [hex(pal.accent), hex(pal.bumperCore), hex(pal.text)],
    }));
    const title = this.add.text(BOARD_W / 2, 120, t.texts.podiumTitle, { fontFamily: font, fontSize: '120px', color: pal.accent }).setOrigin(0.5);
    c.add(title);
    this.tweens.add({ targets: title, scale: { from: 0.3, to: 1 }, duration: 600, ease: 'Back.easeOut' });
    c.add(this.add.text(BOARD_W / 2, 230, 'FIN DE PARTIE', { fontFamily: font, fontSize: '36px', color: pal.text }).setOrigin(0.5));
    this.podiumEmpty = this.add.text(BOARD_W / 2, 520, 'Personne n\'a joué…', { fontFamily: NAME_FONT, fontSize: '40px', color: pal.text }).setOrigin(0.5);
    c.add(this.podiumEmpty);
    // 2e à gauche, 1er au centre (plus haut), 3e à droite
    const layout = [{ i: 0, x: BOARD_W / 2, h: 330 }, { i: 1, x: BOARD_W / 2 - 400, h: 240 }, { i: 2, x: BOARD_W / 2 + 400, h: 170 }];
    const base = HEIGHT - 110;
    this.podiumSlots = layout.map(({ i, x, h }) => {
      const block = this.add.rectangle(x, base, 300, h, hex(pal.frame), 0.9).setOrigin(0.5, 1);
      const rank = this.add.text(x, base - h + 20, String(i + 1), { fontFamily: font, fontSize: '72px', color: pal.background }).setOrigin(0.5, 0);
      const avatar = this.add.image(x, base - h - 190, 'ball').setDisplaySize(110, 110);
      const name = this.add.text(x, base - h - 105, '', { fontFamily: NAME_FONT, fontSize: '34px', color: pal.text, fontStyle: 'bold' }).setOrigin(0.5);
      const score = this.add.text(x, base - h - 52, '', { fontFamily: font, fontSize: '34px', color: pal.accent }).setOrigin(0.5);
      const parts = [block, rank, avatar, name, score];
      c.add(parts);
      // les marches montent depuis le bas, 3e puis 2e puis 1er
      for (const o of parts) {
        const y = o.y;
        o.y += 400;
        this.tweens.add({ targets: o, y, duration: 700, delay: 300 + (2 - i) * 350, ease: 'Back.easeOut' });
      }
      return { parts, avatar, name, score };
    });
    this.refreshPodium();
  }

  /** Les billes encore en jeu au coup de sifflet comptent : le podium suit le classement en direct. */
  private refreshPodium() {
    const top = this.state?.top(3) ?? [];
    this.podiumEmpty?.setVisible(top.length === 0);
    this.podiumSlots.forEach((slot, i) => {
      const p = top[i];
      for (const o of slot.parts) (o as Phaser.GameObjects.Image).setVisible(!!p);
      if (!p) return;
      slot.avatar.setTexture(this.ballTexture(p.id)).setDisplaySize(110, 110);
      slot.name.setText(short(p.name, 18));
      slot.score.setText(`${p.score.toLocaleString('fr-FR')} pts`);
    });
  }

  private hidePodium() {
    if (this.podium) for (const o of this.podium.list) this.tweens.killTweensOf(o);
    this.podium?.destroy();
    this.podium = undefined;
    this.podiumSlots = [];
  }

  update(time: number) {
    const s = this.state;
    if (!s || !this.timer) return;
    const paused = this.game.registry.get('paused') === true;
    this.timer.setText(paused ? 'PAUSE' : s.phase === 'podium' ? '0:00' : mmss(s.remainingMs(Date.now())));
    if (this.dirty && time - this.lastRender > RENDER_EVERY_MS) {
      this.dirty = false;
      this.lastRender = time;
      this.renderTop();
      if (this.podium) this.refreshPodium();
    }
  }
}
