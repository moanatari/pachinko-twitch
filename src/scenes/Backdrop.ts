import Phaser from 'phaser';

/** Fond du thème (+ ambiance animée à l'étape 9). Sous Game : insensible au camera shake de Game. */
export class Backdrop extends Phaser.Scene {
  private bg?: Phaser.GameObjects.Image;

  constructor() { super('Backdrop'); }

  create() {
    this.game.events.on('theme', () => {
      this.bg?.destroy();
      this.bg = this.add.image(0, 0, 'background').setOrigin(0);
    });
  }
}
