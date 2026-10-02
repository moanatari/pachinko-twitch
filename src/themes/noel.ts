import type { ThemeDef } from './types';
import { drawChristmasBall, drawStar } from './draw';

// Hérite d'Hiver (neige, flocons) ; la période ne s'hérite pas : elle est redéclarée.
export const noel: ThemeDef = {
  id: 'noel',
  extends: 'hiver',
  period: { from: '12-01', to: '12-26' },
  priority: 2,
  palette: {
    background: '#0b1410',
    frame: '#b8862b',
    marquee: ['#ff3b3b', '#3bd16f', '#ffd34d', '#4da6ff'], // guirlande
    peg: '#d4af37',
    pegGolden: '#e0262b',
    bumperRing: '#e9d9a8',
    bumperCore: '#e0262b',
    spinner: '#e9d9a8',
    ramp: '#d4af37',
    bins: ['#102a1c', '#3a1014'],
    binHighlight: '#ffd34d',
    text: '#fff6e8',
    accent: '#ffd34d',
  },
  sprites: { pegGolden: drawChristmasBall },
  particles: { bumper: drawStar, bin: drawStar, confetti: drawStar },
  font: { family: 'Mountains of Christmas', url: 'fonts/MountainsOfChristmas-Bold.woff2' },
  texts: { podiumTitle: 'Joyeux Noël !' },
};
