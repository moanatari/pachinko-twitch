# Mode streamer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le jeu tourne en plein écran dans un navigateur classique, le streamer y joue à la souris et dispose d'un menu DOM (Partie, Joueurs, Historique, Réglages) pour configurer, piloter et modérer, avec réglages, bans et historique persistés.

**Architecture:** Modules purs testés (`storage.ts`, `settings.ts`, `game/bans.ts`, `game/history.ts`, extensions de `GameState` et du parseur tchat), puis câblage dans la scène `Game` (API publique `admin`, `replay`, `moderate`, `applySettings`), puis un calque DOM `ui/menu.ts` qui n'appelle que cette API et lit l'état. La pause gèle les scènes `Game` et `Backdrop` (Phaser `scene.pause`) et décale les horodatages de `GameState`.

**Tech Stack:** Vite + TypeScript, Phaser 3.90 (Matter), vitest ; `playwright-core` (devDependency) pour la vérification navigateur sur le Chrome installé.

**Spec:** `docs/superpowers/specs/2026-10-02-streamer-mode-design.md` (complète `PLAN.md` et `docs/superpowers/specs/2026-10-02-themes-design.md`).

## Global Constraints

- Phaser **3.90**, aucune autre dépendance runtime ; aucun backend, aucun token Twitch.
- Code et identifiants en anglais, textes affichés en français (accents compris).
- Modules purs sans Phaser : `storage.ts`, `settings.ts`, `game/state.ts`, `game/bans.ts`, `game/history.ts`, `ui/html.ts`, parseur IRC.
- Priorité des réglages : **paramètres d'URL** (session, non sauvegardés) > **réglages sauvegardés** > défauts. `debug`, `bots`, `seed`, `pattern`, `date` restent URL uniquement.
- Bornes : `duration` 1–60 (défaut 5), `maxBalls` 1–500 (défaut 150), `theme` `'auto'` ou id du registre, `shake` défaut true, `autoNext` défaut true.
- Clés de stockage : `pachinko-settings`, `pachinko-history`, `pachinko-bans` (et `pachinko-users` existant) ; stockage indisponible ou plein → mémoire seulement.
- Historique : 50 dernières parties (FIFO), plus récente en tête ; partie sans joueur non enregistrée.
- Le menu ne touche jamais aux scènes : API publique de `Game` + `game.events`. Menu ouvert = pas de pause implicite.
- Perf : 60 fps à 150 billes menu fermé ; menu ouvert, pas de chute visible. Listes rafraîchies au plus 2×/s, menu ouvert seulement.

## Review Focus

1. **Échap en plein écran (Fullscreen API, Chrome)** : le navigateur quitte le plein écran au lieu d'ouvrir le menu → `navigator.keyboard.lock(['Escape'])` après `requestFullscreen` (Task 6) ; Firefox : F11 recommandé. Non testable en headless : à vérifier à la main.
2. **Clic sur un bouton du menu pendant le rafraîchissement 2×/s** : un bouton remplacé entre `mousedown` et `mouseup` perd son `click` → actions déclenchées sur `pointerdown` délégué (Task 6), exercé par le script navigateur (Task 7) qui clique pendant les rafraîchissements.
3. **Chaîne saisie avec espaces, majuscules, `#` ou retour à la ligne** : interpolée dans `JOIN #<chaîne>` (injection IRC) → `normalizeChannel` refuse tout sauf `[a-z0-9_]{1,25}` (test Task 1).
4. **Noms, couleurs et URLs d'avatar tiers injectés dans le DOM du menu** (XSS, CSS injecté) → `esc`, `safeColor`, `safeImage` (test Task 6).
5. **Longue pause avec des billes en jeu** : l'horloge de scène saute à la reprise et l'anti-blocage (8 s) retirerait toutes les billes → ancres remises à zéro à la reprise (Task 4), exercé par le script navigateur (pause 9 s, Task 7). Toute action autre que Pause sort de la pause (Terminer pendant la pause → podium immédiat).

---

### Task 1: Stockage et réglages persistants

**Files:**
- Create: `src/storage.ts`, `src/settings.ts`, `src/settings.test.ts`
- Modify: `src/config.ts:1-34,75`, `src/config.test.ts`, `src/twitch/users.ts:6,77-86`

**Interfaces:**
- Produces:
  - `storage.ts` : `type KV = Pick<Storage, 'getItem' | 'setItem'>`, `safeStorage(): KV | null`, `readJson(kv: KV | null, key: string): unknown` (null si absent/corrompu), `writeJson(kv: KV | null, key: string, value: unknown): void`.
  - `settings.ts` : `interface Settings { channel: string | null; duration: number; maxBalls: number; theme: string; shake: boolean; autoNext: boolean }`, `DEFAULT_SETTINGS`, `clampInt(raw: string | null, def, min, max): number`, `normalizeChannel(v: unknown): string | null | undefined`, `sanitizeSettings(raw: unknown, base: Settings): Settings`, `loadSettings(kv): Settings`, `saveSettings(kv, s: Settings): void`, `mergeSettings(defaults: Settings, saved: unknown, search: string): Settings`, `updateSettings(base: Settings, patch: Partial<Settings>): Settings`.
  - `config.ts` : `interface Params extends Settings { seed; debug; bots; date; pattern }`, `parseParams(search: string, saved?: unknown): Params`, `params` (objet **mutable**, `theme` vaut `'auto'` par défaut au lieu de `null`).

- [ ] **Step 1: Write the failing test** — `src/settings.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS, loadSettings, saveSettings, mergeSettings, updateSettings, normalizeChannel,
} from './settings';

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
    const s = { channel: 'machaine', duration: 3, maxBalls: 80, theme: 'noel', shake: false, autoNext: false };
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/settings.test.ts`
Expected: FAIL — `Failed to resolve import "./settings"`.

- [ ] **Step 3: Write `src/storage.ts`**

```ts
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
```

- [ ] **Step 4: Write `src/settings.ts`**

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/settings.test.ts`
Expected: PASS (tous les tests).

- [ ] **Step 6: Update `src/config.test.ts` (failing first)**

Remplacer les deux premiers tests et ajouter le test des réglages sauvegardés :

```ts
  it('valeurs par défaut', () => {
    expect(parseParams('')).toEqual({
      channel: null, duration: 5, maxBalls: 150, seed: null, shake: true, autoNext: true,
      debug: false, bots: 0, theme: 'auto', date: null, pattern: null,
    });
  });

  it('lit les paramètres', () => {
    const p = parseParams('?channel=MaChaine&duration=3&maxBalls=80&seed=42&shake=0&debug=1&bots=20&theme=noel&date=2026-12-15&pattern=trous');
    expect(p).toEqual({
      channel: 'machaine', duration: 3, maxBalls: 80, seed: 42, shake: false, autoNext: true,
      debug: true, bots: 20, theme: 'noel', date: '2026-12-15', pattern: 'trous',
    });
  });

  it('l\'URL prime sur les réglages sauvegardés', () => {
    const p = parseParams('?duration=3', { channel: 'machaine', duration: 10, maxBalls: 80 });
    expect(p).toMatchObject({ channel: 'machaine', duration: 3, maxBalls: 80 });
  });
```

Run: `npx vitest run src/config.test.ts`
Expected: FAIL — `autoNext` absent, `theme` vaut `null`.

- [ ] **Step 7: Rewrite the top of `src/config.ts` (lignes 1-34) and the last line**

```ts
import { mergeSettings, loadSettings, clampInt, DEFAULT_SETTINGS, type Settings } from './settings';
import { safeStorage } from './storage';

/** Réglages (menu, sauvegardés, surchargés par l'URL) + paramètres d'URL réservés au dev.
 *  Objet MUTABLE : `Game.applySettings` le met à jour à chaud, le code le relit à chaque usage. */
export interface Params extends Settings {
  seed: number | null;
  debug: boolean;
  bots: number;
  date: string | null;
  pattern: string | null;
}

export function parseParams(search: string, saved: unknown = DEFAULT_SETTINGS): Params {
  const q = new URLSearchParams(search);
  const debug = q.get('debug') === '1';
  const seed = parseInt(q.get('seed') ?? '', 10);
  return {
    ...mergeSettings(DEFAULT_SETTINGS, saved, search),
    seed: Number.isFinite(seed) ? seed : null,
    debug,
    bots: debug ? clampInt(q.get('bots'), 0, 0, 500) : 0,
    date: q.get('date') || null,
    pattern: q.get('pattern') || null,
  };
}
```

Dernière ligne :

```ts
export const params = parseParams(typeof location === 'undefined' ? '' : location.search, loadSettings(safeStorage()));
```

Dans `src/scenes/Game.ts:108`, `params.theme` vaut maintenant `'auto'` au lieu de `null` :

```ts
    const theme = resolveTheme(todayMMDD(params.date), this.forcedTheme ?? (params.theme === 'auto' ? null : params.theme));
