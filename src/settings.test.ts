import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS, loadSettings, saveSettings, mergeSettings, updateSettings, normalizeChannel, formPatch, settingsQuery,
  type Settings,
} from './settings';
import { ALL_EFFECTS } from './game/specials';

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
    const s = {
      ...DEFAULT_SETTINGS, channel: 'machaine', duration: 3, maxBalls: 80, theme: 'noel', shake: false, autoNext: false,
      specialEvery: 45, specialEffects: 'moon,warp',
    };
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

describe('settingsQuery (lien copiable)', () => {
  const s: Settings = {
    channel: 'machaine', duration: 3, maxBalls: 80, theme: 'noel', shake: false, autoNext: false, lane: false,
    specialEvery: 45, specialEffects: 'moon,warp',
  };
  it('aller-retour : le lien redonne exactement les réglages', () =>
    expect(mergeSettings(DEFAULT_SETTINGS, {}, `?${settingsQuery(s)}`)).toEqual(s));
  it('écrase tous les réglages sauvegardés, même par un défaut ou une chaîne vide', () =>
    expect(mergeSettings(DEFAULT_SETTINGS, s, `?${settingsQuery(DEFAULT_SETTINGS)}`)).toEqual(DEFAULT_SETTINGS));
  it('paramètres de dev de `params` laissés hors du lien', () =>
    expect(settingsQuery({ ...s, debug: true, seed: 42 } as Settings)).not.toMatch(/debug|seed/));
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

describe('formPatch (formulaire du menu)', () => {
  const current = { ...DEFAULT_SETTINGS, channel: 'machaine' };
  const form = { channel: 'machaine', duration: '5', maxBalls: '150', theme: 'auto', shake: true, autoNext: true };
  it('ne renvoie que les champs modifiés', () =>
    expect(formPatch({ ...form, duration: '3', shake: false }, current)).toEqual({ duration: 3, shake: false }));
  it('champ numérique vidé : inchangé (pas de plafond à 1)', () =>
    expect(formPatch({ ...form, duration: '', maxBalls: '' }, current)).toEqual({}));
  it('valeurs bornées', () => expect(formPatch({ ...form, maxBalls: '9999' }, current)).toEqual({ maxBalls: 500 }));
  it('chaîne vidée → aucune chaîne', () => expect(formPatch({ ...form, channel: '' }, current)).toEqual({ channel: null }));
});

describe('taquets spéciaux', () => {
  it('défauts : un toutes les 20 s, tous les effets', () =>
    expect(DEFAULT_SETTINGS).toMatchObject({ specialEvery: 20, specialEffects: ALL_EFFECTS }));

  it('specialEvery borné 0–300, 0 = désactivé', () => {
    expect(updateSettings(DEFAULT_SETTINGS, { specialEvery: 0 }).specialEvery).toBe(0);
    expect(updateSettings(DEFAULT_SETTINGS, { specialEvery: 9999 }).specialEvery).toBe(300);
    expect(updateSettings(DEFAULT_SETTINGS, { specialEvery: -5 }).specialEvery).toBe(0);
  });

  it('specialEffects nettoyé : ids inconnus ignorés, ordre canonique, vide = aucun effet', () => {
    expect(updateSettings(DEFAULT_SETTINGS, { specialEffects: 'warp,nope,moon' }).specialEffects).toBe('moon,warp');
    expect(updateSettings(DEFAULT_SETTINGS, { specialEffects: '' }).specialEffects).toBe('');
  });

  it('valeurs sauvegardées invalides → défauts', () => {
    const kv = memory({ 'pachinko-settings': JSON.stringify({ specialEvery: 'abc', specialEffects: 42 }) });
    expect(loadSettings(kv)).toEqual(DEFAULT_SETTINGS);
  });

  it('surcharge d\'URL, ids inconnus ignorés', () => {
    expect(mergeSettings(DEFAULT_SETTINGS, {}, '?specialEvery=5&specialEffects=moon,nope,warp'))
      .toMatchObject({ specialEvery: 5, specialEffects: 'moon,warp' });
    expect(mergeSettings(DEFAULT_SETTINGS, {}, '?specialEffects=').specialEffects).toBe('');
  });

  it('formPatch : champ vidé inchangé, cases décochées prises en compte', () => {
    expect(formPatch({ specialEvery: '', specialEffects: 'moon' }, DEFAULT_SETTINGS)).toEqual({ specialEffects: 'moon' });
    expect(formPatch({ specialEvery: '0', specialEffects: ALL_EFFECTS }, DEFAULT_SETTINGS)).toEqual({ specialEvery: 0 });
    expect(formPatch({ specialEvery: '20', specialEffects: '' }, DEFAULT_SETTINGS)).toEqual({ specialEffects: '' });
  });
});

describe('couloir du bas', () => {
  it('activé par défaut', () => expect(DEFAULT_SETTINGS.lane).toBe(true));
  it('lane=0 dans l\'URL', () => expect(mergeSettings(DEFAULT_SETTINGS, {}, '?lane=0').lane).toBe(false));
  it('valeur sauvegardée invalide → défaut', () => expect(mergeSettings(DEFAULT_SETTINGS, { lane: 'non' }, '').lane).toBe(true));
  it('formPatch : case décochée', () => expect(formPatch({ ...DEFAULT_SETTINGS, lane: false }, DEFAULT_SETTINGS)).toEqual({ lane: false }));
});
