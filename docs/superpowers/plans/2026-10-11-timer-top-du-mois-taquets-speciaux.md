# Timer à la première bille, top du mois, taquets spéciaux — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le timer d'une partie ne démarre qu'à la première bille, le meilleur score de chaque viewer est gardé un mois et affiché entre les parties, et un taquet spécial s'allume de temps en temps pour déclencher un effet au premier contact.

**Architecture:** Deux modules purs testés (`game/monthly.ts`, `game/specials.ts`) et deux extensions de modules purs existants (`game/state.ts`, `settings.ts`), câblés dans la scène `Game`. Les effets vivent dans une classe `Specials` (`scenes/specials.ts`) possédée par `Game`, comme `Juice`. Le `Hud` lit l'état et le top du mois par le registre Phaser, comme il lit déjà `state`.

**Tech Stack:** Vite + TypeScript, Phaser 3.90 (Matter), vitest ; `playwright-core` pour `npm run verify`.

**Spec:** `docs/superpowers/specs/2026-10-11-timer-top-du-mois-taquets-speciaux-design.md` (complète `PLAN.md` et les specs mode streamer et thèmes).

## Global Constraints

- Phaser **3.90**, aucune nouvelle dépendance ; aucun backend, aucun token Twitch.
- Code et identifiants en anglais, textes affichés en français (accents compris).
- Modules purs sans Phaser : `game/state.ts`, `game/monthly.ts`, `game/specials.ts`, `settings.ts`.
- `mapgen.ts` n'est pas modifié ; les taquets spéciaux utilisent `Math.random`, pas le seed de la carte.
- Clé de stockage du top du mois : `pachinko-monthly` ; stockage indisponible ou plein → mémoire seulement.
- Top du mois : mois civil en heure locale, 500 meilleures entrées, anonymes Heat (id préfixé `U`) exclus, rien d'enregistré en `?debug=1`.
- Réglages : `specialEvery` 0–300 s (défaut 20, 0 = désactivé) ; `specialEffects` = ids séparés par des virgules dans l'ordre `double,moon,warp,slow,x2,gold,quake` (défaut : tous).
- Durées : taquet non touché 20 s ; gravité lunaire 30 % pendant 6 s ; ralenti ×0,4 pendant 5 s ; points ×2 pendant 10 s ; pluie d'or 8 s.
- Perf : aucune allocation dans `update()` ni dans le handler de collision ; un effet parcourt les billes ou les taquets une fois au début et une fois à la fin. 60 fps à `?debug=1&bots=150`.
- Thèmes : les scènes n'utilisent que des clés de texture fixes ; un élément re-skinné garde la même hitbox.
- Suivi : cocher les cases de `PLAN.md` (étapes 13, 14, 15) au fur et à mesure.
- TypeScript strict avec `noUnusedLocals` : les tests sont typés aussi (`npx tsc --noEmit` couvre `src/`).

## Review Focus

1. **Stream à cheval sur le 1er du mois** : le jeu tourne, minuit passe. Le top affiché et le prochain enregistrement doivent basculer sur le nouveau mois sans rechargement → le mois est recalculé à chaque appel (test Task 2 « changement de mois »).
2. **Deux onglets du jeu ouverts dans le même navigateur** : chaque onglet a sa copie en mémoire et le dernier qui écrit écraserait les records de l'autre → `Monthly` relit le stockage avant chaque écriture (test Task 2 « deux onglets »).
3. **Longue pause pendant un effet à durée** : l'horloge de scène saute à la reprise, un effet daté en heure absolue expirerait d'un coup → comptes à rebours en `delta` de scène, figés en pause (vérif navigateur Task 5 : gravité lunaire toujours active après 9 s de pause).
4. **Fin de partie ou carte suivante pendant un effet** : gravité, vitesses, textures et multiplicateurs doivent revenir à la normale, sinon la partie suivante démarre en gravité lunaire → `Specials.clear()` au podium et dans `loadGame()` avant `clearMap()` (vérif navigateur Task 5 : « carte suivante : effets annulés »).
5. **Réglages des taquets mal formés** : toutes les cases décochées, `?specialEffects=` avec des ids inconnus, champ « toutes les (s) » vidé → aucun taquet spécial, aucun plantage, champ vidé = valeur inchangée (tests Task 4).

---

### Task 1: Timer à la première bille et compteur de billes par viewer

**Files:**
- Modify: `src/game/state.ts` (fichier entier), `src/game/state.test.ts`
- Modify: `src/scenes/Game.ts:331`, `src/scenes/Hud.ts:46,102-103,242`, `src/ui/menu.ts:95`
- Modify: `scripts/verify-streamer.mjs:42-45`, `PLAN.md:50,638`

**Interfaces:**
- Produces (`GameState`) :
  - `waiting: boolean` — vrai entre `start()` et la première bille.
  - `ballStarted(v: Viewer, now: number): void` — **nouveau 2e paramètre** ; la première bille fixe `startedAt` / `endsAt`.
  - `extraBall(userId: string): boolean` — bille bonus ; `false` si joueur inconnu ou plafond atteint.
  - `remainingMs(now)` renvoie la durée complète en attente ; `tick(now)` renvoie `null` en attente.

- [ ] **Step 1: Ajouter les étapes 13 à 15 à `PLAN.md`**

Dans « Avancement », après la ligne `- [x] 12. Mode streamer …` :

```markdown
- [ ] 13. Timer à la première bille (spec `docs/superpowers/specs/2026-10-11-timer-top-du-mois-taquets-speciaux-design.md`, plan `docs/superpowers/plans/2026-10-11-timer-top-du-mois-taquets-speciaux.md`)
- [ ] 14. Top du mois (même spec, même plan)
- [ ] 15. Taquets spéciaux (même spec, même plan)
```

Avant le titre `## Vérification` :

```markdown
### 13. Timer à la première bille
- [ ] `GameState` : état d'attente (`waiting`), timer lancé par la première bille ; billes comptées par viewer (`extraBall`).
- [ ] Hud : durée complète figée + « En attente de la première bille ».
- [ ] **Vérif** : `npm run test` et `npm run verify` verts (timer figé avant la première bille).

### 14. Top du mois
- [ ] `src/game/monthly.ts` : meilleur score par viewer sur le mois civil, persistant, anonymes exclus.
- [ ] Enregistrement en fin de podium (hors `?debug=1`), retrait à l'exclusion.
- [ ] Panneau latéral « TOP DU MOIS » pendant le podium et l'attente.
- [ ] **Vérif** : `npm run test` et `npm run verify` verts ; à la main : record visible dès le podium, conservé après rechargement.

### 15. Taquets spéciaux
- [ ] Réglages `specialEvery` / `specialEffects` (menu + URL).
- [ ] `src/game/specials.ts` (catalogue + tirage, pur) et `src/scenes/specials.ts` (taquet allumé, 7 effets).
- [ ] Texture `pegSpecial` (clé fixe, teintable).
- [ ] **Vérif** : `npm run test` et `npm run verify` verts ; 60 fps à `?debug=1&bots=150` ; les 7 effets vus à la main.

```

- [ ] **Step 2: Adapter les tests existants** — `src/game/state.test.ts`

Le timer ne part plus dans `start()`. Trois modifications mécaniques :

1. Sous la constante `carol`, ajouter :

```ts
const zed = { id: 'z', name: 'Zed', color: '#fff' };
```

et sous la fonction `started`, ajouter :

```ts
/** Partie dont le timer tourne depuis t = 0 : une première bille a été jouée puis est sortie. */
function running(maxBalls = 10) {
  const s = started(maxBalls);
  s.ballStarted(zed, 0);
  s.ballFinished('z');
  s.players.delete('z');
  return s;
}
```

2. Ajouter `, 0` à **tous** les appels `ballStarted` du fichier : `s.ballStarted(alice)` → `s.ballStarted(alice, 0)`, `s.ballStarted(bob)` → `s.ballStarted(bob, 0)`, `s.ballStarted(p)` → `s.ballStarted(p, 0)`, `s.ballStarted({ ...alice, name: 'AliceRenamed' })` → `s.ballStarted({ ...alice, name: 'AliceRenamed' }, 0)`, `s.ballStarted({ ...alice, name: 'Viewer-1234' })` → `s.ballStarted({ ...alice, name: 'Viewer-1234' }, 0)`.

3. Remplacer `const s = started();` par `const s = running();` dans ces huit tests, qui supposent un timer lancé sans jouer de bille : « aucun drop pendant le podium », « timer basé sur l'horodatage de fin », « playing → podium → next », « endNow() termine la partie immédiatement », « gèle le timer, refuse les drops, bloque les transitions », « pause pendant le podium : fin du podium décalée », « pause idempotente, reprise sans pause sans effet », « la durée jouée exclut la pause ».

Dans « start() remet tout à zéro », ajouter une dernière ligne :

```ts
    expect(s.waiting).toBe(true);
```

- [ ] **Step 3: Écrire les tests qui échouent** — à la fin de `src/game/state.test.ts`

