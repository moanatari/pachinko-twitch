import type { ThemeDef } from './types';
import { drawSnowflake } from './draw';

export const hiver: ThemeDef = {
  id: 'hiver',
  period: { from: '12-01', to: '02-29' },
  priority: 1,
  palette: {
    background: '#0a1424',
    frame: '#aeb8c6', // argent
    marquee: ['#e8f4ff'],
    peg: '#c8d2de',
    pegGolden: '#ffe9a8',
    bumperRing: '#e6eef8',
    bumperCore: '#3aa0ff',
    spinner: '#dfe8f2',
    ramp: '#b7c3d1',
    bins: ['#10233a', '#163049'], // givrés
    binHighlight: '#bfe9ff',
    text: '#eef6ff',
    accent: '#9fd8ff',
  },
  particles: { hit: drawSnowflake, bumper: drawSnowflake, bin: drawSnowflake, confetti: drawSnowflake },
  ambient: { sprite: drawSnowflake, count: 55, speed: 45, drift: 25, spin: 0.5, direction: 'down' },
  texts: { podiumTitle: 'Champions du froid' },
};
