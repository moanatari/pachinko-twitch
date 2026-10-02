import { describe, it, expect, vi } from 'vitest';
import { resolveTheme, mergeTheme, todayMMDD } from './resolve';
import type { ThemeDef } from './types';

const defs = {
  base:   { id: 'base', palette: { peg: '#a00', marquee: ['#fff'] }, ambient: null },
  winter: { id: 'winter', period: { from: '12-01', to: '02-29' }, priority: 1,
            ambient: { count: 10 }, palette: { peg: '#00f' } },
  xmas:   { id: 'xmas', extends: 'winter', period: { from: '12-01', to: '12-26' }, priority: 2,
            palette: { marquee: ['#f00', '#0f0'] } },
  // priorité haute : si la résolution lisait les thèmes fusionnés, il hériterait de la période
  // de winter et gagnerait → le test le détecterait
  noPeriodChild: { id: 'noPeriodChild', extends: 'winter', priority: 5 },
} as unknown as Record<string, ThemeDef>;

const id = (date: string, forced?: string) => resolveTheme(date, forced, defs).id;

describe('resolveTheme', () => {
  it.each([
    ['06-15', 'base'], ['12-15', 'xmas'], ['12-27', 'winter'], ['01-15', 'winter'],
    ['02-29', 'winter'], ['03-01', 'base'], ['11-30', 'base'],
  ])('%s → %s', (d, expected) => expect(id(d)).toBe(expected));

  it('un enfant sans période n\'hérite pas de celle du parent', () =>
    expect(id('01-15')).not.toBe('noPeriodChild'));

  it('thème forcé connu, même hors période', () => expect(id('06-15', 'xmas')).toBe('xmas'));

  it('thème forcé inconnu → résolution par date + warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(id('12-15', 'nope')).toBe('xmas');
    expect(warn).toHaveBeenCalled();
  });
});

describe('mergeTheme', () => {
  it('hérite des champs du parent', () => expect(mergeTheme('xmas', defs).ambient).toEqual({ count: 10 }));
  it('surcharge les champs simples', () => expect(mergeTheme('winter', defs).palette.peg).toBe('#00f'));
  it('un tableau enfant remplace celui du parent', () =>
    expect(mergeTheme('xmas', defs).palette.marquee).toEqual(['#f00', '#0f0']));
  it('ne modifie pas les définitions', () => {
    mergeTheme('xmas', defs);
    expect(defs.base.palette!.peg).toBe('#a00');
  });
});

describe('todayMMDD', () => {
  it('lit ?date= valide', () => expect(todayMMDD('2026-12-15')).toBe('12-15'));
  it.each(['hier', '2026-13-40', '2026-1-5', ''])('ignore %j → date du jour', (p) =>
    expect(todayMMDD(p)).toMatch(/^\d\d-\d\d$/));
});
