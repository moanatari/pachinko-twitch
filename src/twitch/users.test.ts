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
});
