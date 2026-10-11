import Phaser from 'phaser';
import { WIDTH, HEIGHT, GRAVITY_Y, params } from './config';
import { Backdrop } from './scenes/Backdrop';
import { Game } from './scenes/Game';
import { Hud } from './scenes/Hud';
import { createMenu } from './ui/menu';

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#000000', // fenêtre capturée par OBS : fond opaque, bandes noires hors 16:9
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: {
    default: 'matter',
    // itérations réduites (défaut 6/4) : les 2 sous-pas par frame assurent déjà la stabilité
    matter: { gravity: { x: 0, y: GRAVITY_Y }, enableSleeping: false, autoUpdate: false, positionIterations: 4, velocityIterations: 3 },
  },
  scene: [Backdrop, Game, Hud],
});

if (params.menu) createMenu(game);
