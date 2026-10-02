// Réglages du streamer : défauts < sauvegardés (localStorage) < paramètres d'URL (session, jamais sauvegardés). Pur.
import { readJson, writeJson, type KV } from './storage';

export interface Settings {
  channel: string | null; // login Twitch, minuscules
  duration: number; // minutes
  maxBalls: number;
  theme: string; // 'auto' ou id d'un thème du registre
  shake: boolean;
  autoNext: boolean; // enchaînement automatique des parties
}

export const DEFAULT_SETTINGS: Settings = {
  channel: null, duration: 5, maxBalls: 150, theme: 'auto', shake: true, autoNext: true,
};
const KEY = 'pachinko-settings';

export const clampInt = (raw: string | null, def: number, min: number, max: number) => {
  const n = raw === null ? NaN : parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

/** Login Twitch : null = aucune chaîne, undefined = invalide (interpolé dans `JOIN #…` : rien d'autre ne passe). */
export function normalizeChannel(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (typeof v !== 'string') return undefined;
  const c = v.trim().toLowerCase();
  if (c === '') return null;
  return /^[a-z0-9_]{1,25}$/.test(c) ? c : undefined;
}

/** Chaque champ absent ou invalide reprend la valeur de `base`. */
export function sanitizeSettings(raw: unknown, base: Settings): Settings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, def: number, min: number, max: number) =>
    typeof v === 'number' || typeof v === 'string' ? clampInt(String(v), def, min, max) : def;
  const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
  const channel = normalizeChannel(r.channel);
  return {
    channel: channel === undefined ? base.channel : channel,
    duration: num(r.duration, base.duration, 1, 60),
    maxBalls: num(r.maxBalls, base.maxBalls, 1, 500),
    theme: typeof r.theme === 'string' && r.theme ? r.theme : base.theme,
    shake: bool(r.shake, base.shake),
    autoNext: bool(r.autoNext, base.autoNext),
  };
}

export const loadSettings = (kv: KV | null) => sanitizeSettings(readJson(kv, KEY), DEFAULT_SETTINGS);
export const saveSettings = (kv: KV | null, s: Settings) => writeJson(kv, KEY, s);

/** Réglages de la session : l'URL n'écrase que les clés présentes. */
export function mergeSettings(defaults: Settings, saved: unknown, search: string): Settings {
  const q = new URLSearchParams(search);
  const url: Record<string, unknown> = {};
  for (const k of ['channel', 'duration', 'maxBalls', 'theme'] as const) if (q.has(k)) url[k] = q.get(k);
  for (const k of ['shake', 'autoNext'] as const) if (q.has(k)) url[k] = q.get(k) !== '0';
  return sanitizeSettings(url, sanitizeSettings(saved, defaults));
}

/** Modification partielle venue du menu, validée champ par champ. */
export const updateSettings = (base: Settings, patch: Partial<Settings>) => sanitizeSettings({ ...base, ...patch }, base);

/** Valeurs brutes du formulaire du menu → champs réellement modifiés (champ vidé ou invalide = inchangé). */
export function formPatch(form: Record<string, unknown>, current: Settings): Partial<Settings> {
  const next = sanitizeSettings(form, current);
  return Object.fromEntries(Object.entries(next).filter(([k, v]) => v !== current[k as keyof Settings]));
}