```

- [ ] **Step 8: Reuse `safeStorage` in `src/twitch/users.ts`**

Supprimer la ligne `type KV = Pick<Storage, 'getItem' | 'setItem'>;` et la fonction locale `safeStorage` (lignes 77-83), ajouter en tête :

```ts
import { safeStorage, type KV } from '../storage';
```

(`export const users = new UserDirectory(fetchHeatUser, safeStorage());` reste inchangé.)

- [ ] **Step 9: Run tests and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: tous les tests PASS, tsc sans erreur.

- [ ] **Step 10: Commit**

```bash
git add src/storage.ts src/settings.ts src/settings.test.ts src/config.ts src/config.test.ts src/twitch/users.ts src/scenes/Game.ts
git commit -m "feat: réglages persistants (défauts < sauvegardés < URL) et stockage tolérant"
```

---

### Task 2: GameState — pause, billes jouées, modération

**Files:**
- Modify: `src/game/state.ts`, `src/game/state.test.ts`

**Interfaces:**
- Produces (sur `GameState`) : `maxBalls: number` (public, mutable), `startedAt: number`, `get paused(): boolean`, `pause(now)`, `resume(now)`, `hasBall(id): boolean`, `resetScore(id)`, `remove(id)` ; `Player.balls: number` (billes jouées) ; `remainingMs` gelé en pause ; `canDrop` faux en pause ; `tick` sans effet en pause.

- [ ] **Step 1: Write the failing tests** — ajouter à `src/game/state.test.ts`

```ts
describe('GameState — pause', () => {
  it('gèle le timer, refuse les drops, bloque les transitions', () => {
    const s = started();
    s.pause(10_000);
    expect(s.paused).toBe(true);
    expect(s.remainingMs(40_000)).toBe(50_000);
    expect(s.canDrop('a')).toBe(false);
    expect(s.tick(70_000)).toBe(null);
    s.resume(40_000);
    expect(s.paused).toBe(false);
    expect(s.remainingMs(40_000)).toBe(50_000);
    expect(s.canDrop('a')).toBe(true);
    expect(s.tick(89_999)).toBe(null);
    expect(s.tick(90_000)).toBe('podium');
  });

  it('pause pendant le podium : fin du podium décalée', () => {
    const s = started();
    expect(s.tick(60_000)).toBe('podium'); // podium jusqu'à 75 000
    s.pause(70_000);
    expect(s.tick(80_000)).toBe(null);
    s.resume(90_000);
    expect(s.tick(94_999)).toBe(null);
    expect(s.tick(95_000)).toBe('next');
  });

  it('pause idempotente, reprise sans pause sans effet', () => {
    const s = started();
    s.resume(5_000);
    expect(s.remainingMs(5_000)).toBe(55_000);
    s.pause(10_000);
    s.pause(20_000);
    s.resume(30_000);
    expect(s.remainingMs(30_000)).toBe(50_000);
  });

  it('la durée jouée exclut la pause', () => {
    const s = started();
    s.pause(10_000);
    s.resume(30_000);
    expect(s.endsAt - s.startedAt).toBe(60_000);
  });

  it('start() lève la pause', () => {
    const s = started();
    s.pause(10_000);
    s.start(20_000, 60_000);
    expect(s.paused).toBe(false);
    expect(s.canDrop('a')).toBe(true);
  });
});

