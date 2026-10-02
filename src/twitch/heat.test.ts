import { describe, it, expect } from 'vitest';
import { parseHeatClick } from './heat';

const BOARD = 1440 / 1920; // fraction de la vidéo occupée par le plateau
const msg = (o: object) => JSON.stringify(o);

describe('parseHeatClick', () => {
  it('clic d\'un viewer identifié', () =>
    expect(parseHeatClick(msg({ type: 'click', id: '123456', x: '0.375', y: '0.5' }), BOARD))
      .toEqual({ id: '123456', anonymous: false, x: 0.5 }));

  it('x numérique accepté', () =>
    expect(parseHeatClick(msg({ type: 'click', id: '1', x: 0, y: 0 }), BOARD)?.x).toBe(0));

  it('identité non partagée (U…) → anonyme', () =>
    expect(parseHeatClick(msg({ type: 'click', id: 'U98765', x: '0.1', y: '0.1' }), BOARD))
      .toMatchObject({ id: 'U98765', anonymous: true }));

  it('viewer déconnecté (A…) ignoré', () =>
    expect(parseHeatClick(msg({ type: 'click', id: 'A123', x: '0.1', y: '0.1' }), BOARD)).toBeNull());

  it('clic sur le panneau latéral ignoré', () =>
    expect(parseHeatClick(msg({ type: 'click', id: '1', x: '0.8', y: '0.5' }), BOARD)).toBeNull());

  it.each([
    ['autre type', msg({ type: 'hover', id: '1', x: '0.1', y: '0.1' })],
    ['message système', msg({ type: 'system', message: 'connected' })],
    ['x invalide', msg({ type: 'click', id: '1', x: 'abc', y: '0.1' })],
    ['x négatif', msg({ type: 'click', id: '1', x: '-0.1', y: '0.1' })],
    ['sans id', msg({ type: 'click', x: '0.1', y: '0.1' })],
    ['JSON invalide', '{pas du json'],
  ])('%s → null', (_name, raw) => expect(parseHeatClick(raw, BOARD)).toBeNull());
});