```ts
describe('GameState — attente de la première bille', () => {
  it('le timer ne part pas sans bille', () => {
    const s = started();
    expect(s.waiting).toBe(true);
    expect(s.remainingMs(500_000)).toBe(60_000);
    expect(s.tick(500_000)).toBe(null);
    expect(s.phase).toBe('playing');
    expect(s.canDrop('a')).toBe(true);
  });

  it('la première bille lance le timer, les suivantes ne le relancent pas', () => {
    const s = started();
    s.ballStarted(alice, 100_000);
    expect(s.waiting).toBe(false);
    s.ballStarted(bob, 130_000);
    expect(s.remainingMs(130_000)).toBe(30_000);
    expect(s.endsAt - s.startedAt).toBe(60_000);
    expect(s.tick(159_999)).toBe(null);
    expect(s.tick(160_000)).toBe('podium');
  });

  it('pause pendant l\'attente : la durée complète reste due', () => {
    const s = started();
    s.pause(10_000);
    expect(s.canDrop('a')).toBe(false);
    s.resume(40_000);
    expect(s.waiting).toBe(true);
    expect(s.remainingMs(40_000)).toBe(60_000);
    s.ballStarted(alice, 50_000);
    expect(s.tick(109_999)).toBe(null);
    expect(s.tick(110_000)).toBe('podium');
  });

  it('endNow() en attente : podium vide tout de suite, durée jouée nulle', () => {
    const s = started();
    s.endNow(5_000);
    expect(s.waiting).toBe(false);
    expect(s.tick(5_000)).toBe('podium');
    expect(s.endsAt - s.startedAt).toBe(0);
    expect(s.tick(20_000)).toBe('next');
  });

  it('chaque nouvelle partie repart en attente', () => {
    const s = running();
    s.start(100_000, 30_000);
    expect(s.waiting).toBe(true);
    expect(s.remainingMs(900_000)).toBe(30_000);
  });
});

describe('GameState — bille bonus', () => {
  it('le viewer ne relance qu\'une fois ses deux billes sorties', () => {
    const s = started();
    s.ballStarted(alice, 0);
    expect(s.extraBall('a')).toBe(true);
    s.ballFinished('a');
    expect(s.hasBall('a')).toBe(true);
    expect(s.canDrop('a')).toBe(false);
    s.ballFinished('a');
    expect(s.canDrop('a')).toBe(true);
    expect(s.players.get('a')!.balls).toBe(1); // la bille bonus n'est pas une bille jouée
  });

  it('compte dans le plafond et est refusée au plafond', () => {
    const s = started(2);
    s.ballStarted(alice, 0);
    expect(s.extraBall('a')).toBe(true);
    expect(s.canDrop('b')).toBe(false);
    expect(s.extraBall('a')).toBe(false);
    s.ballFinished('a');
    expect(s.canDrop('b')).toBe(true);
  });

  it('refusée pour un inconnu ; une fin de bille en trop ne fausse pas le plafond', () => {
    const s = started(1);
    expect(s.extraBall('zzz')).toBe(false);
    s.ballFinished('zzz');
    s.ballStarted(alice, 0);
    expect(s.canDrop('b')).toBe(false);
  });

  it('remove() libère toutes les billes du joueur dans le plafond', () => {
    const s = started(2);
    s.ballStarted(alice, 0);
    s.extraBall('a');
    s.remove('a');
    s.ballStarted(bob, 0);
    expect(s.canDrop('c')).toBe(true);
  });
});
```

- [ ] **Step 4: Lancer les tests, vérifier l'échec**

Run: `npx vitest run src/game/state.test.ts`
Expected: FAIL — `s.waiting` vaut `undefined`, `s.extraBall is not a function`, et les tests `running()` qui attendent le podium à 60 000 échouent encore par endroits.

- [ ] **Step 5: Implémenter** — remplacer tout `src/game/state.ts`

```ts
// Source de vérité de la partie : joueurs, scores, billes actives, phase. Pur (pas de Phaser).
export type Phase = 'playing' | 'podium';

export interface Viewer { id: string; name: string; color: string }
export interface Player extends Viewer { score: number; scoredAt: number; balls: number }

export class GameState {
  readonly players = new Map<string, Player>();
  private readonly active = new Map<string, number>(); // viewer → billes en jeu (2 avec une bille bonus)
  private inPlay = 0; // total des billes en jeu, borné par maxBalls
  phase: Phase = 'playing';
  waiting = false; // carte prête, timer pas encore lancé : aucune bille jouée
  private durationMs = 0;
  startedAt = 0; // décalé comme endsAt à chaque reprise : endsAt - startedAt = durée jouée
  endsAt = 0;
  private podiumEndsAt = 0;
  private pausedAt: number | null = null;

  constructor(public maxBalls: number, private readonly podiumMs: number) {}

  get paused() { return this.pausedAt !== null; }

  /** Nouvelle partie, en attente : le timer ne part qu'à la première bille. */
  start(now: number, durationMs: number) {
    this.players.clear();
    this.active.clear();
    this.inPlay = 0;
    this.phase = 'playing';
    this.pausedAt = null;
    this.waiting = true;
    this.durationMs = durationMs;
    this.startedAt = this.endsAt = now;
  }

  canDrop(userId: string): boolean {
    return this.phase === 'playing' && !this.paused && !this.active.has(userId) && this.inPlay < this.maxBalls;
  }

  hasBall(userId: string) { return this.active.has(userId); }

  ballStarted(v: Viewer, now: number) {
    if (this.waiting) {
      this.waiting = false;
      this.startedAt = now;
      this.endsAt = now + this.durationMs;
    }
    this.active.set(v.id, (this.active.get(v.id) ?? 0) + 1);
    this.inPlay++;
    const p = this.players.get(v.id);
    if (p) Object.assign(p, { name: v.name, color: v.color, balls: p.balls + 1 });
    else this.players.set(v.id, { ...v, score: 0, scoredAt: 0, balls: 1 });
  }

  /** Bille bonus (taquet spécial) : en plus de la bille du viewer, mais sous le plafond global. */
  extraBall(userId: string): boolean {
    if (!this.players.has(userId) || this.inPlay >= this.maxBalls) return false;
    this.active.set(userId, (this.active.get(userId) ?? 0) + 1);
    this.inPlay++;
    return true;
  }

  ballFinished(userId: string) {
    const n = this.active.get(userId);
    if (!n) return;
    this.inPlay--;
    if (n > 1) this.active.set(userId, n - 1);
    else this.active.delete(userId);
  }

  /** Nom résolu après coup (lookup réseau d'un viewer venu de Heat). */
  rename(userId: string, name: string) {
    const p = this.players.get(userId);
    if (p) p.name = name;
  }

  addScore(userId: string, points: number, now: number) {
    const p = this.players.get(userId);
    if (!p) return;
    p.score += points;
    p.scoredAt = now;
  }

  top(n: number): Player[] {
    return [...this.players.values()]
      .sort((a, b) => b.score - a.score || a.scoredAt - b.scoredAt)
      .slice(0, n);
  }

  resetScore(userId: string) {
    const p = this.players.get(userId);
    if (p) p.score = 0;
  }

  /** Exclusion : le joueur disparaît du classement (ses billes ont déjà été retirées par Game). */
  remove(userId: string) {
    this.players.delete(userId);
    this.inPlay -= this.active.get(userId) ?? 0;
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

  remainingMs(now: number) {
    return this.waiting ? this.durationMs : Math.max(0, this.endsAt - (this.pausedAt ?? now));
  }

  /** En attente : la partie se termine sans avoir commencé (podium vide, durée jouée nulle). */
  endNow(now: number) {
    if (this.waiting) {
      this.waiting = false;
      this.startedAt = this.endsAt = now;
    } else this.endsAt = Math.min(this.endsAt, now);
  }

  /** Fait avancer les phases ; renvoie la transition survenue ('next' = lancer une nouvelle partie). */
  tick(now: number): 'podium' | 'next' | null {
    if (this.paused || this.waiting) return null;
    if (this.phase === 'playing' && now >= this.endsAt) {
      this.phase = 'podium';
      this.podiumEndsAt = now + this.podiumMs;
      return 'podium';
    }
    if (this.phase === 'podium' && now >= this.podiumEndsAt) return 'next';
    return null;
  }
}
```

- [ ] **Step 6: Mettre à jour l'appelant** — `src/scenes/Game.ts`, dans `requestDrop`

```ts
    this.state.ballStarted(viewer, Date.now());
```

- [ ] **Step 7: Lancer les tests et le typage**

Run: `npm run test` puis `npx tsc --noEmit`
Expected: tous les tests PASS, aucune erreur de type.

- [ ] **Step 8: Afficher l'attente** — `src/scenes/Hud.ts` et `src/ui/menu.ts`

Dans `Hud`, ajouter le champ sous `private timer?` :

```ts
  private hint?: Phaser.GameObjects.Text; // « En attente de la première bille »
```

Dans `build()`, juste après `ui.add(this.timer);` :

```ts
    this.hint = this.add.text(cx, 196, 'En attente de la première bille', {
      fontFamily: NAME_FONT, fontSize: '18px', color: pal.accent,
    }).setOrigin(0.5, 0).setVisible(false);
    ui.add(this.hint);
```

