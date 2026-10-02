import type { ThemeDef } from './types';
import { drawStarfish, drawBuoy, drawBubble, drawDrop, drawShell } from './draw';

export const plage: ThemeDef = {
  id: 'plage',
  period: { from: '07-01', to: '08-31' },
  palette: {
    background: '#0b3440', // turquoise profond
    frame: '#d9b98a', // bois clair
    marquee: ['#7fe7e0', '#ffd98a'],
    peg: '#e3c48f', // sable
    pegGolden: '#ffd98a',
    bumperRing: '#ffffff',
    bumperCore: '#ff5a4f',
    spinner: '#ff9f6b',
    ramp: '#d9b98a',
    bins: ['#0f3f4c', '#14505e'],
    binHighlight: '#ffe3a3',
    text: '#f2fbff',
    accent: '#ffd98a',
  },
  sprites: { spinner: drawStarfish, bumper: drawBuoy },
  particles: { hit: drawDrop, bumper: drawDrop, bin: drawShell, confetti: drawShell },
  ambient: { sprite: drawBubble, count: 35, speed: 40, drift: 15, spin: 0, direction: 'up' },
  font: { family: 'Lilita One', url: 'fonts/LilitaOne-Regular.woff2' },
  texts: { podiumTitle: 'Rois de la plage' },
};
