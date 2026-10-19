# Éléments mobiles, couloir du bas, bacs qui défilent, taquets à valeur, billes d'animation — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter au pachinko des taquets à valeur, des barres bumpers et des hélices longues, des éléments
mobiles, un couloir mobile au-dessus des bacs, une bande de bacs qui défile et des billes d'animation pendant l'attente.

**Architecture:** La génération reste pure dans `src/mapgen.ts` : un champ `move` optionnel sur les bumpers,
barres et hélices, contrôlé comme une capsule balayée par les règles existantes. `Game` déplace les corps
cinématiques à chaque sous-pas (`setPosition(…, true)`). Deux nouveaux modules de scène possédés par `Game`
comme `Specials` : `scenes/bins.ts` (carrousel des valeurs) et `scenes/attract.ts` (billes factices).

**Tech Stack:** Vite + TypeScript, Phaser 3.90 + Matter intégré, vitest, Playwright (`npm run verify`).

**Spec:** `docs/superpowers/specs/2026-10-19-mobiles-couloir-bacs-taquets-design.md`

## Global Constraints
- Phaser 3.90, aucune nouvelle dépendance. Aucun backend.
- Code et identifiants en anglais, textes affichés et commentaires en français.
- `src/mapgen.ts` n'importe jamais Phaser ; tout tirage de carte passe par `Rng`, jamais `Math.random()`.
- Valeurs de gameplay centralisées dans `src/config.ts`.
- Toute nouvelle règle de génération est couverte par `mapgen.test.ts`.
- Les scènes n'utilisent que des clés de textures fixes (`peg5`, `bar`…), jamais un thème ; un élément re-skinné garde sa hitbox.
- Pas d'allocation dans `update()` ni dans les handlers de collision (hors événements rares : défilement toutes les 30 s, éclatement des billes d'animation).
- 60 fps à `?debug=1&bots=150`.
- Une étape du PLAN = une branche courte depuis `main` à jour, `npm run test` et `npm run verify` verts, `gh pr create --fill`, CI verte, `gh pr merge --squash --delete-branch`.
- `npm run verify` exige `npm run dev` lancé dans un autre terminal.
- Commits terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
1. **Changement de thème ou nouvelle carte pendant un glissement des bacs ou avec des billes d'animation en jeu** : aucune erreur JS, aucun objet détruit encore animé (test : Task 24.2, section 7 de `verify`).
2. **Pause pendant l'attente** : bacs, mobiles et billes d'animation figés, aucun saut à la reprise (test : Task 23.2, section 7 de `verify`).
3. **`?binScroll=45` (valeur hors du menu)** : la liste du menu l'affiche, et ouvrir/fermer les réglages ne l'enregistre pas ni ne la remplace par 30 (test : Task 23.2).
4. **Plafond `maxBalls=1` pendant l'attente avec des billes d'animation** : le premier viewer peut quand même jouer, le classement ne compte que lui (test : Task 24.2).
5. **Bacs qui défilent puis bille qui tombe dans un bac pendant le glissement** : elle paie la nouvelle valeur affichée à l'arrivée du glissement, jamais un jackpot au bord (test : Task 23.1 `binShifts` + Task 23.2 `verify`).

## Fichiers

| Fichier | Responsabilité | Étapes |
|---|---|---|
| `src/config.ts` | Nouvelles constantes | 19–24 |
| `src/mapgen.ts` (+ test) | `Peg.value`, `Bar`, hélices longues, `Move`, couloir, `binShifts` | 19–23 |
| `src/settings.ts` (+ test) | `lane`, `binScroll`, `attract` | 22–24 |
| `src/themes/{types,apply,draw}.ts` | Clés `peg5`, `peg30`, `peg50`, `bar`, `spinnerLong`, table `PEG_TEX` | 19–20 |
| `src/scenes/Game.ts` | Construction et physique des nouveaux éléments, mobiles, billes factices | 19–24 |
| `src/scenes/fx.ts` | `peg(…, points)`, pulse des barres, `pop()` | 19, 20, 24 |
| `src/scenes/specials.ts` | Candidats à 1 point, pluie d'or qui restaure chaque texture | 19 |
| `src/scenes/bins.ts` (nouveau) | Carrousel des valeurs des bacs | 23 |
| `src/scenes/attract.ts` (nouveau) | Billes d'animation | 24 |
| `src/ui/menu.ts` | Trois réglages | 22–24 |
| `scripts/verify-streamer.mjs` | Section 7 (attente animée) | 23–24 |
| `PLAN.md` | Cases à cocher des étapes 19–24 | toutes |

---

## Task 0 : Intégrer la spec et le plan

La branche `docs/spec-mobiles-couloir-bacs` contient déjà la spec, ce plan et les étapes 19–24 de `PLAN.md`.

- [ ] **Step 1 : Pousser et ouvrir la PR**

```bash
git push -u origin docs/spec-mobiles-couloir-bacs
gh pr create --fill
gh pr checks --watch
gh pr merge --squash --delete-branch
git checkout main && git pull --ff-only
```

---

## Étape 19 — Taquets à valeur

Branche : `git checkout main && git pull --ff-only && git checkout -b feat/taquets-a-valeur`

### Task 19.1 : Valeurs des taquets dans la génération

**Files:**
- Modify: `src/config.ts` (section « Points »)
- Modify: `src/mapgen.ts` (`Peg`, `Builder.peg`, `symetrique`, `generateMap`, nouvelle fonction `pegValues`)
- Test: `src/mapgen.test.ts`

**Interfaces:**
- Produces: `type PegValue = 1 | 5 | 10 | 30 | 50` ; `interface Peg { x: number; y: number; value: PegValue }` (le champ `golden` disparaît) ; constantes `PEG_VALUES`, `PEG_SHARE`, `RARE_PEG_SPACING`.

Note : `Game.ts` utilise encore `p.golden` jusqu'à la Task 19.2. `npm run test` (vitest, sans vérification de types) passe ; `npm run build` ne repasse qu'à la fin de 19.2.

- [ ] **Step 1 : Constantes**

Dans `src/config.ts`, remplacer :

```ts
export const PTS_PEG = 1;
export const PTS_PEG_GOLDEN = 10;
```

par :

```ts
export const PTS_PEG_GOLDEN = 10; // pluie d'or : valeur minimale de tout taquet
export const PEG_VALUES = [1, 5, 10, 30, 50] as const;
export const PEG_SHARE = { 5: 0.07, 10: 0.03, 30: 0.01 } as const; // part des taquets par palier ; un seul 50 par carte
export const RARE_PEG_SPACING = 200; // px minimum entre deux taquets à 30 ou 50
```

- [ ] **Step 2 : Tests qui échouent**

Dans `src/mapgen.test.ts` :
1. Remplacer partout `golden: false` par `value: 1` (5 occurrences dans `validateMap`).
2. Compléter l'import de config : `import { SPAWN_ZONE, BIN_H, BIN_CLEAR, RAMP_THICK, PEG_SHARE, RARE_PEG_SPACING } from './config';`
3. Dans le test « symétrique : chaque élément a son miroir », remplacer la ligne des taquets par :

```ts
      for (const p of m.pegs)
        expect(m.pegs.some((q) => near(q.x, mx(p.x)) && near(q.y, p.y) && q.value === p.value), `seed ${seed} taquet`).toBe(true);
```

4. Ajouter à la fin du fichier :

```ts
describe('taquets à valeur', () => {
  const count = (m: MapData, v: number) => m.pegs.filter((p) => p.value === v).length;

  it('exactement un taquet à 50, paliers 5 / 10 / 30 en nombres fixes', () => {
    for (const pattern of PATTERNS) {
      for (let seed = 0; seed < 100; seed++) {
        const m = generateMap(seed, pattern), n = m.pegs.length, at = `${pattern} ${seed}`;
        expect(count(m, 50), at).toBe(1);
        expect(count(m, 30), at).toBeGreaterThanOrEqual(1);
        expect(count(m, 30), at).toBeLessThanOrEqual(Math.max(1, Math.round(n * PEG_SHARE[30])) + 1);
        for (const v of [5, 10] as const)
          expect(Math.abs(count(m, v) - Math.round(n * PEG_SHARE[v])), `${at} palier ${v}`).toBeLessThanOrEqual(1);
        expect(count(m, 1), at).toBeGreaterThan(count(m, 5));
      }
    }
  });

  it('taquets à 30 et 50 espacés d\'au moins RARE_PEG_SPACING', () => {
    for (const pattern of PATTERNS) {
      for (let seed = 0; seed < 100; seed++) {
        const rare = generateMap(seed, pattern).pegs.filter((p) => p.value >= 30);
        for (const p of rare)
          for (const q of rare)
            if (p !== q) expect(Math.hypot(p.x - q.x, p.y - q.y), `${pattern} ${seed}`).toBeGreaterThanOrEqual(RARE_PEG_SPACING);
      }
    }
  });

  it('symétrique : le 50 est sur l\'axe central', () => {
    for (let seed = 0; seed < 100; seed++) {
      const fifty = generateMap(seed, 'symetrique').pegs.find((p) => p.value === 50)!;
      expect(Math.abs(fifty.x - (b.left + b.right) / 2), `seed ${seed}`).toBeLessThan(0.5);
    }
  });
});
```

- [ ] **Step 3 : Vérifier l'échec**

Run: `npx vitest run src/mapgen.test.ts`
Expected: FAIL (« taquets à valeur » : `count(m, 50)` vaut 0).

- [ ] **Step 4 : Implémentation**

Dans `src/mapgen.ts` :

Import de config : ajouter `PEG_VALUES, PEG_SHARE, RARE_PEG_SPACING`.

Remplacer `export interface Peg { x: number; y: number; golden: boolean }` par :

```ts
export type PegValue = (typeof PEG_VALUES)[number];
export interface Peg { x: number; y: number; value: PegValue } // valeur tirée après la pose (pegValues)
```

Dans `Builder`, remplacer la méthode `peg` par :

```ts
  peg(x: number, y: number) { return this.place([{ kind: 'peg', x, y, value: 1 }]); }
```

Dans `symetrique`, remplacer `g.sym({ kind: 'peg', x: px, y: py, golden: rng.chance(0.03) })` par `g.sym({ kind: 'peg', x: px, y: py, value: 1 })`.

Ajouter avant `const GENERATORS` :

