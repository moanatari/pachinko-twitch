import type { ThemeDef } from './types';
import { drawPumpkin, drawCandy, drawBat } from './draw';

export const halloween: ThemeDef = {
  id: 'halloween',
  period: { from: '10-15', to: '11-01' },
  palette: {
    background: '#140a1f',
    frame: '#c2692a', // cuivre orangé
    marquee: ['#ff7a1a', '#9b4dff'],
    peg: '#d07a35',
    pegGolden: '#ff9a1f',
    bumperRing: '#d8c8e8',
    bumperCore: '#ff6a00',
    spinner: '#c9b6dd',
    ramp: '#c06a2a',
    bins: ['#1d1030', '#26143d'],
    binHighlight: '#ff9a1f',
    text: '#f6e7ff',
    accent: '#ff8c1a',
  },
  sprites: { bumper: drawPumpkin, pegGolden: drawCandy },
  particles: { bumper: drawCandy, confetti: drawCandy },
  ambient: { sprite: drawBat, count: 8, speed: 70, drift: 25, spin: 0, direction: 'across' },
  font: { family: 'Creepster', url: 'fonts/Creepster-Regular.woff2' },
  texts: { podiumTitle: 'Les plus terrifiants' },
};
