import { describe, it, expect } from 'vitest';
import { History, HISTORY_MAX, type GameRecord } from './history';

const memory = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const rec = (at: number, players = 2): GameRecord => ({
  at, durationMs: 60_000, pattern: 'classique', seed: at, theme: 'base', players,
  top3: players ? [{ id: 'a', name: 'Alice', score: 10 }] : [],
});

describe('History', () => {
  it('plus récente en tête', () => {
    const h = new History(memory());
    h.add(rec(1));
    h.add(rec(2));
    expect(h.list.map((r) => r.at)).toEqual([2, 1]);
  });

  it(`plafonnée à ${HISTORY_MAX} (FIFO)`, () => {
    const h = new History(memory());
    for (let i = 0; i < 55; i++) h.add(rec(i));
    expect(h.list).toHaveLength(50);
    expect(h.list[0].at).toBe(54);
    expect(h.list[49].at).toBe(5);
  });

  it('partie sans joueur ignorée', () => {
    const h = new History(memory());
    h.add(rec(1, 0));
    expect(h.list).toEqual([]);
  });

  it('persistance', () => {
    const kv = memory();
    new History(kv).add(rec(1));
    expect(new History(kv).list).toEqual([rec(1)]);
  });

  it('clear() vide et persiste', () => {
    const kv = memory();
    const h = new History(kv);
    h.add(rec(1));
    h.clear();
    expect(h.list).toEqual([]);
    expect(new History(kv).list).toEqual([]);
  });

  it('stockage corrompu ou entrées invalides ignorés', () => {
    expect(new History(memory({ 'pachinko-history': '{oups' })).list).toEqual([]);
    const kv = memory({ 'pachinko-history': JSON.stringify([rec(1), { at: 'x' }, { ...rec(2), top3: [null] }]) });
    expect(new History(kv).list).toEqual([rec(1)]);
  });
});
