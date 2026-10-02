import Phaser from 'phaser';
import { BOARD_W, PANEL_W, HEIGHT } from '../config';

export class Hud extends Phaser.Scene {
  constructor() { super({ key: 'Hud', active: true }); }

  create() {
    this.add.rectangle(BOARD_W, 0, PANEL_W, HEIGHT, 0x10141f).setOrigin(0);
  }
}
