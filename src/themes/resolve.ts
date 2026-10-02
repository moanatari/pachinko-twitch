// Résolution PURE du thème : date 'MM-DD' + forçage éventuel → thème fusionné avec ses parents.
import type { Theme, ThemeDef } from './types';
import { THEMES } from './index';

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function deepMerge<T>(base: T, over: unknown): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v; // tableaux et fonctions remplacés
  }
  return out as T;
}

export function mergeTheme(id: string, defs: Record<string, ThemeDef> = THEMES): Theme {
  const def = defs[id];
  if (id === 'base') return def as unknown as Theme;
  return deepMerge(mergeTheme(def.extends ?? 'base', defs), def);
}

const inPeriod = (d: string, p: { from: string; to: string }) =>
  p.from <= p.to ? p.from <= d && d <= p.to : d >= p.from || d <= p.to;

// Lit les définitions BRUTES : un enfant sans `period` n'hérite pas de celle du parent.
export function resolveTheme(date: string, forcedId?: string | null,
                             defs: Record<string, ThemeDef> = THEMES): Theme {
  if (forcedId) {
    if (defs[forcedId]) return mergeTheme(forcedId, defs);
    console.warn(`Thème inconnu : ${forcedId}`);
  }
  const match = Object.values(defs)
    .filter((t) => t.period && inPeriod(date, t.period as { from: string; to: string }))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
  return mergeTheme(match?.id ?? 'base', defs);
}

export function todayMMDD(param?: string | null): string {
  const m = /^\d{4}-(\d\d)-(\d\d)$/.exec(param ?? '');
  if (m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31) return `${m[1]}-${m[2]}`;
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
