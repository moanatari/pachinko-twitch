import Phaser from 'phaser';
import { params, BOARD_W, WALL } from './config';
import type { Game } from './scenes/Game';
import { colorFor } from './twitch/users';

/** ?debug=1 : clic = drop d'un faux viewer, touche B = +10 bots, T = thème suivant, compteurs FPS / billes / points. */
export function setupDebug(scene: Game) {
  if (!params.debug) return;
  let clicks = 0;
  const fake = (id: string) => ({ id, name: id, color: colorFor(id) });
  scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
    if (p.x < BOARD_W) scene.requestDrop(fake(`debug-${++clicks}`), p.x);
  });

  let bots = params.bots;
  scene.input.keyboard?.on('keydown-B', () => { bots += 10; });
  scene.input.keyboard?.on('keydown-T', () => scene.nextTheme());
  // chaque bot relance dès que sa bille est terminée (4 spawns max par tick : pas de paquets)
  scene.time.addEvent({
    delay: 100, loop: true, callback: () => {
      for (let i = 0, spawned = 0; i < bots && spawned < 4; i++)
        if (scene.requestDrop(fake(`bot-${i}`), Phaser.Math.Between(WALL, BOARD_W - WALL))) spawned++;
    },
  });

  let finished = 0, points = 0;
  scene.game.events.on('ballFinished', () => finished++);
  scene.game.events.on('score', (_id: string, pts: number) => { points += pts; });
  (window as unknown as { game: Phaser.Game }).game = scene.game; // inspection depuis la console

  const fps = scene.add.text(WALL + 8, 8, '', { fontFamily: 'monospace', fontSize: '18px', color: '#7CFC00' }).setDepth(1000);
  scene.time.addEvent({
    delay: 500, loop: true,
    callback: () => fps.setText(
      `${Math.round(scene.game.loop.actualFps)} fps · ${scene.ballCount} billes · ${bots} bots · ${finished} finies · ${points} pts`),
  });
}
