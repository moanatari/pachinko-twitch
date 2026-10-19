// Billes d'animation : pendant l'attente du premier joueur, des billes sans joueur animent le plateau.
// Hors GameState (ni classement, ni timer, ni plafond). À la première vraie bille, elles se figent puis éclatent.
import Phaser from 'phaser';
import { params, BOARD_W, WALL, BALL_R, ATTRACT_EVERY_MS, ATTRACT_MAX, ATTRACT_POP_MS } from '../config';
import type { Game } from './Game';

export class Attract {
  private since = 0; // ms depuis la dernière bille lâchée
  private popIn = 0; // > 0 : billes figées, éclatement dans popIn ms

  constructor(private game: Game) {}

  /** Nouvelle carte : les billes ont déjà été retirées par Game.loadGame. */
  clear() { this.since = this.popIn = 0; }

  update(dt: number) {
    const g = this.game;
    if (this.popIn > 0) {
      if ((this.popIn -= dt) > 0) return;
      for (const b of [...g.balls.values()]) { // une fois par partie : allocation acceptée
        if (!b.fake) continue;
        g.fx.pop(b.body.position.x, b.body.position.y);
        g.removeBall(b);
      }
      return;
    }
    if (!g.state.waiting) {
      if (!g.fakeCount) return;
      for (const b of g.balls.values()) if (b.fake) g.matter.body.setStatic(b.body, true);
      this.popIn = ATTRACT_POP_MS;
      return;
    }
    if (!params.attract || g.fakeCount >= ATTRACT_MAX || (this.since += dt) < ATTRACT_EVERY_MS) return;
    this.since = 0;
    g.dropFake(Phaser.Math.Between(WALL + BALL_R * 2, BOARD_W - WALL - BALL_R * 2));
  }
}
