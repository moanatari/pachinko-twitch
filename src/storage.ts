// Persistance localStorage tolérante : stockage indisponible, plein ou corrompu → le jeu continue en mémoire.
export type KV = Pick<Storage, 'getItem' | 'setItem'>;

export function safeStorage(): KV | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Valeur JSON stockée, ou null si absente / illisible. À valider par l'appelant. */
export function readJson(kv: KV | null, key: string): unknown {
  try {
    const raw = kv?.getItem(key);
    return raw == null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeJson(kv: KV | null, key: string, value: unknown) {
  try {
    kv?.setItem(key, JSON.stringify(value));
  } catch { /* quota plein ou stockage indisponible : mémoire seulement */ }
}
