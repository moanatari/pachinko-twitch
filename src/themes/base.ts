import type { ThemeDef } from './types';

/** Police japonaise : toujours chargée (filigranes et titres en kanji, quel que soit le thème). */
export const KANJI_FONT = { family: 'Dela Gothic One', url: 'fonts/DelaGothicOne-Regular.woff2' };

// Pachinko japonais sobre et clinquant : laque sombre, laiton, chrome, rouge laqué.
export const base: ThemeDef = {
  id: 'base',
  palette: {
    background: '#0b0f1a',
    frame: '#b8862b',
    marquee: ['#ffd27a'],
    peg: '#c9a227',
    pegGolden: '#ffd34d',
    bumperRing: '#d8dde6',
    bumperCore: '#c8102e',
    spinner: '#d8dde6',
    ramp: '#c9a227',
    bins: ['#121827', '#182033'],
    binHighlight: '#e8b84a',
    text: '#f3ead2',
    accent: '#e8b84a',
    ballRim: null,
  },
  sprites: {},
  particles: { hit: null, bumper: null, bin: null, confetti: null },
  ambient: null,
  font: KANJI_FONT,
  texts: { podiumTitle: '大当り', watermark: 'パチンコ' },
};