```ts
/** Valeurs tirées après la pose, en nombres fixes : un seul 50 par carte, taquets à 30 et 50 espacés.
 *  En symétrique, on tire des « unités » (taquet de l'axe ou paire miroir) : les valeurs restent en miroir. */
function pegValues(g: Builder, symmetric: boolean) {
  const { m, rng } = g;
  const near = (a: number, c: number) => Math.abs(a - c) < 0.5;
  const mx = (x: number) => g.b.left + g.b.right - x;
  const units: Peg[][] = symmetric
    ? m.pegs.filter((p) => p.x < g.cx + 0.5).flatMap((p) => {
      if (near(p.x, g.cx)) return [[p]];
      const q = m.pegs.find((o) => near(o.x, mx(p.x)) && near(o.y, p.y));
      return q ? [[p, q]] : [];
    })
    : m.pegs.map((p) => [p]);
  // axe vide (bumper central, trous) : un taquet posé sur l'axe pour porter le 50
  for (let tries = 0; symmetric && !units.some((u) => u.length === 1) && tries < 60; tries++)
    if (g.place([{ kind: 'peg', x: g.cx, y: rng.range(g.playTop, g.playBottom), value: 1 }])) units.push([m.pegs[m.pegs.length - 1]]);
  for (let i = units.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [units[i], units[j]] = [units[j], units[i]];
  }
  const rare: Peg[] = [];
  const spaced = (u: Peg[]) => u.every((p) =>
    [...rare, ...u].every((q) => q === p || Math.hypot(p.x - q.x, p.y - q.y) >= RARE_PEG_SPACING));
  const take = (value: PegValue, count: number, ok: (u: Peg[]) => boolean) => {
    for (let i = 0, n = 0; i < units.length && n < count; i++) {
      const u = units[i];
      if (u[0].value !== 1 || !ok(u)) continue;
      for (const p of u) p.value = value;
      n += u.length;
      if (value >= 30) rare.push(...u);
    }
  };
  const n = m.pegs.length;
  take(50, 1, (u) => u.length === 1);
  take(30, Math.max(1, Math.round(n * PEG_SHARE[30])), spaced);
  take(10, Math.round(n * PEG_SHARE[10]), () => true);
  take(5, Math.round(n * PEG_SHARE[5]), () => true);
}
```

Dans `generateMap`, après `GENERATORS[p](g);`, ajouter `pegValues(g, p === 'symetrique');`.

- [ ] **Step 5 : Vérifier**

Run: `npx vitest run src/mapgen.test.ts`
Expected: PASS (dont les 5 × 1000 seeds valides).

- [ ] **Step 6 : Commit**

```bash
git add src/config.ts src/mapgen.ts src/mapgen.test.ts
git commit -m "feat: taquets à valeur dans la génération (1, 5, 10, 30, un seul 50)"
```

### Task 19.2 : Rendu, points et pluie d'or

**Files:**
- Modify: `src/themes/types.ts:21`, `src/themes/apply.ts` (SIZES, DEFAULTS, nouvelle `PEG_TEX`), `src/themes/draw.ts`
- Modify: `src/scenes/Game.ts` (imports, `El`, `PegRt`, `buildMap` taquets, `onCollision`)
- Modify: `src/scenes/fx.ts` (`peg`)
- Modify: `src/scenes/specials.ts` (`light`, `endGold`)

**Interfaces:**
- Consumes: `Peg.value`, `PegValue` (Task 19.1).
- Produces: `PEG_TEX: Record<PegValue, string>` exporté par `src/themes/apply.ts` ; `PegRt` gagne `value: PegValue` ; `Juice.peg(p: Pulse, x: number, y: number, points: number)`.

- [ ] **Step 1 : Textures**

`src/themes/types.ts` : `export type ElementKey = 'peg' | 'peg5' | 'pegGolden' | 'peg30' | 'peg50' | 'pegSpecial' | 'bumper' | 'spinner' | 'ramp' | 'background';`

`src/themes/draw.ts`, après `drawPegGolden` :

```ts
/** Taquet à 5 : chrome. */
export const drawPegChrome: DrawFn = (ctx, w, _h, p) => {
  const r = w / 2;
  const g = ctx.createRadialGradient(r * 0.7, r * 0.6, r * 0.1, r, r, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, p.bumperRing);
  g.addColorStop(1, '#3a3f48');
  ctx.fillStyle = g;
  disc(ctx, r, r, r * 0.95);
};

/** Taquet à 30 : rouge laqué cerclé d'or. */
export const drawPegRed: DrawFn = (ctx, w, _h, p) => {
  const r = w / 2;
  ctx.fillStyle = p.accent;
  disc(ctx, r, r, r * 0.98);
  const g = ctx.createRadialGradient(r * 0.7, r * 0.6, r * 0.05, r, r, r * 0.8);
  g.addColorStop(0, '#ffd0d0');
  g.addColorStop(0.35, p.bumperCore);
  g.addColorStop(1, '#3a0008');
  ctx.fillStyle = g;
  disc(ctx, r, r, r * 0.8);
};

/** Taquet à 50 : blanc éclatant (le gros halo fait le reste). */
export const drawPegBright: DrawFn = (ctx, w) => {
  const r = w / 2;
  const g = ctx.createRadialGradient(r * 0.7, r * 0.6, 0, r, r, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.6, '#fff8e0');
  g.addColorStop(0.9, '#ffe9a8');
  g.addColorStop(1, '#ffffff');
  ctx.fillStyle = g;
  disc(ctx, r, r, r * 0.98);
};
```

`src/themes/apply.ts` : ajouter dans `SIZES` `peg5: square(PEG_R), peg30: square(PEG_R), peg50: square(PEG_R),`, dans `DEFAULTS` `peg5: D.drawPegChrome, peg30: D.drawPegRed, peg50: D.drawPegBright,`, puis après `DEFAULTS` :

```ts
/** Texture de chaque palier de taquet (le 10 garde l'ancienne clé du taquet doré). */
export const PEG_TEX: Record<PegValue, string> = { 1: 'peg', 5: 'peg5', 10: 'pegGolden', 30: 'peg30', 50: 'peg50' };
```

avec `import type { PegValue } from '../mapgen';`.

- [ ] **Step 2 : Game**

Dans `src/scenes/Game.ts` :
- import config : retirer `PTS_PEG`, garder `PTS_PEG_GOLDEN` ;
- `import { applyTheme, PEG_TEX } from '../themes/apply';` et `import { generateMap, PATTERNS, type MapData, type PatternId, type PegValue } from '../mapgen';` ;
- dans `interface El`, supprimer `golden?: boolean;` ;
- remplacer `PegRt` :

```ts
/** Taquet à moins de 10 points : repeint par la pluie d'or ; ceux à 1 point sont candidats aux taquets spéciaux. */
export interface PegRt { x: number; y: number; bodyId: number; img: Phaser.GameObjects.Image; value: PegValue }
```

- remplacer la boucle des taquets de `buildMap` :

```ts
    for (const p of map.pegs) {
      const body = this.staticBody(this.matter.add.circle(p.x, p.y, PEG_R, { isStatic: true, label: 'peg' }));
      if (p.value >= 10)
        this.halo(p.x, p.y, PEG_R * (p.value === 50 ? 9 : 5), p.value === 10 ? pal.pegGolden : p.value === 30 ? pal.bumperCore : pal.text);
      const img = this.track(this.add.image(p.x, p.y, PEG_TEX[p.value]).setDisplaySize(PEG_R * 2, PEG_R * 2));
      if (p.value < 10) this.pegs.push({ x: p.x, y: p.y, bodyId: body.id, img, value: p.value });
      this.els.set(body.id, { kind: 'peg', points: p.value, pulse: { kind: 'peg', v: 0, img, size: PEG_R * 2 } });
    }
```

- dans `onCollision`, remplacer les lignes depuis `const gold = …` jusqu'à `if (el.kind === 'peg') this.fx.peg(…)` par :

```ts
      const base = el.kind === 'peg' && this.specials.gold ? Math.max(PTS_PEG_GOLDEN, el.points) : el.points;
      const pts = this.score(ball, base, x, y);
      this.fx.popup(x, y, pts);
      if (el.kind === 'peg') this.fx.peg(el.pulse, x, y, pts);
```

- [ ] **Step 3 : Juice**

Dans `src/scenes/fx.ts`, remplacer `peg(...)` :

```ts
  /** Étincelles proportionnelles aux points : dorées à partir de 10. */
  peg(p: Pulse, x: number, y: number, points: number) {
    this.pulse(p);
    if (points >= 10) this.golden.explode(points >= 50 ? 28 : points >= 30 ? 18 : 10, x, y);
    else this.sparks.explode(points >= 5 ? 7 : 4, x, y);
  }
```

- [ ] **Step 4 : Taquets spéciaux**

Dans `src/scenes/specials.ts` : `import { PEG_TEX } from '../themes/apply';`. Dans `light()`, remplacer les deux lignes qui testent `g.pegs.length` et tirent `peg` par :

```ts
    const pool = g.pegs.filter((p) => p.value === 1); // tirage rare (secondes) : allocation acceptée
    if (!id || !pool.length || !this.mark || !this.halo) return;
    const peg = pool[Math.floor(Math.random() * pool.length)];
```

Dans `endGold()` :

```ts
    for (const p of this.game.pegs) p.img.setTexture(PEG_TEX[p.value]).setDisplaySize(PEG_R * 2, PEG_R * 2);
```

- [ ] **Step 5 : Vérifier**

Run: `npm run build && npm run test`
Expected: build sans erreur de type, tests verts.

Avec `npm run dev`, ouvrir `/?debug=1&bots=150` : taquets chrome, dorés, rouges et un blanc à gros halo visibles, pop-ups `+5`/`+30`/`+50`, compteur ≥ 60 fps. Touche T : chaque thème affiche les paliers sans erreur console.
Run: `npm run verify`
Expected: tout OK.

- [ ] **Step 6 : Commit**

```bash
git add src/themes src/scenes
git commit -m "feat: taquets à 5, 10, 30 et 50 points (textures, halos, pluie d'or)"
```

### Task 19.3 : PLAN et PR

- [ ] Cocher l'étape 19 dans `PLAN.md` (détail + avancement), commit `docs: PLAN, étape 19 cochée`.
- [ ] `git push -u origin feat/taquets-a-valeur && gh pr create --fill && gh pr checks --watch && gh pr merge --squash --delete-branch && git checkout main && git pull --ff-only`

---

## Étape 20 — Barres bumpers et hélices longues

Branche : `git checkout -b feat/barres-helices-longues`

### Task 20.1 : Génération

**Files:**
- Modify: `src/config.ts`, `src/mapgen.ts`
- Test: `src/mapgen.test.ts`

**Interfaces:**
- Produces: `interface Bar { x: number; y: number; length: number; angle: number }` ; `MapData.bars: Bar[]` ; `Builder.bumperSpec(x, y): Spec`, `Builder.spinnerRadius(): number`, `Builder.spinnerSpeed(radius?: number): number` ; constantes `BAR_THICK`, `BAR_LEN_MIN`, `BAR_LEN_MAX`, `BAR_SHARE`, `SPINNER_R_LONG`, `SPINNER_LONG_SHARE`, `SPINNER_LONG_SPEED`.

- [ ] **Step 1 : Constantes** (`src/config.ts`, section Plateau, après `RAMP_THICK`)

