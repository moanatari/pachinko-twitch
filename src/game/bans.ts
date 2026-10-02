// Viewers exclus par le streamer, persistés. Pur (stockage injecté).
import { readJson, writeJson, type KV } from '../storage';

export interface Ban { id: string; name: string; at: number }
const KEY = 'pachinko-bans';

const valid = (b: unknown): b is Ban => {
  const o = b as Partial<Ban> | null;
  return typeof o?.id === 'string' && o.id !== '' && typeof o.name === 'string' && typeof o.at === 'number';
};

export class Bans {
  list: Ban[];

  constructor(private readonly kv: KV | null) {
    const raw = readJson(kv, KEY);
    this.list = Array.isArray(raw) ? raw.filter(valid) : [];
  }

  isBanned(id: string) { return this.list.some((b) => b.id === id); }

  add(b: Ban) {
    if (this.isBanned(b.id)) return;
    this.list.push(b);
    writeJson(this.kv, KEY, this.list);
  }

  remove(id: string) {
    this.list = this.list.filter((b) => b.id !== id);
    writeJson(this.kv, KEY, this.list);
  }
}
