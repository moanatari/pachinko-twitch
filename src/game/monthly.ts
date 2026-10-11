// Top du mois : meilleur score de chaque viewer sur le mois civil, persisté. Pur (stockage injecté).
import { readJson, writeJson, type KV } from '../storage';
import type { Player } from './state';

export interface MonthlyEntry { id: string; name: string; color: string; score: number; at: number }

const KEY = 'pachinko-monthly';
export const MONTHLY_MAX = 500;

/** Mois civil en heure locale : 'YYYY-MM'. */
export const monthOf = (now: number) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const valid = (e: unknown): e is MonthlyEntry => {
  const o = e as Partial<MonthlyEntry> | null;
  return typeof o?.id === 'string' && typeof o.name === 'string' && typeof o.color === 'string'
    && typeof o.score === 'number' && typeof o.at === 'number';
};
const rank = (a: MonthlyEntry, b: MonthlyEntry) => b.score - a.score || a.at - b.at;

/** Meilleur score par viewer ; scores nuls et anonymes Heat (id `U…`, identité non durable) ignorés. */
function merge(entries: MonthlyEntry[], players: Iterable<Player>): MonthlyEntry[] {
  const best = new Map(entries.map((e) => [e.id, e]));
  for (const { id, name, color, score, scoredAt } of players) {
    if (score <= 0 || id.startsWith('U')) continue;
    if (score > (best.get(id)?.score ?? 0)) best.set(id, { id, name, color, score, at: scoredAt });
  }
  return [...best.values()].sort(rank);
}

export class Monthly {
  private month = '';
  private entries: MonthlyEntry[] = [];

  constructor(private readonly kv: KV | null) { this.load(); }

  /** Relu avant chaque écriture : un 2e onglet du jeu n'écrase pas les records du premier. */
  private load() {
    const raw = readJson(this.kv, KEY) as { month?: unknown; entries?: unknown } | null;
    if (typeof raw?.month !== 'string' || !Array.isArray(raw.entries)) return; // absent ou illisible : mémoire gardée
    this.month = raw.month;
    this.entries = raw.entries.filter(valid).sort(rank).slice(0, MONTHLY_MAX);
  }

  private save() { writeJson(this.kv, KEY, { month: this.month, entries: this.entries }); }

  /** Table du mois de `now` : vide si la table stockée est celle d'un autre mois. */
  private current(now: number) { return this.month === monthOf(now) ? this.entries : []; }

  /** Fin de partie : chaque joueur garde son meilleur score du mois. */
  record(players: Iterable<Player>, now: number) {
    this.load();
    this.entries = merge(this.current(now), players).slice(0, MONTHLY_MAX);
    this.month = monthOf(now);
    this.save();
  }

  /** `live` : scores de la partie en cours, comptés comme s'ils étaient déjà enregistrés (rien n'est écrit). */
  top(n: number, now: number, live?: Iterable<Player>): MonthlyEntry[] {
    const list = this.current(now);
    return (live ? merge(list, live) : list).slice(0, n);
  }

  remove(id: string) {
    this.load();
    this.entries = this.entries.filter((e) => e.id !== id);
    this.save();
  }
}
