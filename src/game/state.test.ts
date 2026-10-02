import { describe, it, expect } from 'vitest';
import { GameState } from './state';

const alice = { id: 'a', name: 'Alice', color: '#f00' };
const bob = { id: 'b', name: 'Bob', color: '#0f0' };
const carol = { id: 'c', name: 'Carol', color: '#00f' };

function started(maxBalls = 10) {
  const s = new GameState(maxBalls, 15_000);
  s.start(0, 60_000);
  return s;
}

describe('GameState — billes', () => {
  it('une seule bille active par viewer', () => {
    const s = started();
    expect(s.canDrop('a')).toBe(true);
    s.ballStarted(alice);
    expect(s.canDrop('a')).toBe(false);
    expect(s.canDrop('b')).toBe(true);
  });

  it('peut relancer une fois la bille terminée', () => {
    const s = started();
    s.ballStarted(alice);
    s.ballFinished('a');
    expect(s.canDrop('a')).toBe(true);
  });

  it('plafond global maxBalls', () => {
    const s = started(2);
    s.ballStarted(alice);
    s.ballStarted(bob);
    expect(s.canDrop('c')).toBe(false);
    s.ballFinished('a');
    expect(s.canDrop('c')).toBe(true);
  });

  it('aucun drop pendant le podium', () => {
    const s = started();
    s.tick(60_000);
    expect(s.phase).toBe('podium');
    expect(s.canDrop('a')).toBe(false);
  });
});

describe('GameState — scores', () => {
  it('cumule les points et met à jour le nom', () => {
    const s = started();
    s.ballStarted(alice);
    s.addScore('a', 5, 10);
    s.addScore('a', 7, 20);
    s.ballStarted({ ...alice, name: 'AliceRenamed' });
    expect(s.players.get('a')).toMatchObject({ name: 'AliceRenamed', score: 12 });
  });

  it('ignore les points d\'un viewer inconnu', () => {
    const s = started();
    s.addScore('zzz', 5, 10);
    expect(s.players.size).toBe(0);
  });

  it('top(n) trié par score, ex æquo départagés par le premier arrivé', () => {
    const s = started();
    for (const p of [alice, bob, carol]) s.ballStarted(p);
    s.addScore('a', 10, 300);
    s.addScore('b', 10, 100);
    s.addScore('c', 50, 200);
    expect(s.top(3).map((p) => p.id)).toEqual(['c', 'b', 'a']);
    expect(s.top(2)).toHaveLength(2);
  });

  it('les billes qui finissent pendant le podium comptent encore', () => {
    const s = started();
    s.ballStarted(alice);
    s.tick(60_000);
    s.addScore('a', 100, 61_000);
    expect(s.players.get('a')!.score).toBe(100);
  });
});

describe('GameState — cycle', () => {
  it('timer basé sur l\'horodatage de fin', () => {
    const s = started();
    expect(s.remainingMs(15_000)).toBe(45_000);
    expect(s.remainingMs(90_000)).toBe(0);
  });

  it('playing → podium → next', () => {
    const s = started();
    expect(s.tick(59_999)).toBe(null);
    expect(s.tick(60_000)).toBe('podium');
    expect(s.tick(70_000)).toBe(null);
    expect(s.tick(75_000)).toBe('next');
  });

  it('endNow() termine la partie immédiatement', () => {
    const s = started();
    s.endNow(5_000);
    expect(s.tick(5_000)).toBe('podium');
  });

  it('start() remet tout à zéro', () => {
    const s = started();
    s.ballStarted(alice);
    s.addScore('a', 5, 1);
    s.start(100_000, 60_000);
    expect(s.players.size).toBe(0);
    expect(s.canDrop('a')).toBe(true);
    expect(s.phase).toBe('playing');
  });
});
