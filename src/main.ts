import Phaser from 'phaser';
import { WIDTH, HEIGHT } from './config';
import { Backdrop } from './scenes/Backdrop';
import { Game } from './scenes/Game';
import { Hud } from './scenes/Hud';

new Phaser.Game({
  type: Phaser.WEBGL,
  width: WIDTH,
  height: HEIGHT,
  transparent: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: {
    default: 'matter',
    matter: { gravity: { x: 0, y: 1 }, enableSleeping: false, autoUpdate: false },
  },
  scene: [Backdrop, Game, Hud],
});
