import { describe, it, expect } from 'vitest';
import { Monthly, MONTHLY_MAX, monthOf } from './monthly';
import type { Player } from './state';

const memory = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
// dates construites en heure locale : les tests ne dépendent pas du fuseau de la machine
const OCT = new Date(2026, 9, 15, 20).getTime();
const NOV = new Date(2026, 10, 1, 0, 0, 1).getTime();
const player = (id: string, score: number, scoredAt = 1, name = id.toUpperCase()): Player =>
  ({ id, name, color: '#f00', score, scoredAt, balls: 1 });
const ids = (m: Monthly, now = OCT, live?: Player[]) => m.top(10, now, live).map((e) => `${e.id}:${e.score}`);

describe('Monthly', () => {
  it('monthOf : mois civil local', () => {
    expect(monthOf(OCT)).toBe('2026-10');
    expect(monthOf(new Date(2026, 0, 1).getTime())).toBe('2026-01');
    expect(monthOf(new Date(2026, 9, 31, 23, 59, 59).getTime())).toBe('2026-10');
  });

  it('garde le meilleur score de chaque viewer', () => {
    const m = new Monthly(memory());
    m.record([player('a', 100), player('b', 50)], OCT);
    m.record([player('a', 80), player('b', 70)], OCT);
    expect(ids(m)).toEqual(['a:100', 'b:70']);
  });

  it('score égal : l\'entrée et sa date ne changent pas', () => {
    const m = new Monthly(memory());
    m.record([player('a', 100, 10)], OCT);
    m.record([player('a', 100, 99)], OCT);
    expect(m.top(1, OCT)[0].at).toBe(10);
  });

  it('record battu : nom, couleur et date mis à jour', () => {
    const m = new Monthly(memory());
    m.record([player('a', 100, 10, 'Viewer-1234')], OCT);
    m.record([{ ...player('a', 150, 20, 'Alice'), color: '#0f0' }], OCT);
    expect(m.top(1, OCT)).toEqual([{ id: 'a', name: 'Alice', color: '#0f0', score: 150, at: 20 }]);
  });

  it('ex æquo : le premier à avoir atteint le score est devant', () => {
    const m = new Monthly(memory());
    m.record([player('a', 100, 30), player('b', 100, 20)], OCT);
    expect(ids(m)).toEqual(['b:100', 'a:100']);
  });

  it('scores nuls et anonymes Heat (U…) ignorés', () => {
    const m = new Monthly(memory());
    m.record([player('a', 0), player('Uabc123', 500), player('streamer', 5)], OCT);
    expect(ids(m)).toEqual(['streamer:5']);
  });

  it('changement de mois : table vide, remplacée au premier enregistrement', () => {
    const kv = memory();
    const m = new Monthly(kv);
    m.record([player('a', 100)], OCT);
    expect(ids(m, NOV)).toEqual([]);
    expect(ids(m, OCT)).toEqual(['a:100']); // une simple lecture n'efface rien
    m.record([player('b', 10)], NOV);
    expect(ids(m, NOV)).toEqual(['b:10']);
    expect(ids(new Monthly(kv), NOV)).toEqual(['b:10']);
  });

  it('live : classement fusionné sans rien écrire', () => {
    const kv = memory();
    const m = new Monthly(kv);
    m.record([player('a', 100), player('b', 50)], OCT);
    expect(ids(m, OCT, [player('b', 120), player('c', 60), player('a', 10)])).toEqual(['b:120', 'a:100', 'c:60']);
    expect(ids(m)).toEqual(['a:100', 'b:50']);
    expect(ids(new Monthly(kv))).toEqual(['a:100', 'b:50']);
  });

  it('live un autre mois que la table : seuls les scores live', () => {
    const m = new Monthly(memory());
    m.record([player('a', 100)], OCT);
    expect(ids(m, NOV, [player('b', 5)])).toEqual(['b:5']);
  });

  it('remove() retire le viewer et persiste', () => {
    const kv = memory();
    const m = new Monthly(kv);
    m.record([player('a', 100), player('b', 50)], OCT);
    m.remove('a');
    m.remove('zzz');
    expect(ids(m)).toEqual(['b:50']);
    expect(ids(new Monthly(kv))).toEqual(['b:50']);
  });

  it('deux onglets sur le même stockage : aucun record écrasé', () => {
    const kv = memory();
    const tab1 = new Monthly(kv), tab2 = new Monthly(kv);
    tab1.record([player('a', 100)], OCT);
    tab2.record([player('b', 50)], OCT);
    expect(ids(new Monthly(kv))).toEqual(['a:100', 'b:50']);
  });

  it(`plafonné aux ${MONTHLY_MAX} meilleurs`, () => {
    const m = new Monthly(memory());
    m.record(Array.from({ length: MONTHLY_MAX + 20 }, (_, i) => player(`p${i}`, i + 1)), OCT);
    const all = m.top(Infinity, OCT);
    expect(all).toHaveLength(MONTHLY_MAX);
    expect(all[0].score).toBe(MONTHLY_MAX + 20);
    expect(all.at(-1)!.score).toBe(21);
  });

  it('stockage corrompu, absent ou entrées invalides : table vide, le jeu continue', () => {
    expect(ids(new Monthly(memory({ 'pachinko-monthly': '{oups' })))).toEqual([]);
    expect(ids(new Monthly(memory({ 'pachinko-monthly': '[1,2]' })))).toEqual([]);
    expect(ids(new Monthly(null))).toEqual([]);
    const kv = memory({ 'pachinko-monthly': JSON.stringify({ month: '2026-10', entries: [
      { id: 'a', name: 'A', color: '#f00', score: 10, at: 1 }, { id: 'b', score: 'x' }, null,
    ] }) });
    expect(ids(new Monthly(kv))).toEqual(['a:10']);
    const broken = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('quota'); } };
    const m = new Monthly(broken);
    expect(() => m.record([player('a', 1)], OCT)).not.toThrow();
    expect(ids(m)).toEqual(['a:1']);
  });
});