Dans `update()`, juste après la ligne `this.timer.setText(…)` :

```ts
    this.hint?.setVisible(s.phase === 'playing' && s.waiting);
```

Dans `src/ui/menu.ts`, remplacer la ligne `['Phase', …]` de `gameHtml` par :

```ts
      ['Phase', s.paused ? 'En pause' : s.phase === 'podium' ? 'Podium' : s.waiting ? 'En attente de la première bille' : 'En jeu'],
```

- [ ] **Step 9: Étendre la vérification navigateur** — `scripts/verify-streamer.mjs`

Après la ligne `check('2e lancement : menu fermé', …)` :

```js
// 2 bis. Timer en attente tant qu'aucune bille n'est jouée
const w1 = await remaining(page);
await page.waitForTimeout(1200);
check('attente : timer figé avant la première bille', (await page.evaluate(`${G}.state.waiting`)) && (await remaining(page)) === w1, `${w1} ms`);
```

Après la ligne `check('drop avant pause', …)` :

```js
check('première bille : timer lancé', !(await page.evaluate(`${G}.state.waiting`)));
```

- [ ] **Step 10: Vérifier dans le navigateur**

Run: `npm run dev` dans un terminal (laisser tourner), puis `npm run verify` dans un autre (environ 2 min).
Expected: chaque ligne commence par `OK`, code de sortie 0.

Ouvrir ensuite `http://localhost:5173/` : le timer affiche `5:00` figé avec « En attente de la première bille » dessous, sans chevaucher les chiffres ni le filet. Un clic sur le plateau lance le décompte et fait disparaître la ligne. Si elle chevauche, ajuster son `y` (196) dans `Hud.build()`.

- [ ] **Step 11: Cocher `PLAN.md` et committer**

Cocher les trois cases de la section « 13. Timer à la première bille » et la ligne 13 d'« Avancement ».

```bash
git add PLAN.md src/game/state.ts src/game/state.test.ts src/scenes/Game.ts src/scenes/Hud.ts src/ui/menu.ts scripts/verify-streamer.mjs
git commit -m "feat: le timer démarre à la première bille ; billes comptées par viewer"
```

---

### Task 2: Top du mois — module pur

**Files:**
- Create: `src/game/monthly.ts`, `src/game/monthly.test.ts`

**Interfaces:**
- Consumes: `Player` de `src/game/state.ts` (`{ id, name, color, score, scoredAt, balls }`) ; `readJson`, `writeJson`, `KV` de `src/storage.ts`.
- Produces:
  - `interface MonthlyEntry { id: string; name: string; color: string; score: number; at: number }`
  - `MONTHLY_MAX = 500`, `monthOf(now: number): string` (`'YYYY-MM'`, heure locale)
  - `class Monthly { constructor(kv: KV | null); record(players: Iterable<Player>, now: number): void; top(n: number, now: number, live?: Iterable<Player>): MonthlyEntry[]; remove(id: string): void }`

- [ ] **Step 1: Écrire les tests qui échouent** — `src/game/monthly.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { Monthly, MONTHLY_MAX, monthOf } from './monthly';
import type { Player } from './state';

const memory = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
// dates construites en heure locale : les tests ne dépendent pas du fuseau de la machine
const OCT = new Date(2026, 9, 15, 20).getTime();
const NOV = new Date(2026, 10, 1, 0, 0, 1).getTime();
const player = (id: string, score: number, scoredAt = 1, name = id.toUpperCase()): Player =>
  ({ id, name, color: '#f00', score, scoredAt, balls: 1 });
const ids = (m: Monthly, now = OCT, live?: Player[]) => m.top(10, now, live).map((e) => `${e.id}:${e.score}`);

describe('Monthly', () => {
  it('monthOf : mois civil local', () => {
    expect(monthOf(OCT)).toBe('2026-10');
    expect(monthOf(new Date(2026, 0, 1).getTime())).toBe('2026-01');
    expect(monthOf(new Date(2026, 9, 31, 23, 59, 59).getTime())).toBe('2026-10');
  });

  it('garde le meilleur score de chaque viewer', () => {
    const m = new Monthly(memory());
    m.record([player('a', 100), player('b', 50)], OCT);
    m.record([player('a', 80), player('b', 70)], OCT);
    expect(ids(m)).toEqual(['a:100', 'b:70']);
  });

  it('score égal : l\'entrée et sa date ne changent pas', () => {
    const m = new Monthly(memory());
    m.record([player('a', 100, 10)], OCT);
    m.record([player('a', 100, 99)], OCT);
    expect(m.top(1, OCT)[0].at).toBe(10);
  });

  it('record battu : nom, couleur et date mis à jour', () => {
    const m = new Monthly(memory());
    m.record([player('a', 100, 10, 'Viewer-1234')], OCT);
    m.record([{ ...player('a', 150, 20, 'Alice'), color: '#0f0' }], OCT);
    expect(m.top(1, OCT)).toEqual([{ id: 'a', name: 'Alice', color: '#0f0', score: 150, at: 20 }]);
  });

  it('ex æquo : le premier à avoir atteint le score est devant', () => {
    const m = new Monthly(memory());
    m.record([player('a', 100, 30), player('b', 100, 20)], OCT);
    expect(ids(m)).toEqual(['b:100', 'a:100']);
  });

  it('scores nuls et anonymes Heat (U…) ignorés', () => {
    const m = new Monthly(memory());
    m.record([player('a', 0), player('Uabc123', 500), player('streamer', 5)], OCT);
    expect(ids(m)).toEqual(['streamer:5']);
  });

  it('changement de mois : table vide, remplacée au premier enregistrement', () => {
    const kv = memory();
    const m = new Monthly(kv);
    m.record([player('a', 100)], OCT);
    expect(ids(m, NOV)).toEqual([]);
    expect(ids(m, OCT)).toEqual(['a:100']); // une simple lecture n'efface rien
    m.record([player('b', 10)], NOV);
    expect(ids(m, NOV)).toEqual(['b:10']);
    expect(ids(new Monthly(kv), NOV)).toEqual(['b:10']);
  });

  it('live : classement fusionné sans rien écrire', () => {
    const kv = memory();
    const m = new Monthly(kv);
    m.record([player('a', 100), player('b', 50)], OCT);
    expect(ids(m, OCT, [player('b', 120), player('c', 60), player('a', 10)])).toEqual(['b:120', 'a:100', 'c:60']);
    expect(ids(m)).toEqual(['a:100', 'b:50']);
    expect(ids(new Monthly(kv))).toEqual(['a:100', 'b:50']);
  });

  it('live un autre mois que la table : seuls les scores live', () => {
    const m = new Monthly(memory());
    m.record([player('a', 100)], OCT);
    expect(ids(m, NOV, [player('b', 5)])).toEqual(['b:5']);
  });

  it('remove() retire le viewer et persiste', () => {
    const kv = memory();
    const m = new Monthly(kv);
    m.record([player('a', 100), player('b', 50)], OCT);
    m.remove('a');
    m.remove('zzz');
    expect(ids(m)).toEqual(['b:50']);
    expect(ids(new Monthly(kv))).toEqual(['b:50']);
  });

  it('deux onglets sur le même stockage : aucun record écrasé', () => {
    const kv = memory();
    const tab1 = new Monthly(kv), tab2 = new Monthly(kv);
    tab1.record([player('a', 100)], OCT);
    tab2.record([player('b', 50)], OCT);
    expect(ids(new Monthly(kv))).toEqual(['a:100', 'b:50']);
  });

  it(`plafonné aux ${MONTHLY_MAX} meilleurs`, () => {
    const m = new Monthly(memory());
    m.record(Array.from({ length: MONTHLY_MAX + 20 }, (_, i) => player(`p${i}`, i + 1)), OCT);
    const all = m.top(Infinity, OCT);
    expect(all).toHaveLength(MONTHLY_MAX);
    expect(all[0].score).toBe(MONTHLY_MAX + 20);
    expect(all.at(-1)!.score).toBe(21);
  });

  it('stockage corrompu, absent ou entrées invalides : table vide, le jeu continue', () => {
    expect(ids(new Monthly(memory({ 'pachinko-monthly': '{oups' })))).toEqual([]);
    expect(ids(new Monthly(memory({ 'pachinko-monthly': '[1,2]' })))).toEqual([]);
    expect(ids(new Monthly(null))).toEqual([]);
    const kv = memory({ 'pachinko-monthly': JSON.stringify({ month: '2026-10', entries: [
      { id: 'a', name: 'A', color: '#f00', score: 10, at: 1 }, { id: 'b', score: 'x' }, null,
    ] }) });
    expect(ids(new Monthly(kv))).toEqual(['a:10']);
    const broken = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('quota'); } };
    const m = new Monthly(broken);
    expect(() => m.record([player('a', 1)], OCT)).not.toThrow();
    expect(ids(m)).toEqual(['a:1']);
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `npx vitest run src/game/monthly.test.ts`
Expected: FAIL — `Failed to resolve import "./monthly"`.

- [ ] **Step 3: Implémenter** — `src/game/monthly.ts`

```ts
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
```

- [ ] **Step 4: Lancer les tests et le typage**

Run: `npx vitest run src/game/monthly.test.ts` puis `npx tsc --noEmit`
Expected: 13 tests PASS, aucune erreur de type.

- [ ] **Step 5: Committer**

```bash
git add src/game/monthly.ts src/game/monthly.test.ts
git commit -m "feat: top du mois (meilleur score par viewer, mois civil, persistant)"
```

---

### Task 3: Top du mois — enregistrement et affichage

**Files:**
- Modify: `src/scenes/Game.ts:18-22,63,77,118-143,226-229`, `src/scenes/Hud.ts:2-3,11,46,105,137-141,150`
- Modify: `scripts/verify-streamer.mjs`, `CLAUDE.md`, `PLAN.md`

**Interfaces:**
- Consumes: `Monthly`, `MonthlyEntry` (Task 2) ; `GameState.waiting` (Task 1).
- Produces:
  - `Game.monthly: Monthly` (public, lu par la vérif navigateur) ; registre Phaser `'monthly'` → instance de `Monthly`.
  - `export const ROWS = 10` dans `src/scenes/Hud.ts`.

- [ ] **Step 1: Écrire la vérification navigateur qui échoue** — `scripts/verify-streamer.mjs`

Sous la ligne `const remaining = …` en tête de fichier :

```js
const H = `window.game.scene.getScene('Hud')`;
const entry = (id, score) => `{ id: '${id}', name: '${id}', color: '#ff0000', score: ${score}, scoredAt: 1, balls: 1 }`;
const inMonthly = (page, id) => page.evaluate(`${G}.monthly.top(500, Date.now()).some((e) => e.id === '${id}')`);
```

Après le bloc « 2 bis » (Task 1) :

```js
// 2 ter. Top du mois affiché pendant l'attente
await page.evaluate(`${G}.monthly.record([${entry('42', 777)}], Date.now()); window.game.events.emit('player', '42')`);
await page.waitForFunction(`${H}.title.text.startsWith('TOP DU MOIS')`);
check('attente : top du mois affiché', await page.evaluate(`${H}.lines.some((l) => l.id === '42')`));
```

Après la ligne `check('première bille : timer lancé', …)` (Task 1) :

```js
await page.waitForFunction(`${H}.title.text === 'CLASSEMENT'`);
check('première bille : classement en direct', !(await page.evaluate(`${H}.lines.some((l) => l.id === '42')`)));
```

Dans le bloc 4, juste avant le premier `await page.click('[data-act=ban][data-id=v1]')` :

```js
await page.evaluate(`${G}.monthly.record([${entry('v1', 5)}], Date.now())`);
```

et après `check('exclu : ban persisté', …)` :

```js
check('exclu : retiré du top du mois', !(await inMonthly(page, 'v1')));
```

Dans le bloc 5, après `check('historique : partie enregistrée', …)` :

```js
check('debug : rien d\'enregistré dans le top du mois', !(await inMonthly(page, 'v2')));
```

- [ ] **Step 2: Lancer la vérif, vérifier l'échec**

Run: `npm run dev` (laisser tourner), puis `npm run verify`
Expected: le script s'arrête sur une erreur `Cannot read properties of undefined (reading 'record')` (`Game.monthly` n'existe pas encore).

- [ ] **Step 3: Câbler `Game`** — `src/scenes/Game.ts`

Imports, sous `import { History } from '../game/history';` :

```ts
import { Monthly } from '../game/monthly';
```

et sous `import { Juice, type Pulse } from './fx';` :

```ts
import { ROWS } from './Hud';
```

Champ, sous `readonly history = new History(this.kv);` :

```ts
  readonly monthly = new Monthly(this.kv);
