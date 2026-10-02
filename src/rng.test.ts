import { describe, it, expect } from 'vitest';
import { Rng } from './rng';

describe('Rng', () => {
  it('même seed → même suite', () => {
    const a = new Rng(42), b = new Rng(42);
    expect(Array.from({ length: 20 }, () => a.next())).toEqual(Array.from({ length: 20 }, () => b.next()));
  });

  it('seeds différentes → suites différentes', () => expect(new Rng(1).next()).not.toBe(new Rng(2).next()));

  it('next() dans [0, 1[', () => {
    const r = new Rng(7);
    for (let i = 0; i < 10000; i++) { const v = r.next(); expect(v >= 0 && v < 1).toBe(true); }
  });

  it('int() inclusif aux deux bornes', () => {
    const r = new Rng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(r.int(2, 5));
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });

  it('range() dans [min, max[', () => {
    const r = new Rng(9);
    for (let i = 0; i < 1000; i++) { const v = r.range(-3, 4); expect(v >= -3 && v < 4).toBe(true); }
  });

  it('pick() et chance()', () => {
    const r = new Rng(5);
    expect(['a', 'b', 'c']).toContain(r.pick(['a', 'b', 'c']));
    expect(r.chance(0)).toBe(false);
    expect(r.chance(1)).toBe(true);
  });
});