```ts
export const BAR_THICK = 14; // barre bumper
export const BAR_LEN_MIN = 90;
export const BAR_LEN_MAX = 160;
export const BAR_SHARE = 1 / 3; // part des bumpers posés en barre
export const SPINNER_R_LONG = 75; // hélice longue
export const SPINNER_LONG_SHARE = 1 / 3;
export const SPINNER_LONG_SPEED = 0.7; // une hélice longue tourne moins vite
```

- [ ] **Step 2 : Tests qui échouent**

Dans `src/mapgen.test.ts` :
- `empty()` : ajouter `bars: [],` ;
- import config : ajouter `SPINNER_R_LONG` ;
- dans `validateMap`, ajouter :

```ts
  it('détecte un taquet trop proche d\'une barre bumper', () => {
    const m = empty();
    m.bars.push({ x: 500, y: midY, length: 140, angle: 0.3 });
    m.pegs.push({ x: 500, y: midY + 25, value: 1 });
    expect(validateMap(m).join()).toMatch(/écart/);
  });
```

- dans le test miroir symétrique, ajouter :

```ts
      for (const r of m.bars) expect(m.bars.some((q) => near(q.x, mx(r.x)) && near(q.y, r.y) && near(q.angle, -r.angle))).toBe(true);
```

- dans `describe('generateMap')`, ajouter :

```ts
  it('des barres bumpers et des hélices longues sur l\'ensemble des cartes', () => {
    const maps = Array.from({ length: 200 }, (_, s) => generateMap(s));
    expect(maps.some((m) => m.bars.length > 0)).toBe(true);
    expect(maps.some((m) => m.spinners.some((s) => s.radius === SPINNER_R_LONG))).toBe(true);
  });
```

- [ ] **Step 3 : Vérifier l'échec**

Run: `npx vitest run src/mapgen.test.ts`
Expected: FAIL (`m.bars` undefined).

- [ ] **Step 4 : Implémentation** (`src/mapgen.ts`)

Import config : ajouter `BAR_THICK, BAR_LEN_MIN, BAR_LEN_MAX, BAR_SHARE, SPINNER_R_LONG, SPINNER_LONG_SHARE, SPINNER_LONG_SPEED`.

Types :

```ts
export interface Bar { x: number; y: number; length: number; angle: number } // barre bumper : centre, angle en rad
```

et `bars: Bar[];` dans `MapData` (après `bumpers`).

Remplacer `rampShape` par :

```ts
const segment = (x: number, y: number, length: number, angle: number, r: number, name: string): Shape => {
  const dx = (Math.cos(angle) * length) / 2, dy = (Math.sin(angle) * length) / 2;
  return { x1: x - dx, y1: y - dy, x2: x + dx, y2: y + dy, r, name };
};
const rampShape = (p: Ramp) => segment(p.x, p.y, p.length, p.angle, RAMP_THICK / 2, 'rampe');
const barShape = (p: Bar) => segment(p.x, p.y, p.length, p.angle, BAR_THICK / 2, 'barre');
```

`shapesOf` : ajouter `...m.bars.map(barShape),`.
`Spec` : ajouter `| ({ kind: 'bar' } & Bar)`.
`shapeOf` : ajouter la branche `: s.kind === 'bar' ? barShape(s)` avant `: rampShape(s)`.
`place` : `else if (kind === 'bar') this.m.bars.push(e as Bar);` avant le `else` des rampes.
`mirror` : `if (s.kind === 'bar') return { ...s, x, angle: -s.angle };`.

Dans `Builder`, remplacer `spinner(...)` et `spinnerSpeed()` par :

```ts
  spinner(x: number, y: number, radius = this.spinnerRadius()) {
    return this.place([{ kind: 'spinner', x, y, radius, speed: this.spinnerSpeed(radius) }]);
  }

  spinnerRadius() { return this.rng.chance(SPINNER_LONG_SHARE) ? SPINNER_R_LONG : SPINNER_R; }

  spinnerSpeed(radius = SPINNER_R) {
    return this.rng.pick([-1, 1]) * SPINNER_SPEED * this.rng.range(0.7, 1.3) * (radius > SPINNER_R ? SPINNER_LONG_SPEED : 1);
  }

  /** Bumper rond ou, une fois sur trois, barre bumper. */
  bumperSpec(x: number, y: number): Spec {
    return this.rng.chance(BAR_SHARE)
      ? { kind: 'bar', x, y, length: this.rng.range(BAR_LEN_MIN, BAR_LEN_MAX), angle: this.rng.range(-0.6, 0.6) }
      : { kind: 'bumper', x, y, radius: BUMPER_R };
  }
```

Motifs :
- `classique` et `trous` : remplacer `g.bumper(h.x, h.y)` par `g.place([g.bumperSpec(h.x, h.y)])`.
- `symetrique` : remplacer les deux lignes des trous par :

```ts
    if (rng.chance(0.6)) g.sym(g.bumperSpec(h.x, h.y));
    else {
      const radius = g.spinnerRadius();
      g.sym({ kind: 'spinner', x: h.x, y: h.y, radius, speed: g.spinnerSpeed(radius) });
    }
```

- `entonnoirs` : remplacer `if (ok) g.spinner(fx, yb + SPINNER_R + MIN_GAP + 12);` par :

```ts
      const radius = g.spinnerRadius();
      if (ok) g.spinner(fx, yb + radius + MIN_GAP + 12, radius);
```

et le repli par `if (!g.m.spinners.length) g.spinner(g.cx, g.playTop + H * 0.4, SPINNER_R);`.
- `generateMap` : `bars: [],` dans l'objet `m`.

- [ ] **Step 5 : Vérifier**

Run: `npx vitest run src/mapgen.test.ts`
Expected: PASS.

- [ ] **Step 6 : Commit**

```bash
git add src/config.ts src/mapgen.ts src/mapgen.test.ts
git commit -m "feat: barres bumpers et hélices longues dans la génération"
```

### Task 20.2 : Physique et rendu

**Files:**
- Modify: `src/themes/{types,apply,draw}.ts`, `src/scenes/Game.ts`, `src/scenes/fx.ts`

**Interfaces:**
- Consumes: `MapData.bars`, `Spinner.radius` (Task 20.1).
- Produces: `El.half?: number` (demi-longueur d'une barre) ; `Pulse.h?: number` (hauteur d'affichage au repos) ; `Game.bounce(ball, bumper, half = 0)` ; texture `bar`, `spinnerLong`.

- [ ] **Step 1 : Textures**

`types.ts` : ajouter `'bar' | 'spinnerLong'` à `ElementKey`.

`draw.ts` : `import { WALL, SPINNER_R, SPINNER_R_LONG } from '../config';` puis remplacer `drawSpinner` par :

```ts
/** Croix chrome à moyeu rouge laqué (le canvas couvre tout le rayon de balayage).
 *  `k` affine bras et moyeu d'une hélice longue : même épaisseur à l'écran qu'une hélice normale. */
const cross = (k: number): DrawFn => (ctx, w, h, p) => {
  const c = w / 2, arm = w * 0.11 * k;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.5, p.spinner);
  g.addColorStop(1, '#5b6270');
  ctx.fillStyle = g;
  for (const a of [0, Math.PI / 2]) {
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.roundRect(-c, -arm / 2, w, arm, arm / 2);
    ctx.fill();
    ctx.restore();
  }
  const hub = ctx.createRadialGradient(c * 0.92, c * 0.9, 1, c, c, w * 0.12 * k);
  hub.addColorStop(0, '#ff8a8a');
  hub.addColorStop(0.5, '#c8102e');
  hub.addColorStop(1, '#4a0010');
  ctx.fillStyle = hub;
  disc(ctx, c, c, w * 0.12 * k);
};
export const drawSpinner = cross(1);
export const drawSpinnerLong = cross(SPINNER_R / SPINNER_R_LONG);

/** Barre bumper : gaine chrome, cœur rouge laqué (étirée à la longueur de chaque barre). */
export const drawBar: DrawFn = (ctx, w, h, p) => {
  const ring = ctx.createLinearGradient(0, 0, 0, h);
  ring.addColorStop(0, '#ffffff');
  ring.addColorStop(0.45, p.bumperRing);
  ring.addColorStop(1, '#4b515c');
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = p.bumperCore;
  ctx.beginPath();
  ctx.roundRect(h * 0.3, h * 0.3, w - h * 0.6, h * 0.4, h * 0.2);
  ctx.fill();
};
```

`apply.ts` : import config `BAR_THICK, SPINNER_R_LONG` ; `SIZES` : `spinnerLong: square(SPINNER_R_LONG), bar: [256, BAR_THICK * TEX_SCALE],` ; `DEFAULTS` : `spinnerLong: D.drawSpinnerLong, bar: D.drawBar,`. Dans la boucle de `applyTheme`, remplacer `const src = sources[key] ?? DEFAULTS[key];` par :

```ts
    // hélice longue : reprend l'hélice du thème s'il en dessine une (étoile de mer de Plage)
    const src = sources[key] ?? (key === 'spinnerLong' ? sources.spinner : null) ?? DEFAULTS[key];
```

- [ ] **Step 2 : Pulse des barres** (`src/scenes/fx.ts`)

Dans `Pulse`, ajouter `h?: number; // hauteur d'affichage au repos (barre), sinon carré`. Dans `update`, remplacer la ligne `if (grow) p.img.setDisplaySize(...)` par :

```ts
        if (grow) p.img.setDisplaySize(p.size * (1 + grow * v), (p.h ?? p.size) * (1 + grow * v));
```

Dans `bumper(...)`, remplacer les lignes `r.size = …` et `r.img.setPosition(…)` par :

```ts
    // barre : petite onde au point de contact ; bumper rond : onde centrée sur l'ampoule
    r.size = (p.h ? p.h * 4 : p.size ?? 52) * 2.6;
    r.img.setPosition(p.h ? x : p.img!.x, p.h ? y : p.img!.y).setTint(this.colors.core).setVisible(true);
```

- [ ] **Step 3 : Game**

Import config : ajouter `BAR_THICK, SPINNER_R`. Dans `El`, ajouter `half?: number; // barre bumper : demi-longueur (rebond)`.

Dans `buildMap`, après la boucle des bumpers :

```ts
    for (const r of map.bars) {
      const body = this.staticBody(this.matter.add.rectangle(r.x, r.y, r.length, BAR_THICK,
        { isStatic: true, angle: r.angle, chamfer: { radius: BAR_THICK / 2 }, label: 'bumper' }));
      const img = this.track(this.add.image(r.x, r.y, 'bar').setDisplaySize(r.length, BAR_THICK).setRotation(r.angle));
      const glow = this.track(this.add.image(r.x, r.y, 'fx-glow').setDisplaySize(r.length * 1.1, BAR_THICK * 3)
        .setRotation(r.angle).setBlendMode('ADD').setTint(hex(pal.bumperCore)).setAlpha(0));
      this.els.set(body.id, {
        kind: 'bumper', points: PTS_BUMPER, half: r.length / 2,
        pulse: { kind: 'bumper', v: 0, img, size: r.length, h: BAR_THICK, glow },
      });
    }
```

Dans la boucle des hélices, texture selon la taille :