```

Dans `create()`, sous `this.game.registry.set('state', this.state);` :

```ts
    this.game.registry.set('monthly', this.monthly);
```

Dans `moderate()`, dans le bloc `if (action === 'ban') { … }`, après `this.state.remove(id);` :

```ts
        this.monthly.remove(id);
```

Dans `recordGame()`, juste avant `this.game.events.emit('history');` :

```ts
    if (!params.debug) this.monthly.record(s.players.values(), Date.now()); // bots et parties de test hors du top
```

Dans `loadGame()`, juste avant `this.game.events.emit('phase', 'playing');` :

```ts
    this.warmMonthly();
```

Nouvelle méthode, sous `recordGame()` :

```ts
  /** Top du mois : bille de repli puis avatar pour les viewers pas encore vus dans cette session. */
  private warmMonthly() {
    for (const e of this.monthly.top(ROWS, Date.now())) {
      if (this.textures.exists(avatarKey(e.id))) continue;
      fallbackKey(this, e, this.theme.font.family, this.theme.palette.ballRim);
      this.fetchIdentity(e);
    }
  }
```

- [ ] **Step 4: Afficher le top du mois** — `src/scenes/Hud.ts`

Imports : ajouter `params` à l'import de `../config`, retirer `Player` de l'import de `../game/state` (il n'est plus utilisé), ajouter l'import de type :

```ts
import { params, BOARD_W, PANEL_W, HEIGHT, WIDTH } from '../config';
import type { GameState } from '../game/state';
import type { Monthly } from '../game/monthly';
```

Exporter `ROWS` et déclarer le type de ligne, à la place de `const ROWS = 10;` :

```ts
export const ROWS = 10;
type Row = { id: string; name: string; score: number };
```

Champ, sous `private hint?` :

```ts
  private title?: Phaser.GameObjects.Text; // « CLASSEMENT » ou « TOP DU MOIS · <mois> »
```

Dans `build()`, remplacer la ligne `ui.add(this.add.text(x0 + 40, 240, 'CLASSEMENT', …));` par :

```ts
    this.title = this.add.text(x0 + 40, 240, 'CLASSEMENT', { fontFamily: font, fontSize: '22px', color: pal.accent });
    ui.add(this.title);
