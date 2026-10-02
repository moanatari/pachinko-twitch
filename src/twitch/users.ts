// Annuaire des viewers : id Twitch → nom + avatar, via l'API publique de Heat (sans token).
// Pur : aucune dépendance Phaser (les textures d'avatar sont dans avatars.ts).
import { safeStorage, type KV } from '../storage';

export interface RemoteUser { display_name: string; profile_image_url: string }
export interface UserInfo { name: string; avatar: string | null; at: number }

const TTL = 7 * 86_400_000;
const STORAGE_KEY = 'pachinko-users';

export class UserDirectory {
  private cache = new Map<string, UserInfo>();
  private inflight = new Map<string, Promise<UserInfo | null>>();

  constructor(
    private fetchUser: (id: string) => Promise<RemoteUser | null>,
    private storage: KV | null,
    private now: () => number = Date.now,
  ) {
    try {
      const saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? '{}') as Record<string, UserInfo>;
      for (const [id, u] of Object.entries(saved)) if (typeof u?.name === 'string' && u.name) this.cache.set(id, u);
    } catch { /* cache corrompu : on repart de zéro */ }
  }

  get(id: string): UserInfo | undefined {
    const u = this.cache.get(id);
    return u && this.now() - u.at < TTL ? u : undefined;
  }

  /** Nom + avatar ; une seule requête réseau par id, même appelé plusieurs fois en parallèle. */
  resolve(id: string): Promise<UserInfo | null> {
    const cached = this.get(id);
    if (cached) return Promise.resolve(cached);
    if (!/^\d+$/.test(id)) return Promise.resolve(null); // anonymes (U…) : rien à chercher
    let p = this.inflight.get(id);
    if (!p) {
      p = this.fetchUser(id)
        .then((r) => {
          // réponse d'un service tiers : un nom non valide finirait en `undefined` dans le Hud et figerait la boucle de jeu
          if (typeof r?.display_name !== 'string' || !r.display_name.trim()) return null;
          const avatar = typeof r.profile_image_url === 'string' && r.profile_image_url ? r.profile_image_url : null;
          const info = { name: r.display_name, avatar, at: this.now() };
          this.cache.set(id, info);
          this.persist();
          return info;
        })
        .catch(() => null)
        .finally(() => this.inflight.delete(id));
      this.inflight.set(id, p);
    }
    return p;
  }

  private persist() {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(this.cache)));
    } catch { /* quota plein ou stockage indisponible : cache mémoire seulement */ }
  }
}

/** Couleur stable dérivée de l'id (viewers sans couleur de tchat). */
export function colorFor(id: string): string {
  let h = 2166136261; // FNV-1a : un caractère de différence change tout le hash
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const hue = (h * 137.508) % 360, s = 0.65, l = 0.6; // angle d'or : teintes bien réparties
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

async function fetchHeatUser(id: string): Promise<RemoteUser | null> {
  const res = await fetch(`https://heat-api.j38.net/user/${id}`);
  return res.ok ? ((await res.json()) as RemoteUser) : null;
}

export const users = new UserDirectory(fetchHeatUser, safeStorage());
