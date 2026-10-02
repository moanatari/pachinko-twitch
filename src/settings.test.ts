import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS, loadSettings, saveSettings, mergeSettings, updateSettings, normalizeChannel,
} from './settings';

const memory = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe('loadSettings / saveSettings', () => {
  it('défauts sans rien de sauvegardé', () => expect(loadSettings(memory())).toEqual(DEFAULT_SETTINGS));
  it('stockage absent', () => expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS));
  it('stockage corrompu → défauts', () =>
    expect(loadSettings(memory({ 'pachinko-settings': '{pas du json' }))).toEqual(DEFAULT_SETTINGS));
  it('JSON valide mais pas un objet → défauts', () =>
    expect(loadSettings(memory({ 'pachinko-settings': '[1,2]' }))).toEqual(DEFAULT_SETTINGS));
  it('stockage qui lève (accès refusé, quota plein) : le jeu continue', () => {
    const broken = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('quota'); } };
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(broken, DEFAULT_SETTINGS)).not.toThrow();
  });
  it('aller-retour', () => {
    const kv = memory();
    const s = { channel: 'machaine', duration: 3, maxBalls: 80, theme: 'noel', shake: false, autoNext: false };
    saveSettings(kv, s);
    expect(loadSettings(kv)).toEqual(s);
  });
  it('bornes et valeurs invalides, champ par champ', () => {
    const kv = memory({ 'pachinko-settings': JSON.stringify({
      channel: 'a b', duration: 999, maxBalls: -3, theme: 42, shake: 'oui', autoNext: null,
    }) });
    expect(loadSettings(kv)).toEqual({ ...DEFAULT_SETTINGS, duration: 60, maxBalls: 1 });
  });
});

describe('normalizeChannel', () => {
  it.each([
    ['MaChaine ', 'machaine'],
    ['pachinko_42', 'pachinko_42'],
    ['', null],
    [null, null],
    ['a b', undefined],
    ['#chaine', undefined],
    ['chaine\r\nPRIVMSG #x :hack', undefined],
    ['x'.repeat(26), undefined],
    [42, undefined],
  ])('%j → %j', (v, expected) => expect(normalizeChannel(v)).toBe(expected));
});

describe('mergeSettings', () => {
  it('priorité URL > sauvegardé > défaut', () => {
    const s = mergeSettings(DEFAULT_SETTINGS, { duration: 10, maxBalls: 80 }, '?duration=3&shake=0');
    expect(s).toEqual({ ...DEFAULT_SETTINGS, duration: 3, maxBalls: 80, shake: false });
  });
  it('valeur d\'URL invalide ignorée : la valeur sauvegardée reste', () =>
    expect(mergeSettings(DEFAULT_SETTINGS, { duration: 10 }, '?duration=abc').duration).toBe(10));
  it('?channel= vide → aucune chaîne', () =>
    expect(mergeSettings(DEFAULT_SETTINGS, { channel: 'machaine' }, '?channel=').channel).toBeNull());
  it('autoNext et theme lus depuis l\'URL', () =>
    expect(mergeSettings(DEFAULT_SETTINGS, {}, '?autoNext=0&theme=noel')).toMatchObject({ autoNext: false, theme: 'noel' }));
});

describe('updateSettings', () => {
  it('valide le patch', () => {
    expect(updateSettings(DEFAULT_SETTINGS, { duration: 0, channel: 'Bad Name' })).toEqual({ ...DEFAULT_SETTINGS, duration: 1 });
    expect(updateSettings({ ...DEFAULT_SETTINGS, channel: 'x' }, { channel: null }).channel).toBeNull();
  });
  it('l\'URL n\'est jamais sauvegardée : le menu part des réglages SAUVEGARDÉS', () => {
    const kv = memory();
    saveSettings(kv, { ...DEFAULT_SETTINGS, duration: 10 });
    expect(mergeSettings(DEFAULT_SETTINGS, loadSettings(kv), '?duration=3').duration).toBe(3);
    saveSettings(kv, updateSettings(loadSettings(kv), { maxBalls: 80 }));
    expect(loadSettings(kv)).toMatchObject({ duration: 10, maxBalls: 80 });
  });
});