describe('GameState — joueurs et modération', () => {
  it('compte les billes jouées', () => {
    const s = started();
    s.ballStarted(alice);
    s.ballFinished('a');
    s.ballStarted(alice);
    expect(s.players.get('a')!.balls).toBe(2);
  });

  it('hasBall suit la bille active', () => {
    const s = started();
    s.ballStarted(alice);
    expect(s.hasBall('a')).toBe(true);
    s.ballFinished('a');
    expect(s.hasBall('a')).toBe(false);
  });

  it('resetScore() remet à zéro sans retirer le joueur, ignore les inconnus', () => {
    const s = started();
    s.ballStarted(alice);
    s.addScore('a', 50, 10);
    s.resetScore('a');
    s.resetScore('zzz');
    expect(s.players.get('a')!.score).toBe(0);
    expect(s.players.size).toBe(1);
  });

  it('remove() retire le joueur et sa bille active', () => {
    const s = started();
    s.ballStarted(alice);
    s.ballStarted(bob);
    s.remove('a');
    expect(s.players.has('a')).toBe(false);
    expect(s.hasBall('a')).toBe(false);
    expect(s.top(10).map((p) => p.id)).toEqual(['b']);
  });

  it('maxBalls modifiable à chaud', () => {
    const s = started(10);
    s.ballStarted(alice);
    s.maxBalls = 1;
    expect(s.canDrop('b')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/state.test.ts`
Expected: FAIL — `s.pause is not a function` (et assertions `balls` / `hasBall`).

- [ ] **Step 3: Implement in `src/game/state.ts`**

Remplacer l'interface `Player`, les champs, le constructeur, `start`, `canDrop`, `ballStarted`, `remainingMs`, `tick`, et ajouter les nouvelles méthodes :

```ts
export interface Player extends Viewer { score: number; scoredAt: number; balls: number }

export class GameState {
  readonly players = new Map<string, Player>();
  private readonly active = new Set<string>(); // viewers ayant une bille en jeu
  phase: Phase = 'playing';
  startedAt = 0; // décalé comme endsAt à chaque reprise : endsAt - startedAt = durée jouée
  endsAt = 0;
  private podiumEndsAt = 0;
  private pausedAt: number | null = null;

  constructor(public maxBalls: number, private readonly podiumMs: number) {}

  get paused() { return this.pausedAt !== null; }

  start(now: number, durationMs: number) {
    this.players.clear();
    this.active.clear();
    this.phase = 'playing';
    this.pausedAt = null;
    this.startedAt = now;
    this.endsAt = now + durationMs;
  }

  canDrop(userId: string): boolean {
    return this.phase === 'playing' && !this.paused && !this.active.has(userId) && this.active.size < this.maxBalls;
  }

  hasBall(userId: string) { return this.active.has(userId); }

  ballStarted(v: Viewer) {
    this.active.add(v.id);
    const p = this.players.get(v.id);
    if (p) Object.assign(p, { name: v.name, color: v.color, balls: p.balls + 1 });
    else this.players.set(v.id, { ...v, score: 0, scoredAt: 0, balls: 1 });
  }
```

(`ballFinished`, `rename`, `addScore`, `top`, `endNow` inchangés.) Puis :

```ts
  resetScore(userId: string) {
    const p = this.players.get(userId);
    if (p) p.score = 0;
  }

  /** Exclusion : le joueur disparaît du classement (sa bille a déjà été retirée par Game). */
  remove(userId: string) {
    this.players.delete(userId);
    this.active.delete(userId);
  }

  /** Gel complet : timer arrêté, drops refusés, aucune transition. */
  pause(now: number) {
    if (this.pausedAt === null) this.pausedAt = now;
  }

  /** Reprise : fin de partie et fin de podium décalées de la durée de la pause. */
  resume(now: number) {
    if (this.pausedAt === null) return;
    const d = now - this.pausedAt;
    this.startedAt += d;
    this.endsAt += d;
    this.podiumEndsAt += d;
    this.pausedAt = null;
  }

  remainingMs(now: number) { return Math.max(0, this.endsAt - (this.pausedAt ?? now)); }

  /** Fait avancer les phases ; renvoie la transition survenue ('next' = lancer une nouvelle partie). */
  tick(now: number): 'podium' | 'next' | null {
    if (this.paused) return null;
    if (this.phase === 'playing' && now >= this.endsAt) {
      this.phase = 'podium';
      this.podiumEndsAt = now + this.podiumMs;
      return 'podium';
    }
    if (this.phase === 'podium' && now >= this.podiumEndsAt) return 'next';
    return null;
  }
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/game/state.test.ts && npx tsc --noEmit`
Expected: PASS, tsc sans erreur.

- [ ] **Step 5: Commit**

```bash
git add src/game/state.ts src/game/state.test.ts
git commit -m "feat: GameState — pause/reprise, billes jouées, score à zéro, exclusion"
```

---

### Task 3: Bans et historique persistants

**Files:**
- Create: `src/game/bans.ts`, `src/game/bans.test.ts`, `src/game/history.ts`, `src/game/history.test.ts`

**Interfaces:**
- Consumes: `readJson`, `writeJson`, `KV` (Task 1).
- Produces:
  - `bans.ts` : `interface Ban { id: string; name: string; at: number }`, `class Bans { constructor(kv: KV | null); list: Ban[]; isBanned(id): boolean; add(b: Ban): void; remove(id): void }`.
  - `history.ts` : `interface GameRecord { at: number; durationMs: number; pattern: string; seed: number; theme: string; players: number; top3: { id: string; name: string; score: number }[] }`, `HISTORY_MAX = 50`, `class History { constructor(kv: KV | null); list: GameRecord[] /* plus récente en tête */; add(r: GameRecord): void; clear(): void }`.

- [ ] **Step 1: Write the failing tests**

`src/game/bans.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { Bans } from './bans';

const memory = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const ban = (id: string) => ({ id, name: `N-${id}`, at: 1 });

describe('Bans', () => {
  it('ban / unban', () => {
    const b = new Bans(memory());
    b.add(ban('42'));
    expect(b.isBanned('42')).toBe(true);
    expect(b.isBanned('43')).toBe(false);
    b.remove('42');
    expect(b.isBanned('42')).toBe(false);
  });

  it('persistance', () => {
    const kv = memory();
    new Bans(kv).add(ban('42'));
    expect(new Bans(kv).list).toEqual([ban('42')]);
    const b = new Bans(kv);
    b.remove('42');
    expect(new Bans(kv).list).toEqual([]);
  });

  it('pas de doublons', () => {
    const b = new Bans(memory());
    b.add(ban('42'));
    b.add({ ...ban('42'), name: 'autre' });
    expect(b.list).toHaveLength(1);
  });

  it('ids anonymes U… acceptés', () => {
    const b = new Bans(memory());
    b.add(ban('U123abc'));
    expect(b.isBanned('U123abc')).toBe(true);
  });

  it('stockage corrompu ou entrées invalides ignorés', () => {
    expect(new Bans(memory({ 'pachinko-bans': 'pas du json' })).list).toEqual([]);
    const kv = memory({ 'pachinko-bans': JSON.stringify([ban('1'), null, { id: 2 }, { id: '', name: 'x', at: 1 }]) });
    expect(new Bans(kv).list).toEqual([ban('1')]);
  });

  it('sans stockage : fonctionne en mémoire', () => {
    const b = new Bans(null);
    b.add(ban('42'));
    expect(b.isBanned('42')).toBe(true);
  });
});
```

`src/game/history.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { History, HISTORY_MAX, type GameRecord } from './history';

const memory = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const rec = (at: number, players = 2): GameRecord => ({
  at, durationMs: 60_000, pattern: 'classique', seed: at, theme: 'base', players,
  top3: players ? [{ id: 'a', name: 'Alice', score: 10 }] : [],
});

describe('History', () => {
  it('plus récente en tête', () => {
    const h = new History(memory());
    h.add(rec(1));
    h.add(rec(2));
    expect(h.list.map((r) => r.at)).toEqual([2, 1]);
  });

  it(`plafonnée à ${HISTORY_MAX} (FIFO)`, () => {
    const h = new History(memory());
    for (let i = 0; i < 55; i++) h.add(rec(i));
    expect(h.list).toHaveLength(50);
    expect(h.list[0].at).toBe(54);
    expect(h.list[49].at).toBe(5);
  });

  it('partie sans joueur ignorée', () => {
    const h = new History(memory());
    h.add(rec(1, 0));
    expect(h.list).toEqual([]);
  });

  it('persistance', () => {
    const kv = memory();
    new History(kv).add(rec(1));
    expect(new History(kv).list).toEqual([rec(1)]);
  });

  it('clear() vide et persiste', () => {
    const kv = memory();
    const h = new History(kv);
    h.add(rec(1));
    h.clear();
    expect(h.list).toEqual([]);
    expect(new History(kv).list).toEqual([]);
  });

  it('stockage corrompu ou entrées invalides ignorés', () => {
    expect(new History(memory({ 'pachinko-history': '{oups' })).list).toEqual([]);
    const kv = memory({ 'pachinko-history': JSON.stringify([rec(1), { at: 'x' }, { ...rec(2), top3: [null] }]) });
    expect(new History(kv).list).toEqual([rec(1)]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/bans.test.ts src/game/history.test.ts`
Expected: FAIL — `Failed to resolve import "./bans"` / `"./history"`.

- [ ] **Step 3: Write `src/game/bans.ts`**

```ts
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
```

- [ ] **Step 4: Write `src/game/history.ts`**

```ts
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
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/game && npx tsc --noEmit`
Expected: PASS, tsc sans erreur.

- [ ] **Step 6: Commit**

```bash
git add src/game/bans.ts src/game/bans.test.ts src/game/history.ts src/game/history.test.ts
git commit -m "feat: bans et historique des parties persistants"
```

---

### Task 4: Contrôle de partie (pause, terminer, carte suivante, rejouer, démarrer)

**Files:**
- Modify: `src/twitch/chat.ts:57-72`, `src/twitch/chat.test.ts`, `src/scenes/Game.ts`, `src/scenes/Hud.ts`

**Interfaces:**
- Consumes: `GameState.pause/resume/paused` (Task 2), `params.autoNext` (Task 1).
- Produces:
  - `chat.ts` : `type AdminAction = 'pause' | 'resume' | 'end' | 'start' | 'skip'` ; `Command` admin = `{ type: 'admin'; action: AdminAction }` ; `stop` → `pause`.
  - `Game` : `admin(action: AdminAction): void` (mis en file pendant un chargement), `replay(seed: number, pattern?: PatternId): void`, `newGame(seed?, pattern?)`, événement `game.events` `'pause'` (`boolean`).
  - `Hud.ts` : `export const mmss(ms: number): string`.

- [ ] **Step 1: Write the failing tests** — dans `src/twitch/chat.test.ts`, remplacer le test « commandes admin réservées aux mods » par :

```ts
  it.each([
    ['!pachinko pause', 'pause'],
    ['!pachinko stop', 'pause'], // alias
    ['!pachinko STOP', 'pause'],
    ['!pachinko resume', 'resume'],
    ['!pachinko end', 'end'],
    ['!pachinko start', 'start'],
    ['!pachinko skip', 'skip'],
  ])('%s → %s', (text, action) => expect(parseCommand(text, true)).toEqual({ type: 'admin', action }));

  it('commandes admin réservées aux mods, inconnues ignorées', () => {
    expect(parseCommand('!pachinko start', false)).toBeNull();
    expect(parseCommand('!pachinko dance', true)).toBeNull();
    expect(parseCommand('!pachinko constructor', true)).toBeNull(); // pas de fuite du prototype
    expect(parseCommand('!pachinko', true)).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/twitch/chat.test.ts`
Expected: FAIL — `!pachinko pause` renvoie `null`, `stop` renvoie `'stop'`.

- [ ] **Step 3: Implement in `src/twitch/chat.ts`**

```ts
export type AdminAction = 'pause' | 'resume' | 'end' | 'start' | 'skip';

export type Command =
  | { type: 'drop'; pct: number | null } // pct = position en % de la largeur du plateau, null = aléatoire
  | { type: 'admin'; action: AdminAction };

const ADMIN: Record<string, AdminAction> = {
  pause: 'pause', stop: 'pause', resume: 'resume', end: 'end', start: 'start', skip: 'skip',
};

export function parseCommand(text: string, mod: boolean): Command | null {
  const [cmd, arg] = text.trim().toLowerCase().split(/\s+/);
  if (cmd === '!drop') {
    const n = parseFloat(arg ?? '');
    return { type: 'drop', pct: Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null };
  }
  if (cmd === '!pachinko' && mod && arg && Object.hasOwn(ADMIN, arg)) return { type: 'admin', action: ADMIN[arg] };
  return null;
}
```

Run: `npx vitest run src/twitch/chat.test.ts`
Expected: PASS.

- [ ] **Step 4: Wire the controls in `src/scenes/Game.ts`**

Imports : ajouter `import type { AdminAction } from '../twitch/chat';`.

Champs : supprimer `private paused = false;` ; remplacer le commentaire erroné de `frame` et ajouter la file :

```ts
  private frame = 0; // traînées : une frame sur deux
  private queued = new Map<string, () => void>(); // commandes reçues pendant un chargement, rejouées ensuite
```

Remplacer `admin()` par :

```ts
  /** Contrôle de partie (menu et commandes mods). Pendant un chargement : mis en file, rejoué à la fin. */
  admin(action: AdminAction) {
    if (this.loading) {
      this.queued.set(action, () => this.admin(action));
      return;
    }
    if (action === 'pause') return this.setPaused(true);
    this.setPaused(false); // toute autre action sort de la pause
    if (action === 'end') this.state.endNow(Date.now());
    else if (action === 'skip' || (action === 'start' && this.state.phase === 'podium')) void this.newGame();
  }

  /** Nouvelle partie sur la même carte (seed + pattern) : menu Partie ou Historique. */
  replay(seed: number, pattern?: PatternId) {
    if (this.loading) {
      this.queued.set('replay', () => this.replay(seed, pattern));
      return;
    }
    this.setPaused(false);
    void this.newGame(seed, pattern);
  }

  /** Gel complet : Game (physique, effets, tweens) et Backdrop (ambiance) ; le Hud reste actif pour le bandeau. */
  private setPaused(on: boolean) {
    if (on === this.state.paused) return;
    if (on) {
      this.state.pause(Date.now());
      this.scene.pause();
      this.scene.pause('Backdrop');
    } else {
      this.state.resume(Date.now());
      // l'horloge de la scène saute pendant la pause : sans ça, l'anti-blocage retirerait toutes les billes
      for (const b of this.balls.values()) b.anchor.t = this.game.loop.time;
      this.scene.resume();
      this.scene.resume('Backdrop');
    }
    this.game.events.emit('pause', on);
  }
```

Remplacer `newGame()` et la signature de `loadGame()` :

```ts
  /** Nouvelle partie : billes et carte détruites AVANT un éventuel changement de textures. */
  async newGame(seed = Math.floor(Math.random() * 1e9), pattern = patternParam()) {
    if (this.loading) return; // ex. touche T spammée pendant un changement de thème
    this.loading = true;
    try {
      await this.loadGame(seed, pattern);
    } finally {
      this.loading = false;
    }
    const queued = [...this.queued.values()];
    this.queued.clear();
    for (const run of queued) run();
  }

  private async loadGame(seed: number, pattern?: PatternId) {
```

et dans `loadGame`, `this.buildMap(generateMap(seed, patternParam()));` devient :

```ts
    this.buildMap(generateMap(seed, pattern));
```

Dans `update()`, remplacer le bloc de transition :

```ts
    if (transition === 'next' && params.autoNext) {
      void this.newGame();
      return;
    }
```

(Sans `autoNext`, `tick` renvoie `'next'` à chaque frame et le podium reste figé jusqu'à « Démarrer ».)

- [ ] **Step 5: Pause banner and frozen timer in `src/scenes/Hud.ts`**

Exporter `mmss` : `const mmss = …` devient `export const mmss = …`.

Champ : `private banner?: Phaser.GameObjects.Container;`

Dans `create()`, le handler `theme-unload` détruit aussi le bandeau, et on écoute `pause` :

```ts
    ev.on('theme-unload', () => {
      this.hidePodium();
      this.ui?.destroy();
      this.banner?.destroy();
      this.ui = this.timer = this.banner = undefined;
      this.lines = [];
    });
    ev.on('pause', (on: boolean) => this.banner?.setVisible(on));
```

À la fin de `build()`, avant `this.dirty = true;` :

```ts
    this.banner?.destroy();
    this.banner = this.add.container(0, 0, [
      this.add.rectangle(0, HEIGHT / 2 - 80, BOARD_W, 160, 0x000000, 0.7).setOrigin(0),
      this.add.text(BOARD_W / 2, HEIGHT / 2, 'PAUSE', { fontFamily: font, fontSize: '110px', color: pal.accent }).setOrigin(0.5),
    ]).setDepth(20).setVisible(this.state?.paused ?? false);
```

Dans `update()`, le timer affiche le temps restant gelé (plus de registre `paused`) :

```ts
    this.timer.setText(s.phase === 'podium' ? '0:00' : mmss(s.remainingMs(Date.now())));
```

(supprimer la ligne `const paused = this.game.registry.get('paused') === true;`).

- [ ] **Step 6: Run tests, typecheck, build**

Run: `npx vitest run && npm run build`
Expected: tests PASS ; `tsc --noEmit` sans erreur et `vite build` OK. (`connect.ts` appelle `game.admin(cmd.action)` : le type `AdminAction` correspond.)

- [ ] **Step 7: Commit**

```bash
git add src/twitch/chat.ts src/twitch/chat.test.ts src/scenes/Game.ts src/scenes/Hud.ts
git commit -m "feat: contrôle de partie — pause/reprise, terminer, rejouer, démarrer, file pendant le chargement"
```

---

### Task 5: Le streamer joue, réglages à chaud, modération, historique

**Files:**
- Modify: `src/twitch/socket.ts`, `src/twitch/chat.ts:79-94`, `src/twitch/heat.ts:25-31`, `src/twitch/connect.ts`, `src/scenes/Game.ts`, `src/scenes/Hud.ts:155-158`, `src/debug.ts`, `src/main.ts`, `index.html`
- Create: `src/twitch/socket.test.ts`

**Interfaces:**
- Consumes: `Settings`, `updateSettings`, `loadSettings`, `saveSettings` (Task 1), `safeStorage` (Task 1), `Bans`, `History` (Task 3), `GameState.hasBall/resetScore/remove/maxBalls/startedAt` (Task 2), `admin` (Task 4).
- Produces:
  - `reconnectingSocket(...)` renvoie `() => void` (fermeture définitive) ; `connectChat`, `connectHeat` et `connectTwitch` renvoient leur fonction de déconnexion.
  - `Game` : `readonly bans: Bans`, `readonly history: History`, `streamer: Viewer`, `setStreamer(roomId: string, login: string)`, `moderate(action: ModAction, id: string)`, `applySettings(patch: Partial<Settings>)`, `type ModAction = 'removeBall' | 'resetScore' | 'ban' | 'unban'` (exporté) ; événements `'history'` et `'settings'`.

- [ ] **Step 1: Write the failing test** — `src/twitch/socket.test.ts`

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { reconnectingSocket } from './socket';

class FakeWs {
  static all: FakeWs[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;
  constructor(public url: string) { FakeWs.all.push(this); }
  send() {}
  close() { this.closed = true; this.onclose?.(); }
}

describe('reconnectingSocket', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    FakeWs.all = [];
  });

  it('se reconnecte après une coupure', () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWs);
    reconnectingSocket('wss://x', { message: () => {} });
    FakeWs.all[0].onclose!();
    vi.advanceTimersByTime(1000);
    expect(FakeWs.all).toHaveLength(2);
  });

  it('close() est définitif : plus de reconnexion ni de messages', () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWs);
    const message = vi.fn();
    const close = reconnectingSocket('wss://x', { message });
    close();
    expect(FakeWs.all[0].closed).toBe(true);
    FakeWs.all[0].onmessage!({ data: 'tardif' });
    vi.advanceTimersByTime(60_000);
    expect(FakeWs.all).toHaveLength(1);
    expect(message).not.toHaveBeenCalled();
  });

  it('close() pendant l\'attente de reconnexion annule la tentative', () => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeWs);
    const close = reconnectingSocket('wss://x', { message: () => {} });
    FakeWs.all[0].onclose!(); // coupure : nouvelle tentative programmée dans 1 s
    close();
    vi.advanceTimersByTime(60_000);
    expect(FakeWs.all).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/twitch/socket.test.ts`
Expected: FAIL — `close is not a function` (le premier test passe déjà).

- [ ] **Step 3: Rewrite `src/twitch/socket.ts`**

```ts
/** WebSocket qui se reconnecte avec backoff exponentiel (1 s, 2 s, 4 s… plafonné à 30 s).
 *  Renvoie une fermeture définitive : plus de reconnexion, messages tardifs ignorés. */
export function reconnectingSocket(
  url: string,
  handlers: { open?: (ws: WebSocket) => void; message: (data: string, ws: WebSocket) => void },
  log: (msg: string) => void = () => {},
): () => void {
  let delay = 1000;
  let closed = false;
  let ws: WebSocket | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const connect = () => {
    const sock = new WebSocket(url);
    ws = sock;
    sock.onopen = () => {
      if (closed) return;
      delay = 1000;
      log(`connecté : ${url}`);
      handlers.open?.(sock);
    };
    sock.onmessage = (e) => { if (!closed) handlers.message(String(e.data), sock); };
    sock.onclose = () => {
      if (closed) return;
      log(`déconnecté, nouvelle tentative dans ${delay / 1000} s`);
      retry = setTimeout(connect, delay);
      delay = Math.min(delay * 2, 30_000);
    };
  };
  connect();
  return () => {
    closed = true;
    clearTimeout(retry);
    ws?.close();
  };
}
```

Run: `npx vitest run src/twitch/socket.test.ts`
Expected: PASS.

- [ ] **Step 4: Return the disconnect functions**

`src/twitch/chat.ts` — `connectChat` renvoie la fermeture :

```ts
export function connectChat(channel: string, h: ChatHandlers, log: (m: string) => void): () => void {
  let roomId = '';
  return reconnectingSocket('wss://irc-ws.chat.twitch.tv:443', {
```

(le reste du corps est inchangé ; la parenthèse finale `}, log);` devient la valeur renvoyée.)

`src/twitch/heat.ts` :

```ts
export function connectHeat(roomId: string, boardFraction: number, onClick: (c: HeatClick) => void, log: (m: string) => void): () => void {
  return reconnectingSocket(`wss://heat-api.j38.net/channel/${roomId}`, {
```

`src/twitch/connect.ts` — remplacer `connectTwitch` :

```ts
/** Tchat (!drop, commandes mods) puis Heat dès que le tchat a donné l'id numérique de la chaîne.
 *  Renvoie la déconnexion (changement de chaîne dans le menu). */
export function connectTwitch(game: Game, channel: string): () => void {
  let closeHeat = () => {};
  const closeChat = connectChat(channel, {
    onRoomId: (roomId) => {
      log(`room-id ${roomId}`);
      game.setStreamer(roomId, channel); // le streamer joue sous l'id de sa chaîne
      closeHeat();
      closeHeat = connectHeat(roomId, BOARD_W / WIDTH, (c) => {
        // nom en cache si déjà vu, sinon provisoire (Game le remplace dès que le lookup répond)
        const name = users.get(c.id)?.name ?? `${c.anonymous ? 'Anonyme' : 'Viewer'}-${c.id.slice(-4)}`;
        game.requestDrop({ id: c.id, name, color: colorFor(c.id) }, c.x * BOARD_W);
      }, log);
    },
    onCommand: (cmd, tags, login) => {
      if (cmd.type === 'admin') {
        game.admin(cmd.action);
        return;
      }
      const id = tags['user-id'];
      if (!id) return;
      const viewer = { id, name: tags['display-name'] || login, color: tags.color || colorFor(id) };
      const pct = cmd.pct ?? Math.random() * 100;
      game.requestDrop(viewer, WALL + (pct / 100) * (BOARD_W - 2 * WALL));
    },
  }, log);
  return () => {
    closeChat();
    closeHeat();
  };
}
```

- [ ] **Step 5: Wire `src/scenes/Game.ts`**

Imports :

```ts
import { updateSettings, loadSettings, saveSettings, type Settings } from '../settings';
import { safeStorage } from '../storage';
import { Bans } from '../game/bans';
import { History } from '../game/history';
import { users, colorFor } from '../twitch/users';
```

(remplace `import { users } from '../twitch/users';`.)

Avant la classe :

```ts
export type ModAction = 'removeBall' | 'resetScore' | 'ban' | 'unban';
const STREAMER: Viewer = { id: 'streamer', name: 'Streamer', color: colorFor('streamer') }; // sans chaîne / avant le room-id
```

Champs (après `readonly state = …`) :

```ts
  private readonly kv = safeStorage();
  readonly bans = new Bans(this.kv);
  readonly history = new History(this.kv);
  streamer: Viewer = STREAMER;
  private disconnect?: () => void;
  private recorded = false; // partie courante déjà entrée dans l'historique
```

`create()` :

```ts
  async create() {
    this.game.registry.set('state', this.state);
    this.buildFrame();
    this.matter.world.on('collisionstart', this.onCollision, this);
    // le streamer joue en cliquant sur le plateau (menu ouvert : le calque DOM recouvre le canvas)
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x < BOARD_W) this.requestDrop(this.streamer, p.x);
    });
    setupDebug(this);
    await this.newGame(params.seed ?? undefined);
    this.connect();
  }

  /** (Re)connexion à la chaîne des réglages : sockets précédentes fermées proprement. */
  private connect() {
    this.disconnect?.();
    this.disconnect = undefined;
    this.streamer = STREAMER;
    if (params.channel) this.disconnect = connectTwitch(this, params.channel);
  }

  /** room-id reçu du tchat : nom et avatar résolus par users.resolve au premier drop. */
  setStreamer(roomId: string, login: string) {
    this.streamer = { id: roomId, name: login, color: colorFor(roomId) };
  }

  /** Réglages du menu : sauvegardés (sans les surcharges d'URL), puis appliqués.
   *  Chaîne, plafond, shake : tout de suite ; durée, thème, enchaînement : partie suivante. */
  applySettings(patch: Partial<Settings>) {
    saveSettings(this.kv, updateSettings(loadSettings(this.kv), patch));
    const channel = params.channel;
    Object.assign(params, updateSettings(params, patch));
    this.state.maxBalls = params.maxBalls;
    if (patch.theme !== undefined) this.forcedTheme = undefined;
    if (params.channel !== channel) this.connect();
    this.game.events.emit('settings');
  }

  /** Modération depuis le menu. Le streamer ne peut pas s'exclure. */
  moderate(action: ModAction, id: string) {
    if (action === 'unban') this.bans.remove(id);
    else if (action === 'resetScore') this.state.resetScore(id);
    else {
      if (action === 'ban' && id === this.streamer.id) return;
      for (const b of [...this.balls.values()]) if (b.userId === id) this.removeBall(b);
      if (action === 'ban') {
        this.bans.add({ id, name: this.state.players.get(id)?.name ?? users.get(id)?.name ?? id, at: Date.now() });
        this.state.remove(id);
      }
    }
    this.game.events.emit('player', id);
  }

  /** Fin du podium (ou partie quittée en plein podium) : entrée dans l'historique, une seule fois. */
  private recordGame() {
    if (this.recorded || this.state.phase !== 'podium' || !this.map) return;
    this.recorded = true;
    const s = this.state;
    this.history.add({
      at: Date.now(), durationMs: s.endsAt - s.startedAt, pattern: this.map.pattern, seed: this.map.seed,
      theme: this.theme.id, players: s.players.size,
      top3: s.top(3).map(({ id, name, score }) => ({ id, name, score })),
    });
    this.game.events.emit('history');
  }
```

Dans `loadGame()`, en première ligne :

```ts
    this.recordGame(); // carte suivante / Démarrer pendant le podium : la partie compte
```

et après `this.state.start(Date.now(), params.duration * 60_000);` :

```ts
    this.recorded = false;
```

`requestDrop()` — point d'entrée unique (tchat, Heat, souris) :

```ts
  /** Point d'entrée unique des drops (tchat, Heat, souris). Refusé si exclu, bille déjà active, plafond, pause ou podium. */
  requestDrop(viewer: Viewer, x: number): boolean {
    if (!this.map || this.bans.isBanned(viewer.id) || !this.state.canDrop(viewer.id)) return false;
```

Dans `update()`, la transition devient :

```ts
    if (transition === 'next') {
      this.recordGame();
      if (params.autoNext) {
        void this.newGame();
        return;
      }
    }
```

- [ ] **Step 6: Hud — score à zéro sans blocage de l'animation** (`src/scenes/Hud.ts`, dans `renderTop`)

```ts
      if (p.score > l.score)
        this.tweens.add({ targets: l.points, scale: { from: 1.25, to: 1 }, duration: 250, ease: 'Back.easeOut' });
      l.score = p.score; // aussi vers le bas (score remis à zéro par le streamer)
```

- [ ] **Step 7: Debug sans clics, fond opaque**

`src/debug.ts` — supprimer `let clicks = 0;` et le handler `pointerdown` ; le commentaire de tête devient :

```ts
/** ?debug=1 : touche B = +10 bots, T = thème suivant, compteurs FPS / billes / points. (Les clics sont au streamer.) */
```

`src/main.ts` — remplacer `transparent: true,` par :

```ts
  backgroundColor: '#000000', // fenêtre capturée par OBS : fond opaque, bandes noires hors 16:9
```

`index.html` — `background: transparent;` devient `background: #000;`.

- [ ] **Step 8: Run tests, typecheck, build**

Run: `npx vitest run && npm run build`
Expected: tests PASS, build OK.

- [ ] **Step 9: Commit**

```bash
git add src/twitch/socket.ts src/twitch/socket.test.ts src/twitch/chat.ts src/twitch/heat.ts src/twitch/connect.ts src/scenes/Game.ts src/scenes/Hud.ts src/debug.ts src/main.ts index.html
git commit -m "feat: le streamer joue à la souris, réglages à chaud, modération, historique des parties"
```

---

### Task 6: Menu DOM (Partie, Joueurs, Historique, Réglages)

**Files:**
- Create: `src/ui/html.ts`, `src/ui/html.test.ts`, `src/ui/menu.ts`, `src/ui/menu.css`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `Game` (`state`, `map`, `theme`, `ballCount`, `streamer`, `bans`, `history`, `admin`, `replay`, `moderate`, `applySettings`), `params`, `normalizeChannel`, `Settings`, `THEMES`, `PATTERNS`, `users.get`, `mmss` (Hud).
- Produces: `createMenu(game: Phaser.Game): void` ; `esc(s)`, `safeColor(c)`, `safeImage(url)`.

- [ ] **Step 1: Write the failing test** — `src/ui/html.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { esc, safeColor, safeImage } from './html';

describe('html', () => {
  it('esc neutralise le HTML et les attributs', () =>
    expect(esc(`<img src=x onerror="alert('x')">&`))
      .toBe('&#60;img src=x onerror=&#34;alert(&#39;x&#39;)&#34;&#62;&#38;'));

  it.each([
    ['#A1b2C3', '#A1b2C3'],
    ['red;background:url(https://x)', '#888888'],
    ['#fff', '#888888'],
  ])('safeColor(%j) → %j', (c, expected) => expect(safeColor(c)).toBe(expected));

  it.each([
    ['https://static-cdn.jtvnw.net/a.png', 'https://static-cdn.jtvnw.net/a.png'],
    ['javascript:alert(1)', null],
    ['http://x/a.png', null],
    [null, null],
    [undefined, null],
  ])('safeImage(%j) → %j', (u, expected) => expect(safeImage(u)).toBe(expected));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/html.test.ts`
Expected: FAIL — `Failed to resolve import "./html"`.

- [ ] **Step 3: Write `src/ui/html.ts`**

```ts
// Données tierces (noms Twitch/Heat, couleurs de tchat, URLs d'avatar) injectées dans le DOM du menu. Pur.
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const safeColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#888888');
export const safeImage = (url: string | null | undefined) => (url && url.startsWith('https://') ? url : null);
```

Run: `npx vitest run src/ui/html.test.ts`
Expected: PASS.

- [ ] **Step 4: Write `src/ui/menu.css`**

```css
/* Menu du streamer : calque 1920×1080 aligné sur le canvas (mis à l'échelle par menu.ts). */
.menu-root {
  --accent: #e8c15a; --frame: #b8892f; --text: #f3ead7; --bg: #140d10;
  position: fixed; left: 0; top: 0; width: 1920px; height: 1080px; z-index: 10;
  transform-origin: 0 0; pointer-events: none;
  font: 22px/1.4 "Segoe UI", Roboto, "Helvetica Neue", sans-serif; color: var(--text);
}
.menu-root button {
  font: inherit; color: var(--text); cursor: pointer; padding: 8px 18px;
  background: color-mix(in srgb, var(--bg) 70%, var(--frame)); border: 2px solid var(--frame); border-radius: 8px;
}
.menu-root button:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.menu-root button:disabled { opacity: 0.4; cursor: default; }
.menu-root button.danger { border-color: #c0392b; }
.menu-gear {
  position: absolute; right: 16px; bottom: 16px; width: 52px; height: 52px;
  pointer-events: auto; opacity: 0.35; padding: 0 !important; font-size: 28px !important;
}
.menu-gear:hover { opacity: 1; }
.menu-backdrop {
  position: absolute; inset: 0; pointer-events: auto; background: rgba(0, 0, 0, 0.45);
  display: flex; align-items: center; justify-content: center;
}
.menu-backdrop[hidden] { display: none; }
.menu-panel {
  width: 1000px; height: 720px; box-sizing: border-box; padding: 24px 32px; display: flex; flex-direction: column;
  background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(6px);
  border: 3px solid var(--frame); border-radius: 14px;
  box-shadow: 0 0 0 1px var(--accent) inset, 0 20px 60px rgba(0, 0, 0, 0.6);
}
.menu-tabs { display: flex; gap: 12px; margin-bottom: 20px; }
.menu-tabs button { font-family: "Dela Gothic One", sans-serif; font-size: 24px; }
.menu-tabs button.active { background: var(--frame); color: var(--bg); }
.menu-body { flex: 1; overflow-y: auto; }
.menu-root h3 { font-family: "Dela Gothic One", sans-serif; font-weight: normal; color: var(--accent); margin: 24px 0 10px; }
.menu-info { display: grid; grid-template-columns: max-content 1fr; gap: 6px 24px; margin: 0 0 24px; }
.menu-info dt { color: var(--accent); }
.menu-info dd { margin: 0; }
.menu-actions { display: flex; flex-wrap: wrap; gap: 12px; margin: 16px 0; }
.menu-hint, .menu-empty, .menu-root small { opacity: 0.65; }
.menu-notice { color: var(--accent); font-weight: bold; min-height: 1.4em; margin: 0 0 12px; }
.menu-form { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 28px; }
.menu-form label { display: flex; flex-direction: column; gap: 6px; }
.menu-form label.menu-check { flex-direction: row; align-items: center; gap: 10px; }
.menu-root input, .menu-root select {
  font: inherit; color: var(--text); background: rgba(0, 0, 0, 0.35);
  border: 2px solid var(--frame); border-radius: 6px; padding: 6px 10px;
}
.menu-root input[type="checkbox"] { width: 24px; height: 24px; accent-color: var(--accent); }
.menu-search { width: 100%; box-sizing: border-box; margin-bottom: 12px; }
.menu-table { width: 100%; border-collapse: collapse; }
.menu-table th { text-align: left; color: var(--accent); font-weight: normal; }
.menu-table td, .menu-table th { padding: 6px 8px; border-bottom: 1px solid color-mix(in srgb, var(--frame) 40%, transparent); }
.menu-row-actions { white-space: nowrap; text-align: right; }
.menu-row-actions button { padding: 4px 10px; font-size: 18px; }
.menu-avatar { display: inline-block; width: 36px; height: 36px; border-radius: 50%; vertical-align: middle; object-fit: cover; }
.menu-dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #3ddc84; box-shadow: 0 0 8px #3ddc84; }
.menu-history, .menu-bans { list-style: none; margin: 0 0 16px; padding: 0; }
.menu-history li, .menu-bans li { padding: 12px 0; border-bottom: 1px solid color-mix(in srgb, var(--frame) 40%, transparent); }
.menu-top3 { margin: 4px 0 8px; opacity: 0.85; }
body.cursor-hidden, body.cursor-hidden * { cursor: none !important; }
```

- [ ] **Step 5: Write `src/ui/menu.ts`**

```ts
// Menu du streamer : calque DOM au-dessus du canvas. Ne touche jamais aux scènes : API publique de Game
// (admin, replay, moderate, applySettings) + lecture de l'état. Actions sur `pointerdown` : la partie
// « live » est re-rendue 2×/s et un bouton remplacé entre mousedown et mouseup perdrait son `click`.
import type Phaser from 'phaser';
import './menu.css';
import { params, WIDTH } from '../config';
import { THEMES } from '../themes/index';
import { PATTERNS, type PatternId } from '../mapgen';
import { normalizeChannel, type Settings } from '../settings';
import { users } from '../twitch/users';
import { mmss } from '../scenes/Hud';
import type { Game } from '../scenes/Game';
import type { Theme } from '../themes/types';
import { esc, safeColor, safeImage } from './html';

type Tab = 'game' | 'players' | 'history' | 'settings';
const TABS: [Tab, string][] = [['game', 'Partie'], ['players', 'Joueurs'], ['history', 'Historique'], ['settings', 'Réglages']];
const REFRESH_MS = 500; // au plus 2×/s, menu ouvert seulement
const CURSOR_HIDE_MS = 3000;
const CONFIRM_MS = 3000;
const fr = (n: number) => n.toLocaleString('fr-FR');

export function createMenu(game: Phaser.Game) {
  // les scènes sont instanciées sur 'ready' (asynchrone après new Phaser.Game)
  game.events.once('ready', () => init(game, game.scene.getScene('Game') as Game));
}

function init(game: Phaser.Game, g: Game) {
  const root = document.createElement('div');
  root.className = 'menu-root';
  root.innerHTML = `
    <button class="menu-gear" data-act="toggle" title="Menu (Échap)">⚙</button>
    <div class="menu-backdrop" hidden>
      <div class="menu-panel">
        <nav class="menu-tabs">${TABS.map(([id, label]) => `<button data-tab="${id}">${label}</button>`).join('')}</nav>
        <div class="menu-body"></div>
      </div>
    </div>`;
  document.body.append(root);
  const backdrop = root.querySelector<HTMLElement>('.menu-backdrop')!;
  const body = root.querySelector<HTMLElement>('.menu-body')!;

  let tab: Tab = 'game';
  let open = false;
  let notice = '';
  let search = '';
  let armed: { key: string; until: number } | null = null; // confirmation en deux clics
  let refresh: number | undefined;

  // --- calque aligné sur le canvas (Scale.FIT + centrage) ---
  const fit = () => {
    const r = game.canvas.getBoundingClientRect();
    root.style.transform = `translate(${r.left}px, ${r.top}px) scale(${r.width / WIDTH})`;
  };
  game.scale.on('resize', fit);
  window.addEventListener('resize', fit);
  fit();

  // --- couleurs du thème actif ---
  game.events.on('theme', (t: Theme) => {
    const p = t.palette;
    for (const [k, v] of [['--accent', p.accent], ['--frame', p.frame], ['--text', p.text], ['--bg', p.background]])
      root.style.setProperty(k, v);
  });

  // --- curseur masqué après 3 s d'immobilité (il serait visible à l'image) ---
  let idle: number | undefined;
  const wake = () => {
    document.body.classList.remove('cursor-hidden');
    clearTimeout(idle);
    idle = window.setTimeout(() => document.body.classList.add('cursor-hidden'), CURSOR_HIDE_MS);
  };
  window.addEventListener('pointermove', wake);
  wake();

  const confirmed = (key: string) => {
    if (armed?.key === key && Date.now() < armed.until) {
      armed = null;
      return true;
    }
    armed = { key, until: Date.now() + CONFIRM_MS };
    return false;
  };
  const label = (key: string, text: string) => (armed?.key === key && Date.now() < armed.until ? 'Confirmer ?' : text);

  const avatar = (id: string, color: string) => {
    const url = safeImage(users.get(id)?.avatar);
    return url ? `<img class="menu-avatar" src="${esc(url)}" alt="">` : `<span class="menu-avatar" style="background:${safeColor(color)}"></span>`;
  };

  // --- contenu des onglets : partie statique (formulaire, recherche) + partie « live » re-rendue ---
  const gameHtml = () => {
    const s = g.state;
    const rows: [string, string][] = [
      ['Phase', s.paused ? 'En pause' : s.phase === 'playing' ? 'En jeu' : 'Podium'],
      ['Temps restant', mmss(s.remainingMs(Date.now()))],
      ['Carte', g.map ? `${g.map.pattern} · seed ${g.map.seed}` : '…'],
      ['Thème', g.theme?.id ?? '…'],
      ['Billes en jeu', `${g.ballCount} / ${params.maxBalls}`],
      ['Joueurs', String(s.players.size)],
      ['Chaîne', params.channel ?? 'aucune'],
    ];
    return `<dl class="menu-info">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <div class="menu-actions">
        <button data-act="pause">${s.paused ? 'Reprendre' : 'Pause'}</button>
        <button data-act="end"${s.phase === 'playing' ? '' : ' disabled'}>Terminer maintenant</button>
        <button data-act="skip">Carte suivante</button>
        <button data-act="replay-current"${g.map ? '' : ' disabled'}>Rejouer cette carte</button>
        <button data-act="start"${s.phase === 'podium' ? '' : ' disabled'}>Démarrer la partie suivante</button>
      </div>
      <p class="menu-hint">Tchat (modos) : !pachinko pause · resume · end · skip · start</p>`;
  };

  const playersHtml = () => {
    const q = search.trim().toLowerCase();
    const all = g.state.top(Infinity);
    const rows = all.map((p, i) => ({ p, rank: i + 1 })).filter(({ p }) => !q || p.name.toLowerCase().includes(q));
    if (!rows.length) return `<p class="menu-empty">${all.length ? 'Aucun joueur trouvé' : 'Aucun joueur pour l\'instant'}</p>`;
    return `<table class="menu-table">
      <thead><tr><th>#</th><th></th><th>Joueur</th><th>Score</th><th>Billes</th><th></th></tr></thead>
      <tbody>${rows.map(({ p, rank }) => {
        const id = esc(p.id), me = p.id === g.streamer.id, inPlay = g.state.hasBall(p.id);
        return `<tr>
          <td>${rank}</td><td>${avatar(p.id, p.color)}</td>
          <td>${esc(p.name)}${me ? ' <small>(toi)</small>' : ''}</td>
          <td>${fr(p.score)}</td>
          <td>${p.balls}${inPlay ? ' <span class="menu-dot" title="Bille en jeu"></span>' : ''}</td>
          <td class="menu-row-actions">
            <button data-act="removeBall" data-id="${id}"${inPlay ? '' : ' disabled'}>Retirer sa bille</button>
            <button data-act="resetScore" data-id="${id}">Score à zéro</button>
            ${me ? '' : `<button class="danger" data-act="ban" data-id="${id}">${label(`ban:${p.id}`, 'Exclure')}</button>`}
          </td></tr>`;
      }).join('')}</tbody></table>`;
  };

  const historyHtml = () => {
    const list = g.history.list;
    if (!list.length) return '<p class="menu-empty">Aucune partie terminée pour l\'instant</p>';
    return `<ul class="menu-history">${list.map((r) => `<li>
        <div><strong>${new Date(r.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</strong>
          · ${esc(r.pattern)} · seed ${r.seed} · ${esc(r.theme)} · ${mmss(r.durationMs)}
          · ${r.players} joueur${r.players > 1 ? 's' : ''}</div>
        <div class="menu-top3">${r.top3.map((p, i) => `${i + 1}. ${esc(p.name)} (${fr(p.score)})`).join(' · ')}</div>
        <button data-act="replay" data-seed="${r.seed}" data-pattern="${esc(r.pattern)}">Rejouer cette carte</button>
      </li>`).join('')}</ul>
      <button class="danger" data-act="clear-history">${label('clear-history', 'Effacer l\'historique')}</button>`;
  };

  const bansHtml = () => {
    const list = g.bans.list;
    if (!list.length) return '<p class="menu-empty">Aucun joueur exclu</p>';
    return `<ul class="menu-bans">${list.map((b) => `<li>${esc(b.name)}
        <small>${esc(b.id)} · ${new Date(b.at).toLocaleDateString('fr-FR')}</small>
        <button data-act="unban" data-id="${esc(b.id)}">Réintégrer</button></li>`).join('')}</ul>`;
  };

  const settingsHtml = () => `
    <p class="menu-notice">${esc(notice)}</p>
    <div class="menu-form">
      <label>Chaîne Twitch <input name="channel" value="${esc(params.channel ?? '')}" placeholder="ta_chaine" spellcheck="false" autocomplete="off"></label>
      <label>Durée d'une partie (min) <input name="duration" type="number" min="1" max="60" value="${params.duration}"></label>
      <label>Billes en jeu (max) <input name="maxBalls" type="number" min="1" max="500" value="${params.maxBalls}"></label>
      <label>Thème <select name="theme">${['auto', ...Object.keys(THEMES)].map((id) =>
        `<option value="${esc(id)}"${id === params.theme ? ' selected' : ''}>${id === 'auto' ? 'Automatique (date)' : esc(id)}</option>`).join('')}</select></label>
      <label class="menu-check"><input name="shake" type="checkbox"${params.shake ? ' checked' : ''}> Secousses de l'écran</label>
      <label class="menu-check"><input name="autoNext" type="checkbox"${params.autoNext ? ' checked' : ''}> Enchaîner les parties automatiquement</label>
    </div>
    <div class="menu-actions">
      <button data-act="save">Enregistrer</button>
      <button data-act="apply-now">Appliquer maintenant (carte suivante)</button>
      <button data-act="fullscreen">Plein écran</button>
    </div>
    <p class="menu-hint">Durée, thème et enchaînement prennent effet à la partie suivante.</p>
    <h3>Joueurs exclus</h3>
    <div class="menu-live"></div>`;

  function render() {
    for (const b of root.querySelectorAll<HTMLElement>('[data-tab]')) b.classList.toggle('active', b.dataset.tab === tab);
    body.innerHTML = tab === 'settings' ? settingsHtml()
      : tab === 'players' ? `<input class="menu-search" placeholder="Rechercher un joueur" value="${esc(search)}"><div class="menu-live"></div>`
        : '<div class="menu-live"></div>';
    refreshLive();
  }

  function refreshLive() {
    const live = body.querySelector('.menu-live');
    if (!open || !live) return;
    live.innerHTML = tab === 'game' ? gameHtml() : tab === 'players' ? playersHtml() : tab === 'history' ? historyHtml() : bansHtml();
  }

  function setOpen(on: boolean) {
    open = on;
    backdrop.hidden = !on;
    clearInterval(refresh);
    if (on) {
      render();
      refresh = window.setInterval(refreshLive, REFRESH_MS);
    }
  }

  function setNotice(text: string) {
    notice = text;
    const el = body.querySelector('.menu-notice');
    if (el) el.textContent = text;
  }

  /** Ne sauvegarde que les champs modifiés : une surcharge d'URL laissée telle quelle n'est jamais persistée. */
  function save() {
    const field = (name: string) => body.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    const channel = normalizeChannel(field('channel').value);
    if (channel === undefined) return setNotice('Nom de chaîne invalide (lettres, chiffres et _ uniquement)');
    const next: Settings = {
      channel,
      duration: Number(field('duration').value),
      maxBalls: Number(field('maxBalls').value),
      theme: field('theme').value,
      shake: field('shake').checked,
      autoNext: field('autoNext').checked,
    };
    const patch: Record<string, unknown> = {};
    for (const k of Object.keys(next) as (keyof Settings)[]) if (next[k] !== params[k]) patch[k] = next[k];
    g.applySettings(patch as Partial<Settings>);
    render(); // affiche les valeurs bornées
    setNotice(params.channel ? 'Réglages enregistrés' : 'Entre ta chaîne Twitch');
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    document.documentElement.requestFullscreen()
      // Chrome : sans verrou, Échap quitte le plein écran au lieu d'ouvrir le menu (maintenir Échap pour sortir)
      .then(() => (navigator as Navigator & { keyboard?: { lock(keys: string[]): Promise<void> } }).keyboard?.lock(['Escape']))
      .catch(() => {});
  }

  function act(el: HTMLElement) {
    const id = el.dataset.id ?? '';
    switch (el.dataset.act) {
      case 'toggle': return setOpen(!open);
      case 'pause': g.admin(g.state.paused ? 'resume' : 'pause'); break;
      case 'end': g.admin('end'); break;
      case 'skip': g.admin('skip'); break;
      case 'start': g.admin('start'); break;
      case 'replay-current': if (g.map) g.replay(g.map.seed, g.map.pattern); break;
      case 'replay': {
        const p = el.dataset.pattern ?? '';
        g.replay(Number(el.dataset.seed), (PATTERNS as readonly string[]).includes(p) ? (p as PatternId) : undefined);
        break;
      }
      case 'removeBall': g.moderate('removeBall', id); break;
      case 'resetScore': g.moderate('resetScore', id); break;
      case 'ban': if (confirmed(`ban:${id}`)) g.moderate('ban', id); break;
      case 'unban': g.moderate('unban', id); break;
      case 'clear-history': if (confirmed('clear-history')) g.history.clear(); break;
      case 'save': return save();
      case 'apply-now': save(); g.admin('skip'); return;
      case 'fullscreen': return toggleFullscreen();
    }
    refreshLive();
  }

  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-tab]');
    if (!el || el.matches(':disabled')) return;
    if (el.dataset.tab) {
      tab = el.dataset.tab as Tab;
      render();
    } else act(el);
  });
  body.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (!t.classList.contains('menu-search')) return;
    search = t.value;
    refreshLive();
  });
  body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && tab === 'settings') save(); });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.repeat) return;
    e.preventDefault();
    setOpen(!open);
  });

  // premier lancement : aucune chaîne ni en réglages ni en URL → le menu guide la saisie (le jeu tourne déjà)
  if (!params.channel) {
    tab = 'settings';
    notice = 'Entre ta chaîne Twitch';
    setOpen(true);
  }
}
```

- [ ] **Step 6: Mount the menu in `src/main.ts`**

```ts
import { createMenu } from './ui/menu';
```

et remplacer `new Phaser.Game({` par `const game = new Phaser.Game({`, puis après l'appel :

```ts
createMenu(game);
```

- [ ] **Step 7: Run tests, typecheck, build**

Run: `npx vitest run && npm run build`
Expected: tests PASS, build OK.

- [ ] **Step 8: Commit**

```bash
git add src/ui src/main.ts
git commit -m "feat: menu du streamer (Partie, Joueurs, Historique, Réglages), plein écran, curseur masqué"
```

---

### Task 7: Vérification navigateur et documentation

**Files:**
- Create: `scripts/verify-streamer.mjs`
- Modify: `package.json` (devDependency `playwright-core`, script `verify`), `PLAN.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: tout ce qui précède, via `window.game` (exposé en `?debug=1`) et le DOM du menu (`.menu-backdrop`, `.menu-tabs .active`, `.menu-notice`, `[data-act=…]`, `[data-tab=…]`, `input[name=…]`).

- [ ] **Step 1: Install playwright-core (pilote le Chrome installé, aucun navigateur téléchargé)**

Run: `npm install -D playwright-core`
Expected: `package.json` gagne `playwright-core` en devDependencies.

Ajouter dans `package.json` → `scripts` : `"verify": "node scripts/verify-streamer.mjs"`.

- [ ] **Step 2: Write `scripts/verify-streamer.mjs`**

```js
// Vérification navigateur du mode streamer (spec §8), sur le Chrome installé en headless.
// Usage : `npm run dev` dans un terminal, puis `npm run verify [-- http://localhost:5173/]`.
import { chromium } from 'playwright-core';

const URL = process.argv[2] ?? 'http://localhost:5173/';
const G = `window.game.scene.getScene('Game')`;
const viewer = (id) => `{ id: '${id}', name: '${id}', color: '#ff0000' }`;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const errors = [];
const open = async (query) => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${URL}${query}`);
  await page.waitForFunction(`!!${G}?.map`);
  return page;
};
const remaining = (page) => page.evaluate(`${G}.state.remainingMs(Date.now())`);

// 1. Premier lancement → menu ouvert sur Réglages
let page = await open('?debug=1');
check('premier lancement : menu ouvert', await page.isVisible('.menu-backdrop'));
check('premier lancement : onglet Réglages', (await page.textContent('.menu-tabs .active')) === 'Réglages');
check('premier lancement : message', (await page.textContent('.menu-notice')).includes('Entre ta chaîne Twitch'));

// 2. Chaîne saisie → persistée après rechargement
await page.fill('input[name=channel]', 'Pachinko_Test');
await page.click('[data-act=save]');
await page.reload();
await page.waitForFunction(`!!${G}?.map`);
check('chaîne persistée', await page.evaluate(() => JSON.parse(localStorage.getItem('pachinko-settings')).channel) === 'pachinko_test');
check('2e lancement : menu fermé', !(await page.isVisible('.menu-backdrop')));

// 3. Pause : timer gelé, drops refusés, billes conservées après une longue pause
check('drop avant pause', await page.evaluate(`${G}.requestDrop(${viewer('v0')}, 300)`));
await page.keyboard.press('Escape');
await page.click('[data-tab=game]');
await page.click('[data-act=pause]');
const t1 = await remaining(page);
await page.waitForTimeout(9000); // > STUCK_KILL_MS
check('pause : timer gelé', (await remaining(page)) === t1, `${t1} ms`);
check('pause : drop refusé', !(await page.evaluate(`${G}.requestDrop(${viewer('v1')}, 400)`)));
await page.click('[data-act=pause]'); // Reprendre
await page.waitForTimeout(300);
check('reprise : bille conservée', (await page.evaluate(`${G}.ballCount`)) >= 1);
const t2 = await remaining(page);
await page.waitForTimeout(1100);
check('reprise : timer repart', (await remaining(page)) < t2);

// 4. Exclure empêche un drop (clics pendant les rafraîchissements 2×/s)
check('drop viewer', await page.evaluate(`${G}.requestDrop(${viewer('v1')}, 400)`));
await page.click('[data-tab=players]');
await page.click('[data-act=ban][data-id=v1]'); // arme
await page.click('[data-act=ban][data-id=v1]'); // confirme
check('exclu : retiré du classement', !(await page.evaluate(`${G}.state.players.has('v1')`)));
check('exclu : drop refusé', !(await page.evaluate(`${G}.requestDrop(${viewer('v1')}, 400)`)));
check('exclu : ban persisté', await page.evaluate(() => localStorage.getItem('pachinko-bans').includes('"v1"')));
await page.click('[data-tab=settings]');
await page.click('[data-act=unban][data-id=v1]');
check('réintégré : drop accepté', await page.evaluate(`${G}.requestDrop(${viewer('v1')}, 400)`));

// 5. Historique alimenté après une partie de 1 min
await page.fill('input[name=duration]', '1');
await page.click('[data-act=apply-now]');
await page.waitForFunction(`${G}.state.remainingMs(Date.now()) > 55000 && ${G}.state.remainingMs(Date.now()) <= 60000`);
check('durée 1 min appliquée', true);
await page.evaluate(`${G}.requestDrop(${viewer('v2')}, 700)`);
await page.waitForFunction(`${G}.history.list.length > 0`, null, { timeout: 100_000 });
const rec = await page.evaluate(`${G}.history.list[0]`);
check('historique : partie enregistrée', rec.players >= 1 && rec.top3.some((p) => p.id === 'v2'), JSON.stringify(rec.top3));
await page.click('[data-tab=history]');
check('historique : affiché', await page.isVisible('.menu-history li'));
await page.close();

// 6. FPS à 150 billes, menu fermé puis ouvert
page = await open('?debug=1&bots=150');
await page.waitForTimeout(8000);
const fps = async () => {
  let sum = 0;
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(500); sum += await page.evaluate('window.game.loop.actualFps'); }
  return Math.round(sum / 6);
};
const closed = await fps();
await page.keyboard.press('Escape');
await page.click('[data-tab=players]');
const opened = await fps();
check('150 billes : FPS menu fermé / ouvert', opened >= closed * 0.9, `${closed} / ${opened} fps (${await page.evaluate(`${G}.ballCount`)} billes)`);

check('aucune erreur JS', errors.length === 0, errors.join(' | '));
await browser.close();
```

- [ ] **Step 3: Run the verification**

Run: `npm run dev` (en arrière-plan), puis `npm run verify`
Expected: toutes les lignes `OK`. Les FPS headless peuvent être inférieurs à ceux d'un vrai Chrome : le critère est l'absence de chute menu ouvert (≥ 90 % de la valeur menu fermé) ; noter les valeurs dans `PLAN.md`.

- [ ] **Step 4: Update `PLAN.md` and `CLAUDE.md`**

`PLAN.md` — dans « Avancement », après l'étape 11 :

```markdown
- [x] 12. Mode streamer : plein écran, menus, modération, historique (spec `docs/superpowers/specs/2026-10-02-streamer-mode-design.md`, plan `docs/superpowers/plans/2026-10-02-streamer-mode.md`)
```

et, avant « ## Vérification », une section :

```markdown
### 12. Mode streamer
- [x] Réglages persistants (défauts < sauvegardés < URL), application à chaud (`Game.applySettings`).
- [x] Contrôle de partie : pause/reprise, terminer, carte suivante, rejouer, démarrer (menu + `!pachinko pause|resume|end|skip|start`).
- [x] Le streamer joue à la souris (id = room-id de sa chaîne).
- [x] Joueurs (classement complet, retirer la bille, score à zéro, exclure), bans et historique persistants.
- [x] Menu DOM (Échap / roue crantée), plein écran, curseur masqué.
- [x] **Vérif** : `npm run verify` (Playwright headless sur le Chrome installé) — <résultats et FPS mesurés>.
```

(remplacer `<résultats et FPS mesurés>` par les valeurs réellement obtenues à l'étape 3.)

`CLAUDE.md` :
- « Commandes » : `npm run dev` — serveur de dev (le streamer joue à la souris, Échap = menu ; `/?debug=1` : touche B = bots, T = thème) ; ajouter `npm run verify` — vérification navigateur du mode streamer (dev server lancé).
- « Architecture » : ajouter `src/settings.ts` + `src/storage.ts` (réglages persistants, URL > sauvegardé > défaut), `src/game/bans.ts` + `src/game/history.ts` (purs, persistants), `src/ui/` (menu DOM : n'appelle que l'API publique de `Game` — `admin`, `replay`, `moderate`, `applySettings`).
- En tête : « chargé comme source OBS » devient « lancé en plein écran dans le navigateur, fenêtre capturée par OBS ».

- [ ] **Step 5: Run the full test suite and build**

Run: `npx vitest run && npm run build`
Expected: PASS, build OK.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json scripts/verify-streamer.mjs PLAN.md CLAUDE.md
git commit -m "test: vérification navigateur du mode streamer (Playwright sur le Chrome installé) + docs"
```
