import { describe, it, expect, vi } from 'vitest';
import { UserDirectory, colorFor, type RemoteUser } from './users';

const DAY = 86_400_000;
const twitchUser: RemoteUser = { display_name: 'Twitch', profile_image_url: 'https://cdn/x.png' };

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

describe('UserDirectory', () => {
  it('requêtes simultanées pour le même id dédupliquées', async () => {
    const fetchUser = vi.fn(async () => twitchUser);
    const dir = new UserDirectory(fetchUser, null);
    const [a, b] = await Promise.all([dir.resolve('1'), dir.resolve('1')]);
    expect(fetchUser).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ name: 'Twitch', avatar: 'https://cdn/x.png' });
  });

  it('pas de nouvelle requête pour un viewer en cache', async () => {
    const fetchUser = vi.fn(async () => twitchUser);
    const dir = new UserDirectory(fetchUser, null);
    await dir.resolve('1');
    await dir.resolve('1');
    expect(fetchUser).toHaveBeenCalledTimes(1);
    expect(dir.get('1')?.name).toBe('Twitch');
  });

  it('le cache survit à un rechargement (localStorage)', async () => {
    const storage = memoryStorage();
    await new UserDirectory(async () => twitchUser, storage).resolve('1');
    const fetchUser = vi.fn(async () => twitchUser);
    const reloaded = new UserDirectory(fetchUser, storage);
    expect(reloaded.get('1')?.name).toBe('Twitch');
    await reloaded.resolve('1');
    expect(fetchUser).not.toHaveBeenCalled();
  });

  it('entrée expirée après le TTL → nouvelle requête', async () => {
    let now = 0;
    const fetchUser = vi.fn(async () => twitchUser);
    const dir = new UserDirectory(fetchUser, null, () => now);
    await dir.resolve('1');
    now = 8 * DAY;
    expect(dir.get('1')).toBeUndefined();
    await dir.resolve('1');
    expect(fetchUser).toHaveBeenCalledTimes(2);
  });

  it('échec réseau → null, sans mise en cache (réessai possible)', async () => {
    const fetchUser = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(twitchUser);
    const dir = new UserDirectory(fetchUser, null);
    expect(await dir.resolve('1')).toBeNull();
    expect(await dir.resolve('1')).toMatchObject({ name: 'Twitch' });
  });

  it('réponse API inattendue (sans display_name) → null, rien en cache', async () => {
    const storage = memoryStorage();
    const dir = new UserDirectory(async () => ({}) as unknown as RemoteUser, storage);
    expect(await dir.resolve('123')).toBeNull();
    expect(dir.get('123')).toBeUndefined();
    expect(storage.getItem('pachinko-users') ?? '{}').not.toContain('123');
  });

  it('profile_image_url invalide → nom gardé, pas d\'avatar', async () => {
    const dir = new UserDirectory(async () => ({ display_name: 'Bob', profile_image_url: 42 }) as unknown as RemoteUser, null);
    expect(await dir.resolve('7')).toMatchObject({ name: 'Bob', avatar: null });
  });

  it('entrée de cache sans nom (ancien cache corrompu) ignorée au chargement', () => {
    const storage = memoryStorage();
    storage.setItem('pachinko-users', JSON.stringify({ 9: { avatar: null, at: Date.now() } }));
    expect(new UserDirectory(async () => null, storage).get('9')).toBeUndefined();
  });

  it('ids anonymes (U…) jamais recherchés', async () => {
    const fetchUser = vi.fn(async () => twitchUser);
    expect(await new UserDirectory(fetchUser, null).resolve('U123')).toBeNull();
    expect(fetchUser).not.toHaveBeenCalled();
  });

  it('localStorage inutilisable ou corrompu : le jeu continue', async () => {
    const broken = { getItem: () => '{pas du json', setItem: () => { throw new Error('quota'); } };
    const dir = new UserDirectory(async () => twitchUser, broken);
    expect(await dir.resolve('1')).toMatchObject({ name: 'Twitch' });
  });
});

describe('colorFor', () => {
  it('déterministe et au format #rrggbb', () => {
    expect(colorFor('123')).toBe(colorFor('123'));
    expect(colorFor('123')).toMatch(/^#[0-9a-f]{6}$/);
    expect(colorFor('123')).not.toBe(colorFor('456'));
  });

  it('ids voisins → teintes bien distinctes', () => {
    const hue = (c: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
      const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    const hues = ['bot-1', 'bot-2', 'bot-3', '41234560', '41234561'].map((id) => hue(colorFor(id)));
    for (let i = 1; i < hues.length; i++) {
      const diff = Math.abs(hues[i] - hues[i - 1]);
      expect(Math.min(diff, 360 - diff)).toBeGreaterThan(25);
    }
  });
});
