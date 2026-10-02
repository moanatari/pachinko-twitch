import Phaser from 'phaser';
import { BOARD_W, HEIGHT } from '../config';

export class Backdrop extends Phaser.Scene {
  constructor() { super('Backdrop'); }

  create() {
    this.add.rectangle(0, 0, BOARD_W, HEIGHT, 0x0b0f1a).setOrigin(0);
  }
}
