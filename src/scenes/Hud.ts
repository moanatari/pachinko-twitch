import Phaser from 'phaser';
import { BOARD_W, PANEL_W, HEIGHT, WIDTH } from '../config';
import type { GameState, Player } from '../game/state';
import type { Theme } from '../themes/types';

const ROWS = 10;
const ROW_H = 52;
const NAME_FONT = '"Segoe UI", Roboto, "Helvetica Neue", sans-serif';
const RENDER_EVERY_MS = 250; // le top 10 n'est recalculé qu'au plus 4 fois par seconde

const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;
const short = (s: string, n = 16) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const mmss = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

interface Row { rank: Phaser.GameObjects.Text; name: Phaser.GameObjects.Text; score: Phaser.GameObjects.Text }
interface PodiumSlot {
  parts: (Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text)[];
  name: Phaser.GameObjects.Text;
  score: Phaser.GameObjects.Text;
}

/** Panneau latéral (timer, classement) + podium de fin de partie par-dessus le plateau. */
export class Hud extends Phaser.Scene {
  private theme?: Theme;
  private ui?: Phaser.GameObjects.Container;
  private timer?: Phaser.GameObjects.Text;
  private count?: Phaser.GameObjects.Text;
  private rows: Row[] = [];
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
    for (const e of ['score', 'drop', 'phase']) ev.on(e, () => { this.dirty = true; });
    ev.on('phase', (p: string) => (p === 'podium' ? this.showPodium() : this.hidePodium()));
  }

  /** (Re)construit le panneau aux couleurs du thème. */
  private build() {
    const t = this.theme!;
    const pal = t.palette;
    this.ui?.destroy();
    this.rows = [];
    const font = t.font.family;
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
      const y = 290 + i * ROW_H;
      const row: Row = {
        rank: this.add.text(x0 + 40, y, `${i + 1}`, { fontFamily: font, fontSize: '26px', color: i < 3 ? pal.accent : pal.text }),
        name: this.add.text(x0 + 90, y + 2, '', { fontFamily: NAME_FONT, fontSize: '26px', color: pal.text }),
        score: this.add.text(WIDTH - 40, y, '', { fontFamily: font, fontSize: '26px', color: pal.text }).setOrigin(1, 0),
      };
      ui.add([row.rank, row.name, row.score]);
      this.rows.push(row);
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
    this.rows.forEach((row, i) => {
      const p: Player | undefined = top[i];
      row.rank.setAlpha(p ? 1 : 0.25);
      row.name.setText(p ? short(p.name) : '');
      row.score.setText(p ? p.score.toLocaleString('fr-FR') : '');
    });
    const n = s.players.size;
    this.count?.setText(n ? `${n} joueur${n > 1 ? 's' : ''}` : '');
  }

  private showPodium() {
    const t = this.theme!, pal = t.palette, font = t.font.family;
    this.hidePodium();
    const c = this.add.container(0, 0).setDepth(10);
    this.podium = c;
    c.add(this.add.rectangle(0, 0, BOARD_W, HEIGHT, 0x000000, 0.78).setOrigin(0));
    c.add(this.add.text(BOARD_W / 2, 120, t.texts.podiumTitle, { fontFamily: font, fontSize: '120px', color: pal.accent }).setOrigin(0.5));
    c.add(this.add.text(BOARD_W / 2, 230, 'FIN DE PARTIE', { fontFamily: font, fontSize: '36px', color: pal.text }).setOrigin(0.5));
    this.podiumEmpty = this.add.text(BOARD_W / 2, 520, 'Personne n\'a joué…', { fontFamily: NAME_FONT, fontSize: '40px', color: pal.text }).setOrigin(0.5);
    c.add(this.podiumEmpty);
    // 2e à gauche, 1er au centre (plus haut), 3e à droite
    const layout = [{ i: 1, x: BOARD_W / 2 - 400, h: 260 }, { i: 0, x: BOARD_W / 2, h: 360 }, { i: 2, x: BOARD_W / 2 + 400, h: 190 }];
    const base = HEIGHT - 120;
    this.podiumSlots = layout.sort((a, b) => a.i - b.i).map(({ i, x, h }) => {
      const block = this.add.rectangle(x, base, 300, h, hex(pal.frame), 0.9).setOrigin(0.5, 1);
      const rank = this.add.text(x, base - h + 20, String(i + 1), { fontFamily: font, fontSize: '72px', color: pal.background }).setOrigin(0.5, 0);
      const name = this.add.text(x, base - h - 90, '', { fontFamily: NAME_FONT, fontSize: '36px', color: pal.text, fontStyle: 'bold' }).setOrigin(0.5);
      const score = this.add.text(x, base - h - 40, '', { fontFamily: font, fontSize: '34px', color: pal.accent }).setOrigin(0.5);
      c.add([block, rank, name, score]);
      return { parts: [block, rank, name, score], name, score };
    });
    this.refreshPodium();
  }

  /** Les billes encore en jeu au coup de sifflet comptent : le podium suit le classement en direct. */
  private refreshPodium() {
    const top = this.state?.top(3) ?? [];
    this.podiumEmpty?.setVisible(top.length === 0);
    this.podiumSlots.forEach((slot, i) => {
      const p = top[i];
      for (const o of slot.parts) o.setVisible(!!p);
      if (!p) return;
      slot.name.setText(short(p.name, 18));
      slot.score.setText(`${p.score.toLocaleString('fr-FR')} pts`);
    });
  }

  private hidePodium() {
    this.podium?.destroy();
    this.podium = undefined;
    this.podiumSlots = [];
  }

  update(time: number) {
    const s = this.state;
    if (!s || !this.timer) return;
    this.timer.setText(s.phase === 'podium' ? '0:00' : mmss(s.remainingMs(Date.now())));
    if (this.dirty && time - this.lastRender > RENDER_EVERY_MS) {
      this.dirty = false;
      this.lastRender = time;
      this.renderTop();
      if (this.podium) this.refreshPodium();
    }
  }
}
