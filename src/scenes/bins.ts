// Bacs qui défilent : la bande des valeurs tourne d'un nombre de cases tiré au hasard ; séparateurs et
// capteurs restent fixes. Animé à la main en temps de scène : figé en pause, comme la physique.
import Phaser from 'phaser';
import { params, BIN_SCROLL_MS } from '../config';
import { binShifts } from '../mapgen';
import type { Game } from './Game';
import type { Pulse } from './fx';

/** Fond, liseré et chiffre d'un bac, déplacés ensemble. */
export interface BinFace { obj: Phaser.GameObjects.Container; points: number }
/** Capteur d'un bac (l'`El` de Game) : sa valeur change au défilement. */
export interface BinSlot { points: number; pulse: Pulse }

export class Bins {
  private faces: BinFace[] = [];
  private slots: BinSlot[] = []; // de gauche à droite
  private slotOf: number[] = []; // face → bac occupé
  private from: number[] = []; // face → bac au début du glissement
  private left = 0;
  private width = 0;
  private wait = 0; // ms depuis le dernier défilement
  private anim = -1; // ms écoulées du glissement, -1 = au repos
  private delta = 0; // glissement en bacs, signé (chemin le plus court)

  constructor(private game: Game) {}

  /** Nouvelle carte : faces créées par Game.buildMap, détruites avec la carte. */
  attach(faces: BinFace[], slots: BinSlot[], left: number, width: number) {
    this.faces = faces;
    this.slots = slots;
    this.left = left;
    this.width = width;
    this.slotOf = faces.map((_, i) => i);
    this.from = [...this.slotOf];
    this.wait = 0;
    this.anim = -1;
  }

  /** Valeurs des bacs de gauche à droite (vérification navigateur). */
  get points() { return this.slots.map((s) => s.points); }

  update(dt: number) {
    if (this.anim >= 0) this.slide(dt);
    if (this.game.state.phase !== 'playing' || params.binScroll <= 0 || !this.faces.length) return; // attente comprise
    if ((this.wait += dt) < params.binScroll * 1000) return;
    this.wait = 0;
    this.shift();
  }

  private shift() {
    const n = this.faces.length;
    const ks = binShifts(this.points).filter((k) => k !== 0);
    const k = ks[Math.floor(Math.random() * ks.length)];
    this.delta = k > n / 2 ? k - n : k;
    for (let i = 0; i < n; i++) {
      this.from[i] = this.slotOf[i];
      this.slotOf[i] = (this.slotOf[i] + k) % n;
      this.slots[this.slotOf[i]].points = this.faces[i].points; // payé tout de suite, pendant le glissement
    }
    for (const s of this.slots) this.game.fx.pulse(s.pulse);
    this.anim = 0;
  }

  /** Une face qui sort d'un côté s'efface et réapparaît de l'autre (pas de masque). */
  private slide(dt: number) {
    const n = this.faces.length;
    this.anim = Math.min(BIN_SCROLL_MS, this.anim + dt);
    const e = Phaser.Math.Easing.Sine.InOut(this.anim / BIN_SCROLL_MS);
    for (let i = 0; i < n; i++) {
      const p = ((((this.from[i] + this.delta * e + 0.5) % n) + n) % n) - 0.5; // bac, dans [-0.5, n - 0.5)
      const out = Math.max(0, -p, p - (n - 1));
      this.faces[i].obj.setX(this.left + p * this.width).setAlpha(1 - 2 * out);
    }
    if (this.anim >= BIN_SCROLL_MS) this.anim = -1;
  }
}
