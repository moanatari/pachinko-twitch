import { describe, it, expect } from 'vitest';
import { Bans } from './bans';

const memory = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const ban = (id: string) => ({ id, name: `N-${id}`, at: 1 });

describe('Bans', () => {
  it('ban / unban', () => {
    const b = new Bans(memory());
    b.add(ban('42'));
    expect(b.isBanned('42')).toBe(true);
    expect(b.isBanned('43')).toBe(false);
    b.remove('42');
    expect(b.isBanned('42')).toBe(false);
  });

  it('persistance', () => {
    const kv = memory();
    new Bans(kv).add(ban('42'));
    expect(new Bans(kv).list).toEqual([ban('42')]);
    const b = new Bans(kv);
    b.remove('42');
    expect(new Bans(kv).list).toEqual([]);
  });

  it('pas de doublons', () => {
    const b = new Bans(memory());
    b.add(ban('42'));
    b.add({ ...ban('42'), name: 'autre' });
    expect(b.list).toHaveLength(1);
  });

  it('ids anonymes U… acceptés', () => {
    const b = new Bans(memory());
    b.add(ban('U123abc'));
    expect(b.isBanned('U123abc')).toBe(true);
  });

  it('stockage corrompu ou entrées invalides ignorés', () => {
    expect(new Bans(memory({ 'pachinko-bans': 'pas du json' })).list).toEqual([]);
    const kv = memory({ 'pachinko-bans': JSON.stringify([ban('1'), null, { id: 2 }, { id: '', name: 'x', at: 1 }]) });
    expect(new Bans(kv).list).toEqual([ban('1')]);
  });

  it('sans stockage : fonctionne en mémoire', () => {
    const b = new Bans(null);
    b.add(ban('42'));
    expect(b.isBanned('42')).toBe(true);
  });
});
