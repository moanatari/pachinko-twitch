import type { ThemeDef } from './types';
import { drawSakuraFlower, drawPetal } from './draw';

export const sakura: ThemeDef = {
  id: 'sakura',
  period: { from: '03-20', to: '04-30' },
  palette: {
    background: '#1a0f1c', // prune nocturne
    marquee: ['#ffc0d9'],
    pegGolden: '#ffb7d0',
    bumperCore: '#ff6fa8',
    bins: ['#24142a', '#2c1833'],
    binHighlight: '#ffc0d9',
    text: '#fff0f6',
    accent: '#ffb7d0',
  },
  sprites: { pegGolden: drawSakuraFlower },
  particles: { hit: drawPetal, bumper: drawPetal, bin: drawPetal, confetti: drawPetal },
  ambient: { sprite: drawPetal, count: 40, speed: 50, drift: 40, spin: 1, direction: 'down' },
  texts: { watermark: '花見' },
};
