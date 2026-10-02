import Phaser from 'phaser';
import { BOARD_W, HEIGHT } from '../config';
import type { Theme } from '../themes/types';

const MAX_AMBIENT = 60;

/** Fond du thème + ambiance animée. Scène sous Game : insensible au camera shake de Game. */
export class Backdrop extends Phaser.Scene {
  private bg?: Phaser.GameObjects.Image;
  private ambient?: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() { super('Backdrop'); }

  create() {
    this.game.events.on('theme-unload', () => this.clear());
    this.game.events.on('theme', (t: Theme) => {
      this.clear();
      this.bg = this.add.image(0, 0, 'background').setOrigin(0);
      if (t.ambient) this.ambient = this.makeAmbient(t.ambient);
    });
  }

  private clear() {
    this.bg?.destroy();
    this.ambient?.destroy();
    this.bg = this.ambient = undefined;
  }

  private makeAmbient(a: NonNullable<Theme['ambient']>) {
    const count = Math.min(a.count, MAX_AMBIENT);
    const across = a.direction === 'across';
    const dist = across ? BOARD_W + 80 : HEIGHT + 80;
    const lifespan = (dist / (a.speed * 0.8)) * 1000; // traverse tout le plateau
    const sign = a.direction === 'up' ? -1 : 1;
    const emitter = this.add.particles(0, 0, 'ambient', {
      x: across ? -40 : { min: 0, max: BOARD_W },
      y: across ? { min: 40, max: HEIGHT * 0.7 } : a.direction === 'up' ? HEIGHT + 40 : -40,
      speedX: across ? { min: a.speed * 0.7, max: a.speed * 1.2 } : { min: -a.drift, max: a.drift },
      speedY: across ? { min: -a.drift, max: a.drift } : { min: sign * a.speed * 0.6, max: sign * a.speed },
      rotate: a.spin ? { start: 0, end: 360 * a.spin * (lifespan / 1000) / 4 } : 0,
      scale: { min: 0.4, max: 0.9 },
      alpha: 0.5,
      lifespan,
      frequency: lifespan / count, // ≈ count particules visibles en régime établi
      maxParticles: count,
    });
    emitter.fastForward(lifespan); // l'écran est déjà peuplé à l'apparition du thème
    return emitter;
  }
}