```

Dans `renderTop()`, remplacer les deux lignes `const top = s.top(ROWS);` et `top.forEach((p: Player, i) => {` par, respectivement :

```ts
    // top du mois pendant le podium et l'attente de la première bille, classement en direct sinon
    const m = this.game.registry.get('monthly') as Monthly | undefined;
    const now = Date.now();
    // podium : les scores de la partie qui se termine comptent déjà (pas en debug, où rien n'est enregistré)
    const month = m && (s.phase === 'podium' || s.waiting)
      ? m.top(ROWS, now, s.phase === 'podium' && !params.debug ? s.players.values() : undefined)
      : null;
    const top: Row[] = month ?? s.top(ROWS);
    this.title?.setText(month
      ? `TOP DU MOIS · ${new Date(now).toLocaleDateString('fr-FR', { month: 'long' }).toUpperCase()}`
      : 'CLASSEMENT');
```

```ts
    top.forEach((p, i) => {
```

- [ ] **Step 5: Lancer les tests, le typage et la vérif navigateur**

Run: `npm run test`, `npx tsc --noEmit`, puis `npm run verify` (serveur de dev lancé)
Expected: tests PASS, aucune erreur de type, chaque ligne de la vérif commence par `OK`.

- [ ] **Step 6: Vérifier à la main hors debug**

Ouvrir `http://localhost:5173/?duration=1` (sans `debug`). Attendu, dans l'ordre :
1. Panneau « TOP DU MOIS · <MOIS> » (vide la première fois), timer figé.
2. Clic sur le plateau : le titre redevient « CLASSEMENT ».
3. À la fin de la minute : podium, et le panneau repasse à « TOP DU MOIS » avec ton score.
4. Recharger la page : le score est toujours dans le top (clé `pachinko-monthly` du `localStorage`).

Vérifier aussi que le titre tient sur une ligne dans le panneau ; sinon réduire sa taille de police (22 px) dans `Hud.build()`.

- [ ] **Step 7: Documenter, cocher `PLAN.md`, committer**

Dans `CLAUDE.md`, section Architecture, remplacer `` `src/game/bans.ts`, `src/game/history.ts` : purs, persistants. `` par :

```markdown
`src/game/bans.ts`, `src/game/history.ts`, `src/game/monthly.ts` (top du mois) : purs, persistants.
```

Cocher les quatre cases de la section « 14. Top du mois » de `PLAN.md` et la ligne 14 d'« Avancement ».

```bash
git add CLAUDE.md PLAN.md src/scenes/Game.ts src/scenes/Hud.ts scripts/verify-streamer.mjs
git commit -m "feat: top du mois enregistré en fin de podium et affiché entre les parties"
```

---

### Task 4: Réglages et tirage des taquets spéciaux

**Files:**
- Create: `src/game/specials.ts`, `src/game/specials.test.ts`
- Modify: `src/settings.ts:2,4-15,39-46,56`, `src/settings.test.ts:3,25,87`, `src/config.test.ts:7-8,15-16`
- Modify: `src/ui/menu.ts:9,166,212-219`, `src/scenes/Game.ts:105-106`, `README.md:54`

**Interfaces:**
- Produces (`src/game/specials.ts`) :
  - `EFFECTS: readonly { id, label, color }[]` — dans l'ordre `double`, `moon`, `warp`, `slow`, `x2`, `gold`, `quake`.
  - `type EffectId = 'double' | 'moon' | 'warp' | 'slow' | 'x2' | 'gold' | 'quake'`
  - `ALL_EFFECTS: string` = `'double,moon,warp,slow,x2,gold,quake'`
  - `normalizeEffects(raw: string): string`
  - `pickEffect(enabled: string, canDouble: boolean, rnd: () => number): EffectId | null`
- Produces (`Settings`, donc `params`) : `specialEvery: number` (0–300, défaut 20), `specialEffects: string` (défaut `ALL_EFFECTS`).

- [ ] **Step 1: Écrire les tests du tirage** — `src/game/specials.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { EFFECTS, ALL_EFFECTS, normalizeEffects, pickEffect } from './specials';

describe('normalizeEffects', () => {
  it('catalogue : sept effets, ordre canonique', () =>
    expect(ALL_EFFECTS).toBe('double,moon,warp,slow,x2,gold,quake'));

  it.each([
    [ALL_EFFECTS, ALL_EFFECTS],
    ['warp,moon', 'moon,warp'],
    [' moon , nope,moon,<script>', 'moon'],
    ['', ''],
  ])('%j → %j', (raw, expected) => expect(normalizeEffects(raw)).toBe(expected));
});

describe('pickEffect', () => {
  it('tire parmi les effets activés seulement', () => {
    expect(pickEffect('moon,warp', true, () => 0)).toBe('moon');
    expect(pickEffect('moon,warp', true, () => 0.99)).toBe('warp');
    expect(pickEffect('moon,warp', true, () => 1)).toBe('warp'); // tirage borné
  });

  it('chaque effet activé est atteignable', () => {
    const n = EFFECTS.length;
    expect(EFFECTS.map((_, i) => pickEffect(ALL_EFFECTS, true, () => (i + 0.5) / n))).toEqual(EFFECTS.map((e) => e.id));
  });

  it('bille bonus écartée au plafond de billes', () => {
    expect(pickEffect('double,moon', false, () => 0)).toBe('moon');
    expect(pickEffect('double', false, () => 0)).toBeNull();
  });

  it('aucun effet activé ou ids inconnus → null', () => {
    expect(pickEffect('', true, () => 0)).toBeNull();
    expect(pickEffect('nope', true, () => 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Écrire les tests des réglages** — `src/settings.test.ts` et `src/config.test.ts`

Dans `src/settings.test.ts`, ajouter l'import :

```ts
import { ALL_EFFECTS } from './game/specials';
```

Dans le test « aller-retour », remplacer la ligne `const s = { channel: 'machaine', … };` par :

```ts
    const s = {
      ...DEFAULT_SETTINGS, channel: 'machaine', duration: 3, maxBalls: 80, theme: 'noel', shake: false, autoNext: false,
      specialEvery: 45, specialEffects: 'moon,warp',
    };
```

À la fin du fichier :

```ts
describe('taquets spéciaux', () => {
  it('défauts : un toutes les 20 s, tous les effets', () =>
    expect(DEFAULT_SETTINGS).toMatchObject({ specialEvery: 20, specialEffects: ALL_EFFECTS }));

  it('specialEvery borné 0–300, 0 = désactivé', () => {
    expect(updateSettings(DEFAULT_SETTINGS, { specialEvery: 0 }).specialEvery).toBe(0);
    expect(updateSettings(DEFAULT_SETTINGS, { specialEvery: 9999 }).specialEvery).toBe(300);
    expect(updateSettings(DEFAULT_SETTINGS, { specialEvery: -5 }).specialEvery).toBe(0);
  });

  it('specialEffects nettoyé : ids inconnus ignorés, ordre canonique, vide = aucun effet', () => {
    expect(updateSettings(DEFAULT_SETTINGS, { specialEffects: 'warp,nope,moon' }).specialEffects).toBe('moon,warp');
    expect(updateSettings(DEFAULT_SETTINGS, { specialEffects: '' }).specialEffects).toBe('');
  });

  it('valeurs sauvegardées invalides → défauts', () => {
    const kv = memory({ 'pachinko-settings': JSON.stringify({ specialEvery: 'abc', specialEffects: 42 }) });
    expect(loadSettings(kv)).toEqual(DEFAULT_SETTINGS);
  });

  it('surcharge d\'URL, ids inconnus ignorés', () => {
    expect(mergeSettings(DEFAULT_SETTINGS, {}, '?specialEvery=5&specialEffects=moon,nope,warp'))
      .toMatchObject({ specialEvery: 5, specialEffects: 'moon,warp' });
    expect(mergeSettings(DEFAULT_SETTINGS, {}, '?specialEffects=').specialEffects).toBe('');
  });

  it('formPatch : champ vidé inchangé, cases décochées prises en compte', () => {
    expect(formPatch({ specialEvery: '', specialEffects: 'moon' }, DEFAULT_SETTINGS)).toEqual({ specialEffects: 'moon' });
    expect(formPatch({ specialEvery: '0', specialEffects: ALL_EFFECTS }, DEFAULT_SETTINGS)).toEqual({ specialEvery: 0 });
    expect(formPatch({ specialEvery: '20', specialEffects: '' }, DEFAULT_SETTINGS)).toEqual({ specialEffects: '' });
  });
});
```

Dans `src/config.test.ts`, les deux objets attendus par `toEqual` gagnent les deux réglages. Test « valeurs par défaut » :

```ts
    expect(parseParams('')).toEqual({
      channel: null, duration: 5, maxBalls: 150, seed: null, shake: true, autoNext: true,
      specialEvery: 20, specialEffects: 'double,moon,warp,slow,x2,gold,quake',
      debug: false, bots: 0, theme: 'auto', date: null, pattern: null,
    });
```

Test « lit les paramètres » :

```ts
    const p = parseParams('?channel=MaChaine&duration=3&maxBalls=80&seed=42&shake=0&debug=1&bots=20&theme=noel&date=2026-12-15&pattern=trous&specialEvery=5&specialEffects=moon');
    expect(p).toEqual({
      channel: 'machaine', duration: 3, maxBalls: 80, seed: 42, shake: false, autoNext: true,
      specialEvery: 5, specialEffects: 'moon',
      debug: true, bots: 20, theme: 'noel', date: '2026-12-15', pattern: 'trous',
    });
```

- [ ] **Step 3: Lancer les tests, vérifier l'échec**

Run: `npm run test`
Expected: FAIL — `Failed to resolve import "./specials"` et `"./game/specials"`, objets de `config.test.ts` sans `specialEvery`.

- [ ] **Step 4: Implémenter le catalogue et le tirage** — `src/game/specials.ts`

```ts
// Taquets spéciaux : catalogue des effets et tirage. Pur (pas de Phaser) ; les effets sont dans scenes/specials.ts.
export const EFFECTS = [
  { id: 'double', label: 'BILLE BONUS', color: '#35e0ff' },
  { id: 'moon', label: 'GRAVITÉ LUNAIRE', color: '#b39dff' },
  { id: 'warp', label: 'TÉLÉPORTATION', color: '#ff5fd0' },
  { id: 'slow', label: 'RALENTI', color: '#5b9dff' },
  { id: 'x2', label: 'POINTS ×2', color: '#6dff7a' },
  { id: 'gold', label: 'PLUIE D\'OR', color: '#ffd23f' },
  { id: 'quake', label: 'SÉISME', color: '#ff7033' },
] as const;

export type EffectId = (typeof EFFECTS)[number]['id'];

/** Réglage `specialEffects` par défaut : tous les effets, dans l'ordre du catalogue. */
export const ALL_EFFECTS: string = EFFECTS.map((e) => e.id).join(',');

/** Liste d'ids séparés par des virgules → ids connus, sans doublon, dans l'ordre du catalogue. */
export function normalizeEffects(raw: string): string {
  const wanted = new Set(raw.split(',').map((s) => s.trim()));
  return EFFECTS.filter((e) => wanted.has(e.id)).map((e) => e.id).join(',');
}

/** Effet du prochain taquet spécial, ou null si aucun n'est tirable. La bille bonus est écartée au plafond de billes. */
export function pickEffect(enabled: string, canDouble: boolean, rnd: () => number): EffectId | null {
  const on = enabled.split(',');
  const ids = EFFECTS.map((e) => e.id).filter((id) => on.includes(id) && (canDouble || id !== 'double'));
  return ids.length ? ids[Math.min(ids.length - 1, Math.floor(rnd() * ids.length))] : null;
}
```

- [ ] **Step 5: Implémenter les réglages** — `src/settings.ts`

Import, sous celui de `./storage` :

```ts
import { ALL_EFFECTS, normalizeEffects } from './game/specials';
```

Dans `interface Settings`, après `autoNext` :

```ts
  specialEvery: number; // secondes entre deux taquets spéciaux, 0 = désactivé
  specialEffects: string; // ids des effets activés, séparés par des virgules (game/specials.ts)
```

`DEFAULT_SETTINGS` :

```ts
export const DEFAULT_SETTINGS: Settings = {
  channel: null, duration: 5, maxBalls: 150, theme: 'auto', shake: true, autoNext: true,
  specialEvery: 20, specialEffects: ALL_EFFECTS,
};
```

Dans l'objet renvoyé par `sanitizeSettings`, après `autoNext` :

```ts
    specialEvery: num(r.specialEvery, base.specialEvery, 0, 300),
    specialEffects: typeof r.specialEffects === 'string' ? normalizeEffects(r.specialEffects) : base.specialEffects,
```

Dans `mergeSettings`, la première boucle devient :

```ts
  for (const k of ['channel', 'duration', 'maxBalls', 'theme', 'specialEvery', 'specialEffects'] as const) if (q.has(k)) url[k] = q.get(k);
```

- [ ] **Step 6: Lancer les tests et le typage**

Run: `npm run test` puis `npx tsc --noEmit`
Expected: tous les tests PASS, aucune erreur de type.

- [ ] **Step 7: Ajouter les champs au menu** — `src/ui/menu.ts`

Import, sous celui de `../settings` :

```ts
import { EFFECTS } from '../game/specials';
```

Dans `settingsHtml`, juste après la ligne `<label class="menu-check"><input name="autoNext" …</label>` :

```ts
      <label>Taquets spéciaux : un toutes les (s, 0 = aucun) <input name="specialEvery" type="number" min="0" max="300" value="${params.specialEvery}"></label>
      ${EFFECTS.map((e) => `<label class="menu-check"><input name="fx-${e.id}" type="checkbox"${params.specialEffects.split(',').includes(e.id) ? ' checked' : ''}> ${esc(e.label)}</label>`).join('')}
```

Dans `save()`, dans l'objet passé à `formPatch`, après `autoNext: field('autoNext').checked,` :

```ts
      specialEvery: field('specialEvery').value, // champ vidé : valeur inchangée
      specialEffects: EFFECTS.filter((e) => field(`fx-${e.id}`).checked).map((e) => e.id).join(','),
```

Dans `src/scenes/Game.ts`, mettre à jour le commentaire de `applySettings` :

```ts
  /** Réglages du menu : sauvegardés (sans les surcharges d'URL), puis appliqués.
   *  Chaîne, plafond, shake, taquets spéciaux : tout de suite ; durée, thème, enchaînement : partie suivante. */
```

Dans `README.md`, la liste des paramètres d'URL (ligne `… : `channel`, `duration` (minutes), `maxBalls`, `shake=0`, `autoNext=0`.`) devient :

```markdown
sauvegardés) : `channel`, `duration` (minutes), `maxBalls`, `shake=0`, `autoNext=0`,
`specialEvery` (secondes entre deux taquets spéciaux, `0` = aucun), `specialEffects` (effets activés,
ex. `moon,warp` ; ids : `double`, `moon`, `warp`, `slow`, `x2`, `gold`, `quake`).
```

- [ ] **Step 8: Vérifier le menu dans le navigateur**

Run: `npm run dev`, ouvrir `http://localhost:5173/`, Échap, onglet Réglages.
Expected: le champ « Taquets spéciaux » vaut 20 et les sept cases sont cochées ; décocher « SÉISME », mettre 5, Enregistrer, recharger : le champ vaut 5 et « SÉISME » reste décochée. Vider le champ puis Enregistrer : il revient à 5. Le formulaire défile si la fenêtre est trop basse (`.menu-body` a déjà `overflow-y: auto`).

- [ ] **Step 9: Committer**

```bash
git add src/game/specials.ts src/game/specials.test.ts src/settings.ts src/settings.test.ts src/config.test.ts src/ui/menu.ts src/scenes/Game.ts README.md
git commit -m "feat: réglages et tirage des taquets spéciaux"
```

---

### Task 5: Taquets spéciaux en jeu

**Files:**
- Create: `src/scenes/specials.ts`
- Modify: `src/config.ts:55-64`, `src/main.ts:2,17`, `src/themes/draw.ts:44`, `src/themes/apply.ts:13,30`, `src/themes/types.ts:21`, `src/scenes/fx.ts:177`
- Modify: `src/scenes/Game.ts` (interfaces, champs, `loadGame`, `clearMap`, `buildMap`, `drop`, `onCollision`, `score`, `update`)
- Modify: `scripts/verify-streamer.mjs`, `CLAUDE.md`, `PLAN.md`

**Interfaces:**
- Consumes: `EFFECTS`, `pickEffect`, `EffectId` (Task 4) ; `params.specialEvery`, `params.specialEffects` (Task 4) ; `GameState.extraBall`, `GameState.waiting` (Task 1).
- Produces:
  - `src/scenes/Game.ts` : `export interface Ball`, `export interface PegRt { x: number; y: number; bodyId: number; img: Phaser.GameObjects.Image }`, `Game.balls` et `Game.fx` publics en lecture, `Game.pegs: PegRt[]`, `Game.bonusBall(from: Ball): void`.
  - `src/scenes/specials.ts` : `class Specials { constructor(game: Game); attach(mark, halo): void; hit(bodyId: number, ball: Ball): void; apply(id: EffectId, ball: Ball): void; clear(): void; update(dt: number): void; readonly gold: boolean; mult(userId: string): number }`.
  - `Juice.quake(): void` ; texture `pegSpecial`.

**Point vérifié avant d'écrire ce plan** (la spec le marquait « à vérifier en premier ») : `body.timeScale` existe dans le Matter de Phaser 3.90 (`node_modules/phaser/src/physics/matter-js/lib/body/Body.js`, `Body.update` multiplie le pas par `body.timeScale` et corrige la vitesse au changement). Le repli `frictionAir` de la spec n'est pas nécessaire.

- [ ] **Step 1: Écrire la vérification navigateur qui échoue** — `scripts/verify-streamer.mjs`

Sous les constantes ajoutées en Task 3, en tête de fichier :

```js
const S = `${G}.specials`;
const gravityY = (page) => page.evaluate(`${G}.matter.world.localWorld.gravity.y`);
```

Dans le bloc 3, après `check('première bille : classement en direct', …)` (Task 3) et avant `await page.keyboard.press('Escape');` :

```js
await page.evaluate(`${S}.apply('moon', [...${G}.balls.values()][0])`);
check('gravité lunaire appliquée', (await gravityY(page)) < 1);
```

Après `check('reprise : bille conservée', …)` :

```js
check('pause : effet à durée gelé', (await gravityY(page)) < 1, 'gravité lunaire encore active après 9 s de pause');
```

Entre le bloc 4 et le bloc 5 :

```js
// 4 bis. Taquets spéciaux : chaque effet s'applique sans erreur
await page.evaluate(`${G}.requestDrop(${viewer('v3')}, 900)`);
const before = await page.evaluate(`${G}.ballCount`);
await page.evaluate(`(() => {
  const b = [...${G}.balls.values()].find((x) => x.userId === 'v3');
  for (const id of ['double', 'moon', 'warp', 'slow', 'x2', 'gold', 'quake']) ${S}.apply(id, b);
})()`);
check('bille bonus : une bille de plus', (await page.evaluate(`${G}.ballCount`)) === before + 1);
check('bille bonus : pas de 3e bille pour le viewer', !(await page.evaluate(`${G}.requestDrop(${viewer('v3')}, 900)`)));
check('points ×2 et pluie d\'or actifs', await page.evaluate(`${S}.mult('v3') === 2 && ${S}.gold`));
check('ralenti : les billes des autres seulement',
  await page.evaluate(`[...${G}.balls.values()].every((b) => b.body.timeScale === (b.userId === 'v3' ? 1 : 0.4))`));
```

Dans le bloc 5, après `check('durée 1 min appliquée', true);` :

```js
check('carte suivante : effets annulés', await page.evaluate(
  `${G}.matter.world.localWorld.gravity.y === 1 && !${S}.gold && ${S}.mult('v3') === 1`));
```

Dans le bloc 6, remplacer `page = await open('?debug=1&bots=150');` par :

```js
page = await open('?debug=1&bots=150&specialEvery=2');
await page.evaluate(`(() => {
  const s = ${S}, apply = s.apply.bind(s);
  window.__fx = 0;
  s.apply = (id, ball) => { window.__fx++; apply(id, ball); };
})()`);
```

et, après la ligne `const closed = await fps();` :

```js
const fx = await page.evaluate('window.__fx');
check('taquets spéciaux : déclenchés par les billes', fx > 0, `${fx} effets en ~11 s`);
```

- [ ] **Step 2: Lancer la vérif, vérifier l'échec**

Run: `npm run dev` (laisser tourner), puis `npm run verify`
Expected: le script s'arrête sur `Cannot read properties of undefined (reading 'apply')` (`Game.specials` n'existe pas encore).

- [ ] **Step 3: Constantes de gameplay** — `src/config.ts` et `src/main.ts`

Dans `src/config.ts`, section « Physique », ajouter en première ligne :

```ts
export const GRAVITY_Y = 1;
```

Avant `// --- Partie ---` :

```ts
// --- Taquets spéciaux ---
export const SPECIAL_TTL_MS = 20000; // non touché : il s'éteint
export const MOON_GRAVITY = 0.3; // fraction de la gravité normale
export const MOON_MS = 6000;
export const SLOW_SCALE = 0.4; // vitesse des billes ralenties
export const SLOW_MS = 5000;
export const X2_MS = 10000;
export const GOLD_MS = 8000;
export const QUAKE_KICK = 9; // px / step vers le haut

```

Dans `src/main.ts` :

```ts
import { WIDTH, HEIGHT, GRAVITY_Y } from './config';
```

```ts
    matter: { gravity: { x: 0, y: GRAVITY_Y }, enableSleeping: false, autoUpdate: false, positionIterations: 4, velocityIterations: 3 },
```

- [ ] **Step 4: Texture `pegSpecial` et secousse** — thèmes et `fx.ts`

Dans `src/themes/draw.ts`, après `drawPegGolden` :

```ts
/** Taquet spécial : perle blanche à liseré, teintée à l'usage de la couleur de l'effet. */
export const drawPegSpecial: DrawFn = (ctx, w) => {
  const r = w / 2;
  const g = ctx.createRadialGradient(r * 0.7, r * 0.6, r * 0.05, r, r, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.6, '#e6e6e6');
  g.addColorStop(0.85, '#9a9a9a');
  g.addColorStop(1, '#ffffff');
  ctx.fillStyle = g;
  disc(ctx, r, r, r * 0.98);
};
```

Dans `src/themes/apply.ts`, dans `SIZES` après `pegGolden: square(PEG_R),` :

```ts
  pegSpecial: square(PEG_R),
```

et dans `DEFAULTS` après `pegGolden: D.drawPegGolden,` :

```ts
  pegSpecial: D.drawPegSpecial,
```

Dans `src/themes/types.ts` :

```ts
export type ElementKey = 'peg' | 'pegGolden' | 'pegSpecial' | 'bumper' | 'spinner' | 'ramp' | 'background';
```

Dans `src/scenes/fx.ts`, juste avant `private shake(` :

```ts
  /** Séisme (taquet spécial) : grosse secousse, soumise au réglage et au cooldown habituels. */
  quake() { this.shake(400, 0.012); }

```

- [ ] **Step 5: La classe `Specials`** — `src/scenes/specials.ts`

```ts
// Taquets spéciaux : un taquet de la carte s'allume de temps en temps et déclenche un effet au premier
// contact. État de taille fixe, comptes à rebours en ms de scène : figés en pause, comme la physique.
import Phaser from 'phaser';
import {
  params, BOARD_W, WALL, BALL_R, GRAVITY_Y, SPECIAL_TTL_MS, MOON_GRAVITY, MOON_MS, SLOW_SCALE, SLOW_MS,
  X2_MS, GOLD_MS, QUAKE_KICK,
} from '../config';
import { EFFECTS, pickEffect, type EffectId } from '../game/specials';
import type { Game, Ball, PegRt } from './Game';

const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;
const COLOR = Object.fromEntries(EFFECTS.map((e) => [e.id, hex(e.color)])) as Record<EffectId, number>;
const LABEL = Object.fromEntries(EFFECTS.map((e) => [e.id, e.label])) as Record<EffectId, string>;

export class Specials {
  private mark?: Phaser.GameObjects.Image; // pastille teintée posée sur le taquet allumé (hitbox inchangée)
  private halo?: Phaser.GameObjects.Image;
  private peg: PegRt | null = null; // taquet allumé
  private effect: EffectId | null = null; // tiré à l'apparition : la couleur l'annonce
  private idle = 0; // ms de jeu depuis la fin du dernier taquet spécial
  private ttl = 0;
  private hitBall: Ball | null = null; // contact reçu pendant le pas physique, appliqué dans update()
  private hitEffect: EffectId | null = null;
  private moonMs = 0;
  private slowMs = 0;
  private goldMs = 0;
  private x2 = new Map<string, number>(); // viewer → ms restants

  constructor(private game: Game) {}

  /** Pluie d'or en cours : tous les taquets valent un taquet doré. */
  get gold() { return this.goldMs > 0; }

  mult(userId: string) { return this.x2.has(userId) ? 2 : 1; }

  /** Nouvelle carte : images créées une fois par Game.buildMap, détruites avec la carte. */
  attach(mark: Phaser.GameObjects.Image, halo: Phaser.GameObjects.Image) {
    this.mark = mark;
    this.halo = halo;
  }

  /** Appelé par le handler de collision : rien n'est créé ni déplacé pendant le pas physique. */
  hit(bodyId: number, ball: Ball) {
    if (!this.effect || this.peg?.bodyId !== bodyId) return;
    this.hitBall = ball;
    this.hitEffect = this.effect;
    this.off();
  }

  /** Déclenche un effet pour la bille qui a touché le taquet (appelé aussi par scripts/verify-streamer.mjs). */
  apply(id: EffectId, ball: Ball) {
    const g = this.game, body = g.matter.body;
    g.fx.label(`${g.state.players.get(ball.userId)?.name ?? ''} · ${LABEL[id]}`, ball.body.position);
    if (id === 'double') g.bonusBall(ball);
    else if (id === 'moon') {
      this.moonMs = MOON_MS;
      g.matter.world.setGravity(0, GRAVITY_Y * MOON_GRAVITY);
    } else if (id === 'warp') {
      body.setPosition(ball.body, { x: Phaser.Math.Between(WALL + BALL_R * 2, BOARD_W - WALL - BALL_R * 2), y: BALL_R + 24 });
      body.setVelocity(ball.body, { x: 0, y: 0 });
      // sans ça, l'anti-blocage mesurerait l'immobilité depuis l'ancienne position
      ball.anchor.x = ball.body.position.x;
      ball.anchor.y = ball.body.position.y;
      ball.anchor.t = g.time.now;
    } else if (id === 'slow') {
      this.slowMs = SLOW_MS;
      for (const b of g.balls.values()) b.body.timeScale = b.userId === ball.userId ? 1 : SLOW_SCALE;
    } else if (id === 'x2') this.x2.set(ball.userId, X2_MS);
    else if (id === 'gold') {
      this.goldMs = GOLD_MS;
      for (const p of g.pegs) p.img.setTexture('pegGolden');
    } else {
      for (const b of g.balls.values()) {
        body.setVelocity(b.body, {
          x: b.body.velocity.x + Phaser.Math.FloatBetween(-QUAKE_KICK / 2, QUAKE_KICK / 2), y: -QUAKE_KICK,
        });
      }
      g.fx.quake();
    }
  }

  /** Podium ou nouvelle carte : taquet éteint, tout revient à la normale. À appeler AVANT Game.clearMap(). */
  clear() {
    this.off();
    this.hitBall = this.hitEffect = null;
    if (this.moonMs > 0) this.endMoon();
    if (this.slowMs > 0) this.endSlow();
    if (this.goldMs > 0) this.endGold();
    this.x2.clear();
  }

  update(dt: number) {
    const g = this.game, ball = this.hitBall, id = this.hitEffect;
    this.hitBall = this.hitEffect = null;
    if (ball && id && !ball.done) this.apply(id, ball);
    if (this.moonMs > 0 && (this.moonMs -= dt) <= 0) this.endMoon();
    if (this.slowMs > 0 && (this.slowMs -= dt) <= 0) this.endSlow();
    if (this.goldMs > 0 && (this.goldMs -= dt) <= 0) this.endGold();
    for (const [user, ms] of this.x2) {
      if (ms > dt) this.x2.set(user, ms - dt);
      else this.x2.delete(user);
    }
    if (g.state.phase !== 'playing' || g.state.waiting) return; // aucun taquet spécial hors partie lancée
    if (this.peg) {
      this.halo?.setAlpha(0.6 + 0.4 * Math.sin(g.time.now / 150));
      if ((this.ttl -= dt) <= 0) this.off();
    } else if (params.specialEvery > 0 && (this.idle += dt) >= params.specialEvery * 1000) this.light();
  }

  private light() {
    const g = this.game;
    this.idle = 0; // tirage impossible (aucun effet activé, carte sans taquet) : nouvel essai après un intervalle
    const id = pickEffect(params.specialEffects, g.ballCount < params.maxBalls, Math.random);
    if (!id || !g.pegs.length || !this.mark || !this.halo) return;
    const peg = g.pegs[Math.floor(Math.random() * g.pegs.length)];
    this.peg = peg;
    this.effect = id;
    this.ttl = SPECIAL_TTL_MS;
    this.mark.setPosition(peg.x, peg.y).setTint(COLOR[id]).setVisible(true);
    this.halo.setPosition(peg.x, peg.y).setTint(COLOR[id]).setVisible(true);
  }

  private off() {
    this.peg = null;
    this.effect = null;
    this.idle = 0;
    this.mark?.setVisible(false);
    this.halo?.setVisible(false);
  }

  private endMoon() {
    this.moonMs = 0;
    this.game.matter.world.setGravity(0, GRAVITY_Y);
  }

  private endSlow() {
    this.slowMs = 0;
    for (const b of this.game.balls.values()) b.body.timeScale = 1;
  }

  private endGold() {
    this.goldMs = 0;
    for (const p of this.game.pegs) p.img.setTexture('peg');
  }
}
```

- [ ] **Step 6: Câbler `Game`** — `src/scenes/Game.ts`

Import, sous `import { ROWS } from './Hud';` :

```ts
import { Specials } from './specials';
```

Interfaces : exporter `Ball` et ajouter `PegRt` sous `SpinnerRt` :

```ts
export interface Ball {
```

```ts
/** Taquet non doré de la carte : candidat aux taquets spéciaux, repeint par la pluie d'or. */
export interface PegRt { x: number; y: number; bodyId: number; img: Phaser.GameObjects.Image }
```

Champs : `balls` et `fx` deviennent lisibles par `Specials`, `pegs` et `specials` sont ajoutés.

```ts
  readonly balls = new Map<number, Ball>(); // id du body → bille
```

```ts
  readonly pegs: PegRt[] = [];
```

```ts
  readonly fx = new Juice(this);
  private specials = new Specials(this);
```

Dans `loadGame()`, juste avant `this.clearMap();` :

```ts
    this.specials.clear(); // avant clearMap : la pluie d'or repeint des images de taquets encore vivantes
```

Dans `clearMap()`, après `this.spinners = [];` :

```ts
    this.pegs.length = 0;
```

Dans `buildMap()`, dans la boucle des taquets, après la ligne `const img = this.track(…);` :

```ts
      if (!p.golden) this.pegs.push({ x: p.x, y: p.y, bodyId: body.id, img });
```

À la fin de `buildMap()`, après la ligne `g.fillStyle(hex(pal.frame), 1).fillRect(WALL, map.binTop - 2, …);` :

```ts
    // taquet spécial : pastille + halo créés une fois par carte, déplacés et teintés à chaque apparition
    this.specials.attach(
      this.track(this.add.image(0, 0, 'pegSpecial').setDisplaySize(PEG_R * 2.6, PEG_R * 2.6).setVisible(false)),
      this.track(this.add.image(0, 0, 'fx-glow').setDisplaySize(PEG_R * 9, PEG_R * 9).setBlendMode('ADD').setDepth(-1).setVisible(false)),
    );
```

`drop()` accepte une ordonnée : remplacer sa signature et supprimer sa ligne `const y = BALL_R + 24;`.

```ts
  /** Lâche une bille en x (coordonnée plateau). La bille tombe tout de suite, l'avatar arrive après. */
  private drop(viewer: Viewer, x: number, y = BALL_R + 24): Ball {
    const bx = Phaser.Math.Clamp(x, WALL + BALL_R + 2, BOARD_W - WALL - BALL_R - 2);
```

Nouvelle méthode, sous `drop()` :

```ts
  /** Bille bonus (taquet spécial) : part de la bille d'origine, à l'opposé ; refusée au plafond de billes. */
  bonusBall(from: Ball) {
    const viewer = this.state.players.get(from.userId);
    if (!viewer || !this.state.extraBall(from.userId)) return;
    const { x, y } = from.body.position;
    const dir = from.body.velocity.x > 0 ? -1 : 1;
    const ball = this.drop(viewer, x + dir * 2, y);
    this.matter.body.setVelocity(ball.body, { x: dir * 3, y: Math.min(from.body.velocity.y, 0) });
  }
```

Remplacer `onCollision()` en entier :

```ts
  private onCollision(e: Phaser.Physics.Matter.Events.CollisionStartEvent) {
    for (const pair of e.pairs) {
      const a = pair.bodyA.parent, b = pair.bodyB.parent;
      const ball = this.balls.get(a.id) ?? this.balls.get(b.id);
      if (!ball || ball.done) continue;
      const other = ball.body === a ? b : a;
      const el = this.els.get(other.id);
      if (!el) continue;
      const { x, y } = ball.body.position;
      if (el.kind === 'bin') {
        ball.done = true; // avant destruction : un 2e événement dans la même frame est ignoré
        const pts = this.score(ball, el.points, x, y);
        this.fx.bin(el.pulse, el.binX ?? x, this.map!.binTop, pts, el.points >= BIG_WIN);
        this.toRemove.push(ball);
        continue;
      }
      if (el.kind === 'bumper') this.bounce(ball, other);
      else if (el.kind === 'peg') this.specials.hit(other.id, ball); // avant le cooldown : le 1er contact compte toujours
      const last = ball.hits.get(other.id) ?? -Infinity;
      if (this.time.now - last < HIT_COOLDOWN_MS) continue;
      ball.hits.set(other.id, this.time.now);
      const gold = el.kind === 'peg' && this.specials.gold;
      const pts = this.score(ball, gold ? PTS_PEG_GOLDEN : el.points, x, y);
      this.fx.popup(x, y, pts);
      if (el.kind === 'peg') this.fx.peg(el.pulse, x, y, !!el.golden || gold);
      else if (el.kind === 'bumper') this.fx.bumper(el.pulse, x, y);
      else this.fx.spinner(el.pulse, x, y);
    }
  }
```

Remplacer `score()` :

```ts
  /** Renvoie les points réellement marqués (doublés par le taquet « points ×2 »). */
  private score(ball: Ball, points: number, x: number, y: number): number {
    const pts = points * this.specials.mult(ball.userId);
    this.state.addScore(ball.userId, pts, Date.now());
    this.game.events.emit('score', ball.userId, pts, x, y);
    return pts;
  }
```

Dans `update()`, remplacer `if (transition === 'podium') this.game.events.emit('phase', 'podium');` par :

```ts
    if (transition === 'podium') {
      this.specials.clear(); // les billes encore en jeu finissent leur course sans effet
      this.game.events.emit('phase', 'podium');
    }
```

et ajouter après `this.fx.update(delta);` :

```ts
    this.specials.update(delta);
```

- [ ] **Step 7: Lancer les tests, le typage et la vérif navigateur**

Run: `npm run test`, `npx tsc --noEmit`, puis `npm run verify` (serveur de dev lancé)
Expected: tests PASS, aucune erreur de type, chaque ligne de la vérif commence par `OK`, dont « taquets spéciaux : déclenchés par les billes » et « 150 billes : FPS menu fermé / ouvert ». Noter les deux valeurs de FPS affichées : elles doivent être à 60 (ou au taux de rafraîchissement de la machine).

- [ ] **Step 8: Voir les sept effets à la main**

Un effet à la fois, avec `http://localhost:5173/?debug=1&bots=40&specialEvery=3&specialEffects=<id>` :

| `<id>` | Attendu |
|---|---|
| `double` | une 2e bille au même avatar part du taquet touché ; le compteur « billes » du debug monte au-delà de 40 |
| `moon` | toutes les billes flottent pendant 6 s puis retombent normalement |
| `warp` | la bille qui touche réapparaît en haut du plateau |
| `slow` | toutes les billes sauf celle du déclencheur ralentissent 5 s |
| `x2` | les pop-ups du déclencheur affichent `+2` sur les taquets pendant 10 s |
| `gold` | tous les taquets deviennent dorés 8 s, pop-ups `+10` |
| `quake` | toutes les billes sautent, l'écran tremble |

Dans tous les cas : un seul taquet allumé à la fois, coloré avec halo pulsant ; il s'éteint au contact avec le texte « NOM · EFFET » ; aucune bille coincée.

Puis `http://localhost:5173/?debug=1&bots=150` pendant 2 min : 60 fps au compteur debug, aucune erreur dans la console.

Enfin, changement de thème pendant une pluie d'or : `?debug=1&bots=40&specialEvery=3&specialEffects=gold`, touche T plusieurs fois pendant que les taquets sont dorés. Attendu : aucune erreur console, taquets normaux sur la nouvelle carte.

- [ ] **Step 9: Documenter, cocher `PLAN.md`, committer**

Dans `CLAUDE.md`, section Architecture, ajouter après la ligne `src/scenes/Game.ts` :

```markdown
- Taquets spéciaux : `src/game/specials.ts` (catalogue des effets + tirage, pur) et `src/scenes/specials.ts`
  (taquet allumé, effets, possédé par `Game` comme `Juice`). Spec :
  `docs/superpowers/specs/2026-10-11-timer-top-du-mois-taquets-speciaux-design.md`.
```

Section « Règles de perf », remplacer la première puce par :

```markdown
- Une bille active max par viewer (plus une bille bonus, taquet spécial) ; plafond global `maxBalls`.
```

Section « Commandes », la ligne `npm run test` devient :

```markdown
- `npm run test` — vitest (mapgen, réglages, état, bans, historique, top du mois, taquets spéciaux, parse IRC)
```

Cocher les quatre cases de la section « 15. Taquets spéciaux » de `PLAN.md` et la ligne 15 d'« Avancement ».

```bash
git add CLAUDE.md PLAN.md src/config.ts src/main.ts src/themes/draw.ts src/themes/apply.ts src/themes/types.ts src/scenes/fx.ts src/scenes/specials.ts src/scenes/Game.ts scripts/verify-streamer.mjs
git commit -m "feat: taquets spéciaux (bille bonus, gravité lunaire, téléportation, ralenti, points ×2, pluie d'or, séisme)"
```