```ts
      const img = this.track(this.add.image(s.x, s.y, s.radius > SPINNER_R ? 'spinnerLong' : 'spinner')
        .setDisplaySize(s.radius * 2, s.radius * 2));
```

Dans `onCollision` : `if (el.kind === 'bumper') this.bounce(ball, other, el.half);`. Remplacer `bounce` :

```ts
  /** Bumper : vitesse imposée le long de la normale, biaisée vers le haut. Barre : la normale part du
   *  point de la barre le plus proche de la bille (half = 0 : bumper rond). */
  private bounce(ball: Ball, bumper: Body, half = 0) {
    const c = Math.cos(bumper.angle), s = Math.sin(bumper.angle);
    const { x, y } = ball.body.position;
    const t = Phaser.Math.Clamp((x - bumper.position.x) * c + (y - bumper.position.y) * s, -half, half);
    const cx = bumper.position.x + t * c, cy = bumper.position.y + t * s;
    let nx = x - cx;
    let ny = y - cy - 0.6 * Math.hypot(nx, y - cy);
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    this.matter.body.setVelocity(ball.body, { x: nx * BUMPER_SPEED, y: ny * BUMPER_SPEED });
  }
```

- [ ] **Step 4 : Vérifier**

Run: `npm run build && npm run test`
Expected: vert.
À la main (`npm run dev`, `/?debug=1&bots=150`, recharger jusqu'à voir une barre ; environ une carte sur deux en a une) : la bille rebondit franchement perpendiculairement à la barre, la barre s'allume, les hélices longues ont des bras fins et tournent plus lentement ; touche T jusqu'à Plage : l'hélice longue est une étoile de mer. 60 fps.
Run: `npm run verify`
Expected: tout OK.

- [ ] **Step 5 : Commit**

```bash
git add src/themes src/scenes
git commit -m "feat: barres bumpers (rebond perpendiculaire) et hélices longues à l'écran"
```

### Task 20.3 : PLAN et PR

- [ ] Cocher l'étape 20 dans `PLAN.md`, commit, puis `git push -u origin feat/barres-helices-longues && gh pr create --fill && gh pr checks --watch && gh pr merge --squash --delete-branch && git checkout main && git pull --ff-only`.

---

## Étape 21 — Éléments mobiles

Branche : `git checkout -b feat/elements-mobiles`

### Task 21.1 : Génération

**Files:**
- Modify: `src/config.ts`, `src/mapgen.ts`
- Test: `src/mapgen.test.ts`

**Interfaces:**
- Produces: `interface Move { x2: number; y2: number; periodMs: number; phase: number }` ; `move?: Move` sur `Bumper`, `Spinner`, `Bar` ; constantes `MOVERS_MIN`, `MOVERS_MAX`, `MOVE_LEN_MIN`, `MOVE_LEN_MAX`, `MOVE_PERIOD_MIN`, `MOVE_PERIOD_MAX`.

- [ ] **Step 1 : Constantes** (`src/config.ts`, après les hélices longues)

```ts
export const MOVERS_MIN = 2; // éléments en aller-retour par carte (hors couloir)
export const MOVERS_MAX = 4;
export const MOVE_LEN_MIN = 150; // px
export const MOVE_LEN_MAX = 350;
export const MOVE_PERIOD_MIN = 4000; // ms par aller-retour
export const MOVE_PERIOD_MAX = 8000;
```

- [ ] **Step 2 : Tests qui échouent**

Dans `src/mapgen.test.ts` : import `type Move` depuis `./mapgen` et `MOVERS_MIN, MOVERS_MAX, MOVE_LEN_MIN, MOVE_LEN_MAX` depuis `./config`.

Dans `validateMap` :

```ts
  it('détecte un taquet sur le trajet d\'un bumper mobile (capsule balayée)', () => {
    const m = empty();
    m.bumpers.push({ x: 400, y: midY, radius: 26, move: { x2: 700, y2: midY, periodMs: 5000, phase: 0 } });
    m.pegs.push({ x: 550, y: midY + 40, value: 1 });
    expect(validateMap(m).join()).toMatch(/écart/);
  });

  it('détecte une barre mobile qui ne glisse pas dans son axe', () => {
    const m = empty();
    m.bars.push({ x: 400, y: midY, length: 120, angle: 0, move: { x2: 400, y2: midY + 150, periodMs: 5000, phase: 0 } });
    expect(validateMap(m).join()).toMatch(/axe/);
  });
```

Dans le test miroir symétrique, ajouter avant les boucles :

```ts
      const sameMove = (p: { move?: Move }, q: { move?: Move }) => !p.move ? !q.move
        : !!q.move && near(q.move.x2, mx(p.move.x2)) && near(q.move.y2, p.move.y2)
          && q.move.phase === p.move.phase && q.move.periodMs === p.move.periodMs;
```

et ajouter `&& sameMove(p, q)` aux conditions des bumpers, des hélices et des barres (`sameMove(r, q)` pour les barres).

Dans `describe('generateMap')` :

```ts
  const moving = (m: MapData) => [...m.bumpers, ...m.bars, ...m.spinners].filter((e) => e.move);

  it('2 à 4 éléments mobiles par carte, trajets et périodes bornés', () => {
    for (const pattern of PATTERNS) {
      for (let seed = 0; seed < 100; seed++) {
        const movers = moving(generateMap(seed, pattern)), at = `${pattern} ${seed}`;
        expect(movers.length, at).toBeGreaterThanOrEqual(MOVERS_MIN);
        expect(movers.length, at).toBeLessThanOrEqual(MOVERS_MAX);
        for (const e of movers) {
          const len = Math.hypot(e.move!.x2 - e.x, e.move!.y2 - e.y);
          expect(len, at).toBeGreaterThanOrEqual(MOVE_LEN_MIN - 0.5);
          expect(len, at).toBeLessThanOrEqual(MOVE_LEN_MAX + 0.5);
        }
      }
    }
  });
```

- [ ] **Step 3 : Vérifier l'échec**

Run: `npx vitest run src/mapgen.test.ts`
Expected: FAIL (aucun mobile, erreurs `validateMap` non détectées).

- [ ] **Step 4 : Implémentation** (`src/mapgen.ts`)

Import config : ajouter les 6 constantes.

Types :

```ts
export interface Move { x2: number; y2: number; periodMs: number; phase: number } // aller-retour (x,y) ↔ (x2,y2), phase ∈ [0, 1)
export interface Spinner { x: number; y: number; radius: number; speed: number; move?: Move } // speed en rad/step, signe = sens
export interface Bumper { x: number; y: number; radius: number; move?: Move }
export interface Bar { x: number; y: number; length: number; angle: number; move?: Move } // mobile : glisse dans son axe
```

Formes : ajouter après `circle` :

```ts
/** Cercle immobile, ou capsule balayée sur tout son trajet s'il est mobile. */
const sweep = (p: { x: number; y: number; move?: Move }, r: number, name: string): Shape =>
  ({ x1: p.x, y1: p.y, x2: p.move?.x2 ?? p.x, y2: p.move?.y2 ?? p.y, r, name });
```

et remplacer `barShape` par :

```ts
/** Barre : segment. Mobile, elle glisse dans son axe : la zone balayée reste un segment, du bout le plus
 *  en arrière de la position de départ au bout le plus en avant de la position d'arrivée. */
const barShape = (p: Bar): Shape => {
  const s = segment(p.x, p.y, p.length, p.angle, BAR_THICK / 2, 'barre');
  if (!p.move) return s;
  const e = segment(p.move.x2, p.move.y2, p.length, p.angle, BAR_THICK / 2, 'barre');
  const c = Math.cos(p.angle), sn = Math.sin(p.angle);
  const pts = [[s.x1, s.y1], [s.x2, s.y2], [e.x1, e.y1], [e.x2, e.y2]]
    .sort((a, b) => a[0] * c + a[1] * sn - (b[0] * c + b[1] * sn));
  return { x1: pts[0][0], y1: pts[0][1], x2: pts[3][0], y2: pts[3][1], r: BAR_THICK / 2, name: 'barre' };
};
```

Dans `shapesOf` et `shapeOf`, remplacer `circle(p.x, p.y, p.radius, 'bumper')` / `'tourniquet'` par `sweep(p, p.radius, 'bumper')` / `sweep(p, p.radius, 'tourniquet')` (et `s` au lieu de `p` dans `shapeOf`).

Dans `validateMap`, après la règle des rampes plates :

```ts
  for (const r of m.bars)
    if (r.move && Math.abs(Math.sin(Math.atan2(r.move.y2 - r.y, r.move.x2 - r.x) - r.angle)) > 1e-6)
      errors.push('barre mobile hors de son axe');
```

Dans `Builder` : remplacer `mirror` par :

```ts
  /** Image miroir par rapport à l'axe vertical central (rampes, barres, tourniquets et trajets inversés). */
  mirror(s: Spec): Spec {
    const mx = (x: number) => this.b.left + this.b.right - x;
    if (s.kind === 'ramp') return { ...s, x: mx(s.x), angle: -s.angle };
    if (s.kind === 'peg') return { ...s, x: mx(s.x) };
    const mv = s.move && { move: { ...s.move, x2: mx(s.move.x2) } };
    if (s.kind === 'spinner') return { ...s, ...mv, x: mx(s.x), speed: -s.speed };
    if (s.kind === 'bar') return { ...s, ...mv, x: mx(s.x), angle: -s.angle };
    return { ...s, ...mv, x: mx(s.x) };
  }
```

Taquets différés : dans `Builder`, ajouter le champ et les méthodes, et la première ligne de `place` :

```ts
  private deferred: Spec[][] | null = null; // taquets du motif, posés après les mobiles

  place(specs: Spec[]): boolean {
    if (this.deferred && specs.every((s) => s.kind === 'peg')) {
      this.deferred.push(specs);
      return true;
    }
    // … corps actuel inchangé …
  }

  /** Le motif pose sa structure maintenant ; ses taquets attendent `flushPegs` (les mobiles passent avant eux). */
  deferPegs() { this.deferred = []; }

  flushPegs() {
    const specs = this.deferred ?? [];
    this.deferred = null;
    for (const s of specs) this.place(s);
  }
```

Ajouter avant `pegValues` :

```ts
/** Bumpers, barres et hélices en aller-retour, posés après la structure du motif et avant ses taquets :
 *  tout leur trajet est interdit aux taquets. En symétrique, paires miroir hors de l'axe. */
function movers(g: Builder, symmetric: boolean) {
  const { rng, b } = g;
  const want = symmetric ? 2 * rng.int(MOVERS_MIN / 2, MOVERS_MAX / 2) : rng.int(MOVERS_MIN, MOVERS_MAX);
  for (let tries = 0, placed = 0; placed < want && tries < 300; tries++) {
    const len = rng.range(MOVE_LEN_MIN, MOVE_LEN_MAX);
    const a = rng.chance(0.75) ? rng.range(-0.3, 0.3) : rng.range(-1.2, 1.2); // surtout horizontal
    const x = rng.range(b.left, symmetric ? g.cx : b.right), y = rng.range(g.playTop, g.playBottom);
    const move: Move = {
      x2: x + Math.cos(a) * len, y2: y + Math.sin(a) * len,
      periodMs: rng.range(MOVE_PERIOD_MIN, MOVE_PERIOD_MAX), phase: rng.next(),
    };
    const kind = rng.pick(['bumper', 'bar', 'spinner'] as const);
    const radius = kind === 'spinner' ? g.spinnerRadius() : BUMPER_R;
    const spec: Spec = kind === 'bumper' ? { kind, x, y, radius, move }
      : kind === 'bar' ? { kind, x, y, length: rng.range(BAR_LEN_MIN, BAR_LEN_MAX), angle: a, move } // glisse dans son axe
        : { kind, x, y, radius, speed: g.spinnerSpeed(radius), move };
    if (symmetric ? g.place([spec, g.mirror(spec)]) : g.place([spec])) placed += symmetric ? 2 : 1;
  }
}
```

Dans `generateMap`, remplacer les lignes depuis `const g = new Builder(...)` jusqu'au `return m` par :

```ts
  const g = new Builder(m, b, rng);
  const symmetric = p === 'symetrique';
  wallGuides(g, symmetric);
  g.deferPegs();
  GENERATORS[p](g);
  movers(g, symmetric);
  g.flushPegs();
  pegValues(g, symmetric);
  return m;
```

- [ ] **Step 5 : Vérifier**

Run: `npx vitest run src/mapgen.test.ts`
Expected: PASS, y compris les 5 × 1000 seeds valides et les tests existants « diagonale et entonnoirs » et « trous ». Si le test des 2 mobiles minimum échoue sur quelques seeds, augmenter `tries` (300 → 600) avant toute autre piste.

- [ ] **Step 6 : Commit**

```bash
git add src/config.ts src/mapgen.ts src/mapgen.test.ts
git commit -m "feat: éléments mobiles dans la génération (trajet interdit aux taquets)"
```

### Task 21.2 : Mouvement dans le jeu

**Files:**
- Modify: `src/scenes/Game.ts`

**Interfaces:**
- Consumes: `move?: Move` (Task 21.1).
- Produces: `Game.movers: MoverRt[]` (privé, lu par `verify`) avec `body` ; `halo()` renvoie son image.

- [ ] **Step 1 : Implémentation**

Import : `type Move` depuis `../mapgen`. Après `SpinnerRt` :

```ts
/** Élément en aller-retour : corps et images déplacés ensemble. `pos` réutilisé : aucune allocation par pas. */
interface MoverRt { body: Body; imgs: Phaser.GameObjects.Image[]; x: number; y: number; move: Move; t: number; pos: { x: number; y: number } }
```

Champ : `private movers: MoverRt[] = [];` ; dans `clearMap` : `this.movers = [];`.

`halo` renvoie l'image :

```ts
  private halo(x: number, y: number, size: number, color: string) {
    const img = this.track(this.add.image(x, y, 'fx-glow').setDisplaySize(size, size).setBlendMode('ADD').setTint(hex(color)));
    this.fx.addHalo(img);
    return img;
  }
```

Méthodes :

```ts
  private mover(body: Body, e: { x: number; y: number; move?: Move }, imgs: Phaser.GameObjects.Image[]) {
    if (e.move) this.movers.push({ body, imgs, x: e.x, y: e.y, move: e.move, t: 0, pos: { x: e.x, y: e.y } });
  }

  /** Aller-retour ralenti aux deux bouts. `carry` : setPosition met à jour la vitesse, la bille reçoit l'élan. */
  private stepMovers(dt: number, carry = true) {
    for (const m of this.movers) {
      m.t += dt;
      const k = (1 - Math.cos(2 * Math.PI * (m.t / m.move.periodMs + m.move.phase))) / 2;
      m.pos.x = m.x + (m.move.x2 - m.x) * k;
      m.pos.y = m.y + (m.move.y2 - m.y) * k;
      this.matter.body.setPosition(m.body, m.pos, carry);
    }
  }

  private syncMovers() {
    for (const m of this.movers) for (const img of m.imgs) img.setPosition(m.body.position.x, m.body.position.y);
  }
```

Dans `buildMap` :
- bumpers : remplacer `this.halo(b.x, b.y, …)` par `const halo = this.halo(b.x, b.y, b.radius * 3, pal.bumperCore);`, et à la fin du corps de boucle `this.mover(body, b, [halo, img, glow]);` ;
- barres : à la fin du corps de boucle `this.mover(body, r, [img, glow]);` ;
- hélices : à la fin du corps de boucle `this.mover(body, s, [img]);` ;
- tout à la fin de `buildMap` : `this.stepMovers(0, false); // position de départ selon la phase, sans élan` puis `this.syncMovers();`.

Dans `update`, dans la boucle des sous-pas, après la ligne des tourniquets : `this.stepMovers(dt);`. Après la boucle, à côté de `s.img.setRotation(...)` : `this.syncMovers();`.

- [ ] **Step 2 : Vérifier**

Run: `npm run build && npm run test`
Expected: vert.
À la main (`/?debug=1&bots=150`) : 2 à 4 éléments font des allers-retours ralentis aux bouts, halo et lueur suivent, une hélice mobile tourne en se déplaçant, aucune bille ne traverse un mobile, une bille posée sur une barre mobile est entraînée. Échap → Partie → Pause : tout se fige ; reprise sans saut. ≥ 60 fps.
Run: `npm run verify`
Expected: tout OK.

- [ ] **Step 3 : Commit**

```bash
git add src/scenes/Game.ts
git commit -m "feat: bumpers, barres et hélices en aller-retour"
```

### Task 21.3 : PLAN et PR

- [ ] Cocher l'étape 21 dans `PLAN.md`, commit, puis `git push -u origin feat/elements-mobiles && gh pr create --fill && gh pr checks --watch && gh pr merge --squash --delete-branch && git checkout main && git pull --ff-only`.

---

## Étape 22 — Couloir du bas

Branche : `git checkout -b feat/couloir-du-bas`

### Task 22.1 : Réglage `lane`

**Files:**
- Modify: `src/settings.ts`
- Test: `src/settings.test.ts`

**Interfaces:**
- Produces: `Settings.lane: boolean` (défaut `true`, URL `lane=0`).

- [ ] **Step 1 : Test qui échoue** (fin de `src/settings.test.ts`)

```ts
describe('couloir du bas', () => {
  it('activé par défaut', () => expect(DEFAULT_SETTINGS.lane).toBe(true));
  it('lane=0 dans l\'URL', () => expect(mergeSettings(DEFAULT_SETTINGS, {}, '?lane=0').lane).toBe(false));
  it('valeur sauvegardée invalide → défaut', () => expect(mergeSettings(DEFAULT_SETTINGS, { lane: 'non' }, '').lane).toBe(true));
  it('formPatch : case décochée', () => expect(formPatch({ ...DEFAULT_SETTINGS, lane: false }, DEFAULT_SETTINGS)).toEqual({ lane: false }));
});
```

- [ ] **Step 2 :** Run `npx vitest run src/settings.test.ts` → FAIL.

- [ ] **Step 3 : Implémentation** (`src/settings.ts`)
- `Settings` : `lane: boolean; // couloir mobile au-dessus des bacs (carte suivante)` ;
- `DEFAULT_SETTINGS` : `lane: true,` ;
- `sanitizeSettings` : `lane: bool(r.lane, base.lane),` ;
- `mergeSettings` : `for (const k of ['shake', 'autoNext', 'lane'] as const)`.

- [ ] **Step 4 :** Run `npx vitest run src/settings.test.ts` → PASS.

- [ ] **Step 5 :** `git add src/settings.ts src/settings.test.ts && git commit -m "feat: réglage du couloir du bas"`

### Task 22.2 : Couloir dans la génération

**Files:**
- Modify: `src/config.ts`, `src/mapgen.ts`
- Test: `src/mapgen.test.ts`

**Interfaces:**
- Produces: `generateMap(seed: number, pattern?: PatternId, b?: Bounds, opts?: { lane?: boolean }): MapData` ; `MapData.laneTop?: number` (haut de l'élément du couloir ; absent = pas de couloir). Les éléments du couloir sont dans `bumpers` / `bars` / `spinners`, avec `move`, et `y > laneTop`.

- [ ] **Step 1 : Constantes** (`src/config.ts`, après les mobiles)

```ts
export const LANE_BAR_LEN = 140; // barre du couloir du bas
export const LANE_PERIOD_MS = 9000; // aller-retour du couloir, plus lent que les mobiles du plateau
```

- [ ] **Step 2 : Tests qui échouent** (`src/mapgen.test.ts`, import config `MIN_GAP, LANE_PERIOD_MS`)

Remplacer `moving` (Task 21.1) par une version qui exclut le couloir, et ajouter le bloc :

```ts
  const inLane = (m: MapData, e: { y: number }) => m.laneTop !== undefined && e.y > m.laneTop;
  const moving = (m: MapData) => [...m.bumpers, ...m.bars, ...m.spinners].filter((e) => e.move && !inLane(m, e));
```

```ts
describe('couloir du bas', () => {
  const lane = (m: MapData) => [...m.bumpers, ...m.bars, ...m.spinners].filter((e) => m.laneTop !== undefined && e.y > m.laneTop);

  it('présent par défaut, absent avec lane: false', () => {
    for (const pattern of PATTERNS) {
      for (let seed = 0; seed < 50; seed++) {
        expect(generateMap(seed, pattern).laneTop, `${pattern} ${seed}`).toBeDefined();
        const off = generateMap(seed, pattern, b, { lane: false });
        expect(off.laneTop).toBeUndefined();
        expect(validateMap(off), `${pattern} ${seed} sans couloir`).toEqual([]);
      }
    }
  });

  it('un élément (deux en miroir en symétrique), horizontal, mobile, lent', () => {
    for (const pattern of PATTERNS) {
      for (let seed = 0; seed < 100; seed++) {
        const m = generateMap(seed, pattern), els = lane(m), at = `${pattern} ${seed}`;
        expect(els.length, at).toBe(pattern === 'symetrique' ? 2 : 1);
        for (const e of els) {
          expect(e.move, at).toBeDefined();
          expect(e.move!.y2, at).toBe(e.y);
          expect(e.move!.periodMs, at).toBe(LANE_PERIOD_MS);
        }
      }
    }
  });

  it('passage d\'au moins MIN_GAP aux murs et entre les deux éléments au centre', () => {
    for (const pattern of PATTERNS) {
      for (let seed = 0; seed < 100; seed++) {
        const m = generateMap(seed, pattern), at = `${pattern} ${seed}`;
        for (const e of lane(m)) {
          const half = 'length' in e ? e.length / 2 : e.radius;
          const minX = Math.min(e.x, e.move!.x2) - half, maxX = Math.max(e.x, e.move!.x2) + half;
          expect(minX - b.left, at).toBeGreaterThanOrEqual(MIN_GAP);
          expect(pattern === 'symetrique' ? (b.left + b.right) / 2 - MIN_GAP / 2 - maxX : b.right - maxX, at)
            .toBeGreaterThanOrEqual(pattern === 'symetrique' ? 0 : MIN_GAP);
        }
      }
    }
  });

  it('aucun taquet ni autre élément dans la bande', () => {
    for (const pattern of PATTERNS) {
      for (let seed = 0; seed < 100; seed++) {
        const m = generateMap(seed, pattern);
        for (const p of m.pegs) expect(p.y, `${pattern} ${seed}`).toBeLessThan(m.laneTop!);
        for (const r of m.ramps) expect(r.y, `${pattern} ${seed}`).toBeLessThan(m.laneTop!);
      }
    }
  });
});
```

Note : la ligne symétrique vérifie `maxX ≤ cx − MIN_GAP/2`, donc un écart ≥ `MIN_GAP` entre les deux éléments miroir.

- [ ] **Step 3 :** Run `npx vitest run src/mapgen.test.ts` → FAIL.

- [ ] **Step 4 : Implémentation** (`src/mapgen.ts`)

Import config : `LANE_BAR_LEN, LANE_PERIOD_MS`. `MapData` : `laneTop?: number; // haut de l'élément du couloir du bas, absent = pas de couloir`.

`Builder.playBottom` :

```ts
  get playBottom() { return this.m.laneTop !== undefined ? this.m.laneTop - MIN_GAP : this.m.binTop - BIN_CLEAR; }
```

Ajouter avant `wallGuides` :

```ts
/** Couloir du bas : un élément en aller-retour de mur à mur juste au-dessus de la bande des bacs (deux en
 *  miroir en symétrique, un par moitié). La zone de jeu remonte au-dessus de lui. */
function lane(g: Builder, symmetric: boolean) {
  const { rng, b } = g;
  const kind = rng.pick(['bumper', 'bar', 'spinner'] as const);
  const r = kind === 'bumper' ? BUMPER_R : kind === 'bar' ? BAR_THICK / 2 : g.spinnerRadius(); // demi-hauteur
  const half = kind === 'bar' ? LANE_BAR_LEN / 2 : r; // demi-largeur
  const y = g.m.binTop - BIN_CLEAR - r - 1;
  const x = b.left + MIN_GAP + half + 1;
  const x2 = (symmetric ? g.cx - MIN_GAP / 2 : b.right - MIN_GAP) - half - 1;
  const move: Move = { x2, y2: y, periodMs: LANE_PERIOD_MS, phase: rng.next() };
  const spec: Spec = kind === 'bumper' ? { kind, x, y, radius: r, move }
    : kind === 'bar' ? { kind, x, y, length: LANE_BAR_LEN, angle: 0, move }
      : { kind, x, y, radius: r, speed: g.spinnerSpeed(r), move };
  if (symmetric ? g.place([spec, g.mirror(spec)]) : g.place([spec])) g.m.laneTop = y - r;
}
```

`generateMap` :

```ts
export function generateMap(seed: number, pattern?: PatternId, b: Bounds = BOARD_BOUNDS, opts: { lane?: boolean } = {}): MapData {
```

et, juste après `const symmetric = …`, avant `wallGuides` : `if (opts.lane ?? true) lane(g, symmetric);`.

- [ ] **Step 5 :** Run `npx vitest run src/mapgen.test.ts` → PASS (dont 5 × 1000 seeds valides, avec couloir).

- [ ] **Step 6 :** `git add src/config.ts src/mapgen.ts src/mapgen.test.ts && git commit -m "feat: couloir mobile au-dessus des bacs dans la génération"`

### Task 22.3 : Jeu et menu

**Files:**
- Modify: `src/scenes/Game.ts` (`loadGame`), `src/ui/menu.ts` (`settingsHtml`, `save`, texte d'aide)

- [ ] **Step 1 : Implémentation**

`Game.loadGame` : `this.buildMap(generateMap(seed, pattern, BOARD_BOUNDS, { lane: params.lane }));` avec `BOARD_BOUNDS` importé de `../mapgen`. Le couloir est construit par le code des bumpers/barres/hélices mobiles, rien d'autre à faire.

`menu.ts`, après la case `autoNext` :

```ts
      <label class="menu-check"><input name="lane" type="checkbox"${params.lane ? ' checked' : ''}> Couloir mobile au-dessus des bacs</label>
```

`save()` : `lane: field('lane').checked,`. Texte d'aide : « Durée, thème, couloir et enchaînement prennent effet à la partie suivante ».

- [ ] **Step 2 : Vérifier**

Run: `npm run build && npm run test` → vert.
À la main : `/?debug=1&bots=150&pattern=classique` puis `&pattern=symetrique` : l'élément du couloir balaie toute la largeur (deux en miroir en symétrique), aucune bille coincée contre un mur ; décocher « Couloir mobile » puis « Nouvelle partie maintenant » : plus de couloir, taquets jusqu'en bas. 60 fps.
Run: `npm run verify` → tout OK.

- [ ] **Step 3 :** `git add src/scenes/Game.ts src/ui/menu.ts && git commit -m "feat: couloir du bas en jeu, réglable dans le menu"`

### Task 22.4 : PLAN et PR

- [ ] Cocher l'étape 22 dans `PLAN.md`, commit, puis `git push -u origin feat/couloir-du-bas && gh pr create --fill && gh pr checks --watch && gh pr merge --squash --delete-branch && git checkout main && git pull --ff-only`.

---

## Étape 23 — Bacs qui défilent

Branche : `git checkout -b feat/bacs-qui-defilent`

### Task 23.1 : `binShifts` et réglage `binScroll`

**Files:**
- Modify: `src/mapgen.ts`, `src/settings.ts`, `src/config.ts`
- Test: `src/mapgen.test.ts`, `src/settings.test.ts`

**Interfaces:**
- Produces: `binShifts(points: readonly number[]): number[]` (décalages `k` tels que `nouveau[i] = ancien[(i - k + n) % n]` ne met pas le jackpot en 0 ou n−1 ; contient 0) ; `Settings.binScroll: number` (s, 0 = désactivé, 0–300, défaut 30) ; `BIN_SCROLL_MS`.

- [ ] **Step 1 : Tests qui échouent**

`src/mapgen.test.ts` (import `binShifts`) :

```ts
describe('binShifts', () => {
  it('exemple', () => expect(binShifts([10, 500, 25, 50, 10])).toEqual([0, 1, 2]));

  it('ne met jamais le jackpot au bord, contient 0 et au moins un vrai décalage', () => {
    for (let seed = 0; seed < 300; seed++) {
      const pts = generateMap(seed).bins.map((x) => x.points), n = pts.length;
      const ks = binShifts(pts);
      expect(ks).toContain(0);
      expect(ks.length, `seed ${seed}`).toBeGreaterThan(1);
      for (const k of ks) {
        const rotated = pts.map((_, i) => pts[(i - k + n) % n]);
        expect(rotated[0], `seed ${seed} k ${k}`).not.toBe(500);
        expect(rotated[n - 1], `seed ${seed} k ${k}`).not.toBe(500);
      }
    }
  });
});
```

`src/settings.test.ts` :

```ts
describe('bacs qui défilent', () => {
  it('toutes les 30 s par défaut', () => expect(DEFAULT_SETTINGS.binScroll).toBe(30));
  it('borné 0–300, 0 = désactivé', () => {
    expect(mergeSettings(DEFAULT_SETTINGS, {}, '?binScroll=999').binScroll).toBe(300);
    expect(mergeSettings(DEFAULT_SETTINGS, {}, '?binScroll=-1').binScroll).toBe(0);
    expect(mergeSettings(DEFAULT_SETTINGS, {}, '?binScroll=45').binScroll).toBe(45);
  });
  it('valeur sauvegardée invalide → défaut', () => expect(mergeSettings(DEFAULT_SETTINGS, { binScroll: 'x' }, '').binScroll).toBe(30));
  it('formPatch : liste du menu', () => expect(formPatch({ ...DEFAULT_SETTINGS, binScroll: '60' }, DEFAULT_SETTINGS)).toEqual({ binScroll: 60 }));
});
```

- [ ] **Step 2 :** Run `npm run test` → FAIL.

- [ ] **Step 3 : Implémentation**

`src/mapgen.ts`, après `makeBins` :

```ts
/** Décalages k de la bande des valeurs (valeur i → bac (i + k) % n) qui gardent le jackpot loin des bords. Contient 0. */
export function binShifts(points: readonly number[]): number[] {
  const n = points.length, j = points.indexOf(Math.max(...points));
  return Array.from({ length: n }, (_, k) => k).filter((k) => (j + k) % n !== 0 && (j + k) % n !== n - 1);
}
```

`src/settings.ts` : `binScroll: number; // secondes entre deux défilements des bacs, 0 = désactivé` ; défaut `binScroll: 30,` ; `binScroll: num(r.binScroll, base.binScroll, 0, 300),` ; ajouter `'binScroll'` à la liste des clés lues telles quelles dans `mergeSettings`.

`src/config.ts`, section Partie : `export const BIN_SCROLL_MS = 800; // glissement de la bande des bacs`.

- [ ] **Step 4 :** Run `npm run test` → PASS.

- [ ] **Step 5 :** `git add src && git commit -m "feat: décalages autorisés des bacs et réglage du défilement"`

### Task 23.2 : Carrousel des bacs

**Files:**
- Create: `src/scenes/bins.ts`
- Modify: `src/scenes/Game.ts` (bloc des bacs de `buildMap`, champ `bins`, `update`), `src/ui/menu.ts`, `scripts/verify-streamer.mjs`

**Interfaces:**
- Consumes: `binShifts`, `params.binScroll`, `BIN_SCROLL_MS`.
- Produces: `class Bins { attach(faces: BinFace[], slots: BinSlot[], left: number, width: number); get points(): number[]; update(dt: number) }` ; `Game.bins` (public, lu par `verify`).

- [ ] **Step 1 : `src/scenes/bins.ts`**

```ts
// Bacs qui défilent : la bande des valeurs tourne d'un nombre de cases tiré au hasard ; séparateurs et
// capteurs restent fixes. Animé à la main en temps de scène : figé en pause, comme la physique.
import Phaser from 'phaser';
import { params, BIN_SCROLL_MS } from '../config';
import { binShifts } from '../mapgen';
import type { Game } from './Game';
import type { Pulse } from './fx';

/** Fond, liseré et chiffre d'un bac, déplacés ensemble. */
export interface BinFace { obj: Phaser.GameObjects.Container; points: number }
/** Capteur d'un bac (l'`El` de Game) : sa valeur change au défilement. */
export interface BinSlot { points: number; pulse: Pulse }

export class Bins {
  private faces: BinFace[] = [];
  private slots: BinSlot[] = []; // de gauche à droite
  private slotOf: number[] = []; // face → bac occupé
  private from: number[] = []; // face → bac au début du glissement
  private left = 0;
  private width = 0;
  private wait = 0; // ms depuis le dernier défilement
  private anim = -1; // ms écoulées du glissement, -1 = au repos
  private delta = 0; // glissement en bacs, signé (chemin le plus court)

  constructor(private game: Game) {}

  /** Nouvelle carte : faces créées par Game.buildMap, détruites avec la carte. */
  attach(faces: BinFace[], slots: BinSlot[], left: number, width: number) {
    this.faces = faces;
    this.slots = slots;
    this.left = left;
    this.width = width;
    this.slotOf = faces.map((_, i) => i);
    this.from = [...this.slotOf];
    this.wait = 0;
    this.anim = -1;
  }

  /** Valeurs des bacs de gauche à droite (vérification navigateur). */
  get points() { return this.slots.map((s) => s.points); }

  update(dt: number) {
    if (this.anim >= 0) this.slide(dt);
    if (this.game.state.phase !== 'playing' || params.binScroll <= 0 || !this.faces.length) return; // attente comprise
    if ((this.wait += dt) < params.binScroll * 1000) return;
    this.wait = 0;
    this.shift();
  }

  private shift() {
    const n = this.faces.length;
    const ks = binShifts(this.points).filter((k) => k !== 0);
    const k = ks[Math.floor(Math.random() * ks.length)];
    this.delta = k > n / 2 ? k - n : k;
    for (let i = 0; i < n; i++) {
      this.from[i] = this.slotOf[i];
      this.slotOf[i] = (this.slotOf[i] + k) % n;
      this.slots[this.slotOf[i]].points = this.faces[i].points; // payé tout de suite, pendant le glissement
    }
    for (const s of this.slots) this.game.fx.pulse(s.pulse);
    this.anim = 0;
  }

  /** Une face qui sort d'un côté s'efface et réapparaît de l'autre (pas de masque). */
  private slide(dt: number) {
    const n = this.faces.length;
    this.anim = Math.min(BIN_SCROLL_MS, this.anim + dt);
    const e = Phaser.Math.Easing.Sine.InOut(this.anim / BIN_SCROLL_MS);
    for (let i = 0; i < n; i++) {
      const p = ((((this.from[i] + this.delta * e + 0.5) % n) + n) % n) - 0.5; // bac, dans [-0.5, n - 0.5)
      const out = Math.max(0, -p, p - (n - 1));
      this.faces[i].obj.setX(this.left + p * this.width).setAlpha(1 - 2 * out);
    }
    if (this.anim >= BIN_SCROLL_MS) this.anim = -1;
  }
}
```

- [ ] **Step 2 : Game**

Import : `import { Bins, type BinFace } from './bins';`. Champ : `readonly bins = new Bins(this);`. Dans `update`, après `this.specials.update(delta);` : `this.bins.update(delta);`.

Dans `buildMap`, remplacer tout le bloc depuis `const g = this.track(this.add.graphics());` jusqu'à `g.fillStyle(hex(pal.frame), 1).fillRect(WALL, map.binTop - 2, …);` inclus par :

```ts
    const binH = HEIGHT - map.binTop;
    // faces d'abord (fond, liseré, chiffre) : elles glissent sous les flashs et les séparateurs
    const faces: BinFace[] = map.bins.map((bin, i) => {
      const face = this.track(this.add.container(bin.x, map.binTop));
      face.add(this.add.rectangle(0, 0, bin.width, binH, hex(pal.bins[i % pal.bins.length])).setOrigin(0));
      if (bin.points >= BIG_WIN) {
        // gros bacs : liseré rouge laqué + or
        face.add(this.add.graphics()
          .lineStyle(4, hex(pal.bumperCore), 1).strokeRect(5, 5, bin.width - 10, binH - 10)
          .lineStyle(1, hex(pal.accent), 1).strokeRect(9, 9, bin.width - 18, binH - 18));
      }
      face.add(this.add.text(bin.width / 2, binH * 0.55, String(bin.points), {
        fontFamily: this.theme.font.family, fontSize: '30px', color: pal.binHighlight,
      }).setOrigin(0.5));
      return { obj: face, points: bin.points };
    });
    const slots: El[] = map.bins.map((bin, i) => {
      const sensor = this.staticBody(this.matter.add.rectangle(
        bin.x + bin.width / 2, map.binTop + binH / 2 + BALL_R * 2, bin.width - DIVIDER, binH,
        { isStatic: true, isSensor: true, label: 'bin' }));
      const rect = this.track(this.add.rectangle(bin.x, map.binTop, bin.width, binH, hex(pal.binHighlight))
        .setOrigin(0).setBlendMode('ADD').setAlpha(0));
      const el: El = { kind: 'bin', points: bin.points, binX: bin.x + bin.width / 2, pulse: { kind: 'bin', v: 0, rect } };
      this.els.set(sensor.id, el);
      if (i > 0) this.staticBody(this.matter.add.rectangle(bin.x, map.binTop + binH / 2, DIVIDER, binH, { isStatic: true, label: 'wall' }));
      return el;
    });
    const g = this.track(this.add.graphics());
    for (const bin of map.bins.slice(1)) g.fillStyle(hex(pal.frame), 1).fillRect(bin.x - DIVIDER / 2, map.binTop, DIVIDER, binH);
    g.fillStyle(hex(pal.frame), 1).fillRect(WALL, map.binTop - 2, BOARD_W - WALL * 2, 3);
    this.bins.attach(faces, slots, map.bins[0].x, map.bins[0].width);
```

Note : `container.add` retire les enfants de la liste d'affichage de la scène, et détruire le conteneur (`clearMap`) détruit ses enfants.

- [ ] **Step 3 : Menu** (`src/ui/menu.ts`, après la ligne `specialEffects`)

```ts
      <label>Défilement des bacs <select name="binScroll">${[...new Set([0, 30, 60, params.binScroll])].map((s) => // valeur d'URL hors liste : affichée, sinon fermer le menu la remplacerait
        `<option value="${s}"${s === params.binScroll ? ' selected' : ''}>${s === 0 ? 'Désactivé' : s % 60 === 0 ? `Toutes les ${s / 60} min` : `Toutes les ${s} s`}</option>`).join('')}</select></label>
```

`save()` : `binScroll: field('binScroll').value,`.

- [ ] **Step 4 : Vérification navigateur** (`scripts/verify-streamer.mjs`)

Remplacer les deux dernières lignes du fichier (`check('aucune erreur JS', …)` et `await browser.close();`) par :

```js
await page.close();

// 7. Attente animée : bacs qui défilent, figés en pause ; valeur d'URL hors de la liste du menu conservée
page = await open('?debug=1&binScroll=1');
const binPts = () => page.evaluate(`${G}.bins.points.join()`);
const binsBefore = await binPts();
await page.waitForFunction(`${G}.bins.points.join() !== '${binsBefore}'`, null, { timeout: 5000 }).catch(() => {});
const binsAfter = (await binPts()).split(',');
check('bacs : valeurs décalées, jackpot jamais au bord', binsAfter.join() !== binsBefore && binsAfter[0] !== '500' && binsAfter.at(-1) !== '500',
  `${binsBefore} → ${binsAfter.join()}`);
await page.evaluate(`${G}.admin('pause')`);
const still = () => page.evaluate(`JSON.stringify([${G}.bins.points, ${G}.movers.map((m) => [m.body.position.x, m.body.position.y])])`);
const pausedAt = await still();
await page.waitForTimeout(2500);
check('pause : bacs et mobiles figés', (await still()) === pausedAt);
await page.evaluate(`${G}.admin('resume')`);
await page.close();

page = await open('?debug=1&binScroll=45');
await page.keyboard.press('Escape');
await page.click('[data-tab=settings]');
const listed = await page.inputValue('select[name=binScroll]');
await page.keyboard.press('Escape');
check('binScroll=45 : affiché dans la liste, jamais enregistré', listed === '45' && (await saved()).binScroll !== 45, `liste ${listed}`);
await page.close();

check('aucune erreur JS', errors.length === 0, errors.join(' | '));
await browser.close();
```


- [ ] **Step 5 : Vérifier**

Run: `npm run build && npm run test` → vert.
Run: `npm run verify` (dev server lancé) → tout OK, dont les 3 nouvelles vérifications.
À la main : `/?debug=1&binScroll=30` : toutes les 30 s, la bande glisse en ~0,8 s avec un flash, les bacs du bord s'effacent et réapparaissent de l'autre côté, la bande se fige en pause et au podium.

- [ ] **Step 6 :** `git add src scripts && git commit -m "feat: bande des bacs qui défile, réglable dans le menu"`

### Task 23.3 : PLAN et PR

- [ ] Cocher l'étape 23 dans `PLAN.md`, commit, puis `git push -u origin feat/bacs-qui-defilent && gh pr create --fill && gh pr checks --watch && gh pr merge --squash --delete-branch && git checkout main && git pull --ff-only`.

---

## Étape 24 — Billes d'animation

Branche : `git checkout -b feat/billes-animation`

### Task 24.1 : Réglage `attract`

**Files:**
- Modify: `src/settings.ts`, `src/config.ts`
- Test: `src/settings.test.ts`

**Interfaces:**
- Produces: `Settings.attract: boolean` (défaut `true`, URL `attract=0`) ; `ATTRACT_EVERY_MS`, `ATTRACT_MAX`, `ATTRACT_POP_MS`, `ATTRACT_ALPHA`.

- [ ] **Step 1 : Test qui échoue**

```ts
describe('billes d\'animation', () => {
  it('activées par défaut', () => expect(DEFAULT_SETTINGS.attract).toBe(true));
  it('attract=0 dans l\'URL', () => expect(mergeSettings(DEFAULT_SETTINGS, {}, '?attract=0').attract).toBe(false));
  it('valeur sauvegardée invalide → défaut', () => expect(mergeSettings(DEFAULT_SETTINGS, { attract: 1 }, '').attract).toBe(true));
});
```

- [ ] **Step 2 :** Run `npx vitest run src/settings.test.ts` → FAIL.

- [ ] **Step 3 : Implémentation**

`src/settings.ts` : `attract: boolean; // billes d'animation pendant l'attente du premier joueur`, défaut `attract: true,`, `attract: bool(r.attract, base.attract),`, `'attract'` ajouté à la liste booléenne de `mergeSettings`.

`src/config.ts`, section Partie :

```ts
export const ATTRACT_EVERY_MS = 1500; // billes d'animation pendant l'attente
export const ATTRACT_MAX = 6;
export const ATTRACT_POP_MS = 400; // figées puis éclatées à la première vraie bille
export const ATTRACT_ALPHA = 0.7;
```

- [ ] **Step 4 :** Run `npx vitest run src/settings.test.ts` → PASS.

- [ ] **Step 5 :** `git add src && git commit -m "feat: réglage des billes d'animation"`

### Task 24.2 : Billes d'animation en jeu

**Files:**
- Create: `src/scenes/attract.ts`
- Modify: `src/scenes/Game.ts` (`Ball`, `drop`, nouvelles `spawn` / `dropFake`, `ballCount`, `onCollision`, `removeBall` public, `loadGame`, `update`), `src/scenes/fx.ts` (`pop`), `src/ui/menu.ts`, `scripts/verify-streamer.mjs`

**Interfaces:**
- Produces: `Ball.fake?: boolean` ; `Game.dropFake(x: number): void` ; `Game.fakeCount: number` ; `Game.removeBall(ball: Ball)` devient public ; `Juice.pop(x: number, y: number)` ; `class Attract { update(dt: number); clear() }`.

- [ ] **Step 1 : `src/scenes/attract.ts`**

```ts
// Billes d'animation : pendant l'attente du premier joueur, des billes sans joueur animent le plateau.
// Hors GameState (ni classement, ni timer, ni plafond). À la première vraie bille, elles se figent puis éclatent.
import Phaser from 'phaser';
import { params, BOARD_W, WALL, BALL_R, ATTRACT_EVERY_MS, ATTRACT_MAX, ATTRACT_POP_MS } from '../config';
import type { Game } from './Game';

export class Attract {
  private since = 0; // ms depuis la dernière bille lâchée
  private popIn = 0; // > 0 : billes figées, éclatement dans popIn ms

  constructor(private game: Game) {}

  /** Nouvelle carte : les billes ont déjà été retirées par Game.loadGame. */
  clear() { this.since = this.popIn = 0; }

  update(dt: number) {
    const g = this.game;
    if (this.popIn > 0) {
      if ((this.popIn -= dt) > 0) return;
      for (const b of [...g.balls.values()]) { // une fois par partie : allocation acceptée
        if (!b.fake) continue;
        g.fx.pop(b.body.position.x, b.body.position.y);
        g.removeBall(b);
      }
      return;
    }
    if (!g.state.waiting) {
      if (!g.fakeCount) return;
      for (const b of g.balls.values()) if (b.fake) g.matter.body.setStatic(b.body, true);
      this.popIn = ATTRACT_POP_MS;
      return;
    }
    if (!params.attract || g.fakeCount >= ATTRACT_MAX || (this.since += dt) < ATTRACT_EVERY_MS) return;
    this.since = 0;
    g.dropFake(Phaser.Math.Between(WALL + BALL_R * 2, BOARD_W - WALL - BALL_R * 2));
  }
}
```

- [ ] **Step 2 : Juice** (`src/scenes/fx.ts`, après `bin`)

```ts
  /** Bille d'animation qui éclate (fin de l'attente). */
  pop(x: number, y: number) { this.bursts.explode(10, x, y); }
```

- [ ] **Step 3 : Game**

Import config : `ATTRACT_ALPHA` ; `import { Attract } from './attract';`.

`Ball` : ajouter `fake?: boolean; // bille d'animation : hors GameState, sans points`.

Champs : `private attract = new Attract(this);` et `private fakes = 0;`.

Remplacer `drop` par :

```ts
  /** Lâche une bille en x (coordonnée plateau). La bille tombe tout de suite, l'avatar arrive après. */
  private drop(viewer: Viewer, x: number, y = BALL_R + 24): Ball {
    const hasAvatar = this.textures.exists(avatarKey(viewer.id));
    const key = hasAvatar ? avatarKey(viewer.id) : fallbackKey(this, viewer, this.theme.font.family, this.theme.palette.ballRim);
    if (!hasAvatar) this.fetchIdentity(viewer);
    const ball = this.spawn(viewer.id, x, y, key);
    this.fx.label(viewer.name, ball.body.position);
    return ball;
  }

  /** Bille d'animation (attente) : bille du thème, translucide, sans joueur ni étiquette. */
  dropFake(x: number) {
    this.fakes++;
    this.spawn('', x, BALL_R + 24, 'ball', true).img.setAlpha(ATTRACT_ALPHA);
  }

  private spawn(userId: string, x: number, y: number, key: string, fake = false): Ball {
    const bx = Phaser.Math.Clamp(x, WALL + BALL_R + 2, BOARD_W - WALL - BALL_R - 2);
    const body = this.matter.add.circle(bx, y, BALL_R, {
      restitution: 0.5, friction: 0.001, frictionAir: 0.0008, label: 'ball',
    });
    this.matter.body.setVelocity(body, { x: Phaser.Math.FloatBetween(-0.6, 0.6), y: 0 });
    const img = this.add.image(bx, y, key).setDisplaySize(BALL_R * 2, BALL_R * 2);
    const ball: Ball = {
      userId, body, img, done: false, hits: new Map(), anchor: { x: bx, y, t: this.time.now }, lastNudge: 0, fake,
    };
    this.balls.set(body.id, ball);
    return ball;
  }
```

Compteurs :

```ts
  get ballCount() { return this.balls.size - this.fakes; }
  get fakeCount() { return this.fakes; }
```

`onCollision` : remplacer le bloc `if (el.kind === 'bin') { … }` et la suite de la boucle par :

```ts
      if (el.kind === 'bin') {
        ball.done = true; // avant destruction : un 2e événement dans la même frame est ignoré
        if (ball.fake) this.fx.pulse(el.pulse); // bille d'animation : le bac s'allume, sans points
        else {
          const pts = this.score(ball, el.points, x, y);
          this.fx.bin(el.pulse, el.binX ?? x, this.map!.binTop, pts, el.points >= BIG_WIN);
        }
        this.toRemove.push(ball);
        continue;
      }
      if (el.kind === 'bumper') this.bounce(ball, other, el.half);
      else if (el.kind === 'peg' && !ball.fake) this.specials.hit(other.id, ball); // avant le cooldown : le 1er contact compte toujours
      const last = ball.hits.get(other.id) ?? -Infinity;
      if (this.time.now - last < HIT_COOLDOWN_MS) continue;
      ball.hits.set(other.id, this.time.now);
      const base = el.kind === 'peg' && this.specials.gold ? Math.max(PTS_PEG_GOLDEN, el.points) : el.points;
      const pts = ball.fake ? base : this.score(ball, base, x, y);
      if (!ball.fake) this.fx.popup(x, y, pts);
      if (el.kind === 'peg') this.fx.peg(el.pulse, x, y, pts);
      else if (el.kind === 'bumper') this.fx.bumper(el.pulse, x, y);
      else this.fx.spinner(el.pulse, x, y);
```

`removeBall` devient public :

```ts
  /** Seul chemin de fin de bille (bac, anti-blocage, reset, éclatement) : libère toujours le viewer. */
  removeBall(ball: Ball) {
    if (!this.balls.delete(ball.body.id)) return;
    this.matter.world.remove(ball.body);
    ball.img.destroy();
    if (ball.fake) {
      this.fakes--;
      return; // hors GameState
    }
    this.state.ballFinished(ball.userId);
    this.game.events.emit('ballFinished', ball.userId);
  }
```

`loadGame` : après `this.toRemove.length = 0;`, ajouter `this.attract.clear();`. `update` : après `this.bins.update(delta);`, ajouter `this.attract.update(delta);`.

- [ ] **Step 4 : Menu** (`src/ui/menu.ts`, après la case `lane`)

```ts
      <label class="menu-check"><input name="attract" type="checkbox"${params.attract ? ' checked' : ''}> Billes d'animation en attendant un joueur</label>
```

`save()` : `attract: field('attract').checked,`.

- [ ] **Step 5 : Vérification navigateur** (`scripts/verify-streamer.mjs`, juste avant `check('aucune erreur JS', …)`)

```js
// 8. Billes d'animation : hors classement et hors plafond, éclatées à la première vraie bille
page = await open('?debug=1&maxBalls=1');
const fakes = () => page.evaluate(`[...${G}.balls.values()].filter((b) => b.fake).length`);
await page.waitForFunction(`[...${G}.balls.values()].some((b) => b.fake)`, null, { timeout: 5000 }).catch(() => {});
check('attente : billes d\'animation, classement vide, compteur à 0', (await fakes()) > 0
  && (await page.evaluate(`${G}.state.players.size`)) === 0 && (await page.evaluate(`${G}.ballCount`)) === 0
  && (await page.evaluate(`${G}.state.waiting`)));
check('plafond à 1 : le premier joueur joue malgré les billes d\'animation', await page.evaluate(`${G}.requestDrop(${viewer('v9')}, 700)`));
await page.waitForFunction(`![...${G}.balls.values()].some((b) => b.fake)`, null, { timeout: 3000 }).catch(() => {});
check('première bille : billes d\'animation éclatées, un seul joueur', (await fakes()) === 0 && (await page.evaluate(`${G}.state.players.size`)) === 1);
await page.close();

// 8 bis. Changement de thème pendant un défilement des bacs, billes d'animation en jeu : sans erreur
page = await open('?debug=1&binScroll=1');
await page.waitForFunction(`[...${G}.balls.values()].some((b) => b.fake) && ${G}.bins.anim >= 0`, null, { timeout: 10_000 }).catch(() => {});
const themeFrom = await page.evaluate(`${G}.theme.id`);
await page.evaluate(`${G}.nextTheme()`);
await page.waitForFunction(`${G}.theme.id !== '${themeFrom}' && !!${G}.map`);
await page.waitForTimeout(1500);
check('changement de thème pendant un défilement et des billes d\'animation', errors.length === 0, errors.join(' | '));
await page.close();
```

- [ ] **Step 6 : Vérifier**

Run: `npm run build && npm run test` → vert.
Run: `npm run verify` → tout OK.
À la main : `/` sans chaîne : une bille translucide toutes les ~1,5 s, 6 au plus, taquets et bacs qui s'allument sans pop-up ; un clic : les billes d'animation se figent puis éclatent, le timer part, le classement ne montre que le streamer. Décocher « Billes d'animation » : plus de nouvelles billes. `/?debug=1&bots=150` : 60 fps.

- [ ] **Step 7 :** `git add src scripts && git commit -m "feat: billes d'animation pendant l'attente du premier joueur"`

### Task 24.3 : PLAN, README et PR

- [ ] Cocher l'étape 24 dans `PLAN.md`.
- [ ] `CLAUDE.md` : dans « Commandes », la ligne `npm run test` devient « vitest (mapgen dont mobiles, couloir et taquets à valeur, réglages, état, bans, historique, top du mois, taquets spéciaux, parse IRC) » ; dans « Architecture », ajouter après la ligne des taquets spéciaux :
      `- Bacs qui défilent : src/scenes/bins.ts ; billes d'animation (attente) : src/scenes/attract.ts. Possédés par Game comme Specials. Spec : docs/superpowers/specs/2026-10-19-mobiles-couloir-bacs-taquets-design.md.`
- [ ] Commit `docs: PLAN étape 24, CLAUDE.md`.
- [ ] `git push -u origin feat/billes-animation && gh pr create --fill && gh pr checks --watch && gh pr merge --squash --delete-branch && git checkout main && git pull --ff-only`
