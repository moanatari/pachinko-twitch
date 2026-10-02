// Historique des parties (les 50 dernières, plus récente en tête), persisté. Pur (stockage injecté).
import { readJson, writeJson, type KV } from '../storage';

export interface GameRecord {
  at: number;
  durationMs: number;
  pattern: string;
  seed: number;
  theme: string;
  players: number;
  top3: { id: string; name: string; score: number }[];
}

const KEY = 'pachinko-history';
export const HISTORY_MAX = 50;

const valid = (r: unknown): r is GameRecord => {
  const o = r as Partial<GameRecord> | null;
  return typeof o?.at === 'number' && typeof o.durationMs === 'number' && typeof o.seed === 'number'
    && typeof o.pattern === 'string' && typeof o.theme === 'string' && typeof o.players === 'number'
    && Array.isArray(o.top3) && o.top3.every((p) => typeof p?.name === 'string' && typeof p.score === 'number');
};

export class History {
  list: GameRecord[];

  constructor(private readonly kv: KV | null) {
    const raw = readJson(kv, KEY);
    this.list = Array.isArray(raw) ? raw.filter(valid).slice(0, HISTORY_MAX) : [];
  }

  /** Partie sans joueur : non enregistrée. */
  add(r: GameRecord) {
    if (r.players === 0) return;
    this.list = [r, ...this.list].slice(0, HISTORY_MAX);
    writeJson(this.kv, KEY, this.list);
  }

  clear() {
    this.list = [];
    writeJson(this.kv, KEY, this.list);
  }
}
