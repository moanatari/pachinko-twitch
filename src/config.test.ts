import { describe, it, expect } from 'vitest';
import { parseParams } from './config';

describe('parseParams', () => {
  it('valeurs par défaut', () => {
    expect(parseParams('')).toEqual({
      channel: null, duration: 5, maxBalls: 150, seed: null, shake: true, autoNext: true,
      specialEvery: 20, specialEffects: 'double,moon,warp,slow,x2,gold,quake',
      debug: false, bots: 0, theme: 'auto', date: null, pattern: null,
    });
  });

  it('lit les paramètres', () => {
    const p = parseParams('?channel=MaChaine&duration=3&maxBalls=80&seed=42&shake=0&debug=1&bots=20&theme=noel&date=2026-12-15&pattern=trous&specialEvery=5&specialEffects=moon');
    expect(p).toEqual({
      channel: 'machaine', duration: 3, maxBalls: 80, seed: 42, shake: false, autoNext: true,
      specialEvery: 5, specialEffects: 'moon',
      debug: true, bots: 20, theme: 'noel', date: '2026-12-15', pattern: 'trous',
    });
  });

  it("l'URL prime sur les réglages sauvegardés", () => {
    const p = parseParams('?duration=3', { channel: 'machaine', duration: 10, maxBalls: 80 });
    expect(p).toMatchObject({ channel: 'machaine', duration: 3, maxBalls: 80 });
  });

  it('borne les valeurs numériques', () => {
    const p = parseParams('?duration=999&maxBalls=-4&debug=1&bots=100000');
    expect(p.duration).toBe(60);
    expect(p.maxBalls).toBe(1);
    expect(p.bots).toBe(500);
  });

  it('ignore les nombres invalides', () => {
    const p = parseParams('?duration=abc&seed=xyz');
    expect(p.duration).toBe(5);
    expect(p.seed).toBeNull();
  });

  it('bots seulement en debug', () => expect(parseParams('?bots=20').bots).toBe(0));
});
