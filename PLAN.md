# Plan — Pachinko Twitch (source navigateur OBS)

## Contexte
Jeu de pachinko 2D dans le navigateur, chargé comme source OBS, piloté par les viewers Twitch :
clic sur le stream (extension **Heat**) ou commande tchat `!drop` → une bille tombe depuis le haut
à la position X choisie. Une bille active max par viewer. Parties chronométrées, classement live,
podium top 3 en fin de partie, carte procédurale nouvelle à chaque partie. Doit rester fluide avec
plusieurs dizaines de viewers simultanés et être « juicy » (particules, traînées, pop-ups de score).

Le dossier `C:\Users\com\code\pachinko-twitch` est vide : projet from scratch.

**Specs** : ce document (design général) + `docs/superpowers/specs/2026-10-02-themes-design.md`
(direction artistique et thèmes saisonniers). Lire les deux avant d'implémenter.

## Contraintes globales
- Phaser **3.90** (pas v4), Matter intégré, Vite + TypeScript, vitest. Aucune autre dépendance runtime.
- Aucun backend, aucun token Twitch.
- Code et identifiants en anglais, textes affichés en français.
- Modules purs sans Phaser : `rng.ts`, `mapgen.ts`, `themes/resolve.ts`, `themes/types.ts`, parseur IRC.
- Les scènes ne connaissent que des **clés de textures fixes** (`peg`, `bumper`, …), jamais un thème.
- Polices auto-hébergées en woff2 dans `public/fonts/`, aucune ressource réseau en live hors Twitch/Heat.
- 60 fps stables à 150 billes dans OBS.

## Points d'attention en review
Cas que la spec implique sans les nommer, les plus susceptibles de casser en live :
1. **`?date=` mal formé** (`?date=hier`, `?date=2026-13-40`) → ignoré, date du jour utilisée (test étape 3).
2. **Un thème enfant n'hérite pas de la période de son parent** : la résolution lit les définitions
   brutes, pas les thèmes fusionnés (test étape 3).
3. **Changement de thème entre deux parties** : billes et carte détruites **avant** de supprimer les
   anciennes textures, sinon des objets affichent une texture supprimée (vérif étape 9).
4. **Police pas encore chargée** au moment de dessiner les chiffres des pop-ups → police par défaut
   (vérif étape 8).
5. **Chevauchement d'année et 29 février** (Hiver `12-01 → 02-29`) (tests étapes 3 et 9).

## Avancement
Cocher ici **et** dans le détail de l'étape (section « Étapes d'implémentation ») une fois l'étape
terminée et vérifiée.

- [x] 1. Scaffold Vite + TS + Phaser
- [x] 2. RNG seedé + générateur de carte (pattern Classique) + tests
- [x] 3. Fondations des thèmes (thème de base) + scène Game : plateau, billes, bacs, scoring de base
- [x] 4. Rampes, tourniquets, bumpers + filet anti-blocage
- [x] 5. État de partie + HUD (timer, classement, podium, cycle)
- [x] 6. Tchat IRC + Heat
- [x] 7. Utilisateurs et avatars
- [x] 8. Juice + direction artistique de base (marquee, pop-ups, particules, glow, shake, animations)
- [x] 9. Thèmes saisonniers (Halloween, Hiver, Noël, Sakura, Plage)
- [x] 10. Les 4 autres patterns de génération
- [x] 11. Passe perf et réglages finaux
- [x] 12. Mode streamer : plein écran, menus, modération, historique (spec `docs/superpowers/specs/2026-10-02-streamer-mode-design.md`, plan `docs/superpowers/plans/2026-10-02-streamer-mode.md`)
- [x] 13. Timer à la première bille (spec `docs/superpowers/specs/2026-10-11-timer-top-du-mois-taquets-speciaux-design.md`, plan `docs/superpowers/plans/2026-10-11-timer-top-du-mois-taquets-speciaux.md`)
- [x] 14. Top du mois (même spec, même plan)
- [x] 15. Taquets spéciaux (même spec, même plan)
- [x] 16. Fin de partie nette + lien copiable des réglages
- [x] 17. Réglages enregistrés automatiquement, croix de fermeture, lien OBS sans menu (`menu=0`)
- [x] 18. Chaîne connectée par un bouton, état de la connexion affiché
- [x] 19. Taquets à valeur (1, 5, 10, 30, 50) (spec `docs/superpowers/specs/2026-10-19-mobiles-couloir-bacs-taquets-design.md`, plan `docs/superpowers/plans/2026-10-19-mobiles-couloir-bacs-taquets.md`)
- [x] 20. Barres bumpers et hélices longues (même spec, même plan)
- [ ] 21. Éléments mobiles (même spec, même plan)
- [ ] 22. Couloir du bas (même spec, même plan)
- [ ] 23. Bacs qui défilent (même spec, même plan)
- [ ] 24. Billes d'animation pendant l'attente (même spec, même plan)
- [ ] 25. Réglages en sous-onglets, onglet « À propos », version automatique (même plan)

## Décisions prises
| Sujet | Choix |
|---|---|
| Moteur | **Phaser 3.90** (WebGL) + **Matter.js intégré** |
| Outillage | **Vite + TypeScript**, `vitest` pour les quelques tests purs |
| Entrées | Extension **Heat** (clics) + **tchat IRC** (`!drop`, `!drop 0-100`) |
| Pseudo/avatar | `https://heat-api.j38.net/user/{id}` (renvoie `display_name`, `profile_image_url`, **sans token**) |
| Collisions bille-bille | Oui, nombre de billes plafonné (`maxBalls`, défaut 150) |
| Classement live | Panneau latéral fixe (droite) |
| Sliders | Rampes inclinées **fixes** |
| Cycle | Boucle auto (partie → podium ~15 s → nouvelle carte) + commandes mods `!pachinko start|stop|skip` |
| Format | Source OBS plein écran 1920×1080 : plateau à gauche (~1440 px), panneau à droite (~480 px) |
| Direction artistique | Pachinko japonais **sobre et clinquant** : laque sombre, laiton/chrome, marquee d'ampoules (voir spec thèmes) |
| Thèmes | Modules TS typés + héritage ; sélection auto par date, forçage `?theme=` ; base + Halloween, Hiver, Noël, Sakura, Plage |

## Intégrations Twitch (sans serveur, sans token)
- **Tchat** : WebSocket brut `wss://irc-ws.chat.twitch.tv`, login anonyme `justinfan<random>`,
  `CAP REQ :twitch.tv/tags twitch.tv/commands`, `JOIN #<channel>`. Parse des tags IRCv3
  (`user-id`, `display-name`, `color`, `badges`). ~60 lignes, pas de tmi.js.
  - Le tag `room-id` du `ROOMSTATE` donne l'id numérique de la chaîne → sert à ouvrir Heat.
    Seul paramètre requis : `?channel=<login>`.
  - Répondre au `PING` par `PONG`, reconnexion avec backoff.
- **Heat** : `wss://heat-api.j38.net/channel/{roomId}`. Messages JSON ; un clic contient `id`,
  `x`, `y` normalisés 0–1 sur toute la vidéo (en string → `parseFloat`).
  - Ids : numériques = vrais viewers ; préfixe `U` = connecté mais identité non partagée
    (accepté, nom « Anonyme-xxxx », sans avatar) ; préfixe `A` = déconnecté → ignoré.
  - Mapping : seul `x` compte. `x` dans la zone du plateau (`x < boardWidth/1920`) → position de
    départ ; clic sur le panneau → ignoré.
- **Utilisateurs** : `users.ts` avec cache `Map` + `localStorage` (id → nom, avatar URL).
  Fetch `heat-api.j38.net/user/{id}` seulement si inconnu ; les users du tchat ont déjà le
  `display-name` via les tags. Même `user-id` Twitch sur Heat et tchat → une seule identité.
- **Avatar** : chargé une fois (`crossOrigin = 'anonymous'`, static-cdn.jtvnw.net), dessiné en
  cercle dans une `CanvasTexture` dédiée (clé `avatar-<id>`), puis réutilisé. **Jamais de masque
  par frame.** Fallback : cercle couleur (tag `color` ou hash du nom) + initiale.

## Architecture (fichiers)
```
index.html
src/
  main.ts            config Phaser (1920×1080, Matter, FIT/scale), lecture des params URL
  config.ts          params URL + constantes de gameplay (points, tailles, durées)
  rng.ts             PRNG seedé (mulberry32), helpers pick/range
  mapgen.ts          génération procédurale PURE (seed → liste d'éléments), aucune dépendance Phaser
  mapgen.test.ts     validation sur 1000 seeds
  game/state.ts      joueurs, scores, billes actives par user, timer, phases (playing/podium)
  scenes/Backdrop.ts fond du thème + ambiance animée (scène sous Game : insensible au camera shake)
  scenes/Game.ts     plateau Matter, spawn billes, collisions → score, juice
  scenes/Hud.ts      timer, classement top 10 animé, podium de fin
  themes/            types, resolve (pur), draw (DrawFn), apply (textures), un fichier par thème, index
public/fonts/        polices woff2 auto-hébergées
  twitch/chat.ts     IRC WebSocket + parse tags + commandes
  twitch/chat.test.ts parse IRC
  twitch/heat.ts     WebSocket Heat
  twitch/users.ts    lookup + cache + texture avatar
  debug.ts           ?debug=1 : clic souris = drop, touche B = +N bots, overlay FPS
```
Communication entre modules : un simple `EventEmitter` de Phaser (`game.events`) avec
quelques événements (`drop`, `score`, `ballFinished`, `phase`). Pas de bus maison.

## Éléments du plateau
| Élément | Physique Matter | Points | Juice |
|---|---|---|---|
| **Taquet** | cercle statique | +1 (cooldown 150 ms par paire bille/taquet) ; taquet doré rare +10 | flash blanc + petit scale tween, étincelles |
| **Rampe** (slider) | rectangle statique incliné, friction faible | 0 | léger glow quand une bille glisse (optionnel) |
| **Tourniquet** | corps composé (croix/barre) **kinématique** : `setAngle` + `setAngularVelocity` à chaque step pour transmettre l'élan | +3 | rotation visible, particules au contact |
| **Bumper** | cercle statique, `restitution` haute + impulsion custom le long de la normale (biais vers le haut), vitesse résultante clampée | +5 | pulse scale, anneau d'onde, burst de particules, mini shake |
| **Bacs (bas)** | capteurs `isSensor` séparés par des murets | valeur finale (ex. 10–500, plus haute sur les bords ou aléatoire selon pattern) | gros pop-up, confettis, shake si gros score |

Une bille qui entre dans un bac → points du bac ajoutés, bille détruite, le viewer peut relancer.

## Génération procédurale (`mapgen.ts`)
`generateMap(seed, bounds) → { pegs, ramps, spinners, bumpers, bins, pattern }`, fonction pure.
Seed aléatoire à chaque partie, forçable via `?seed=` (rejouer une carte).

**Patterns** (un tiré au sort par partie, puis éléments spéciaux saupoudrés) :
1. **Classique** : grille de taquets en quinconce, quelques trous et bumpers.
2. **Symétrique** : moitié gauche générée puis miroir sur l'axe central.
3. **Diagonale** : bandes de taquets en diagonale + rampes en zigzag/chevrons.
4. **Trous** : grille dense où l'on creuse des zones vides (cercles/rectangles) ; spinners ou bumpers
   placés au centre des trous.
5. **Entonnoirs** : rampes en V qui concentrent vers des spinners, alternées avec des rangées de taquets.

**Règles de validité** (vérifiées par `mapgen.test.ts`) :
- Distance entre deux éléments ≥ `2.4 × rayon bille` (aucun piège où une bille reste coincée).
- Zone de spawn (≈ 120 px du haut) libre d'obstacles.
- Bandeau au-dessus des bacs libre (dernière rangée à distance fixe des murets).
- Tous les éléments dans les bornes du plateau ; nombre de bacs ≥ 5.

**Filet de sécurité runtime** : bille quasi immobile > 3 s → petite impulsion aléatoire ;
> 8 s → retirée (sans points de bac).

## Gameplay & état
- `state.ts` : `players: Map<userId, {name, color, avatarKey, score}>`, `activeBall: Map<userId, Body>`.
- Drop refusé si le viewer a déjà une bille active ou si `maxBalls` atteint (silencieux côté jeu).
- Score de partie uniquement (remis à zéro à chaque partie). Historique all-time : hors scope.
- Phases : `playing` (timer `?duration=` minutes, défaut 5) → `podium` (~15 s, plus de drops,
  billes restantes retirées à 0:00 : le score est figé) → nouvelle carte → `playing`.
- Commandes tchat :
  - `!drop` → X aléatoire ; `!drop 37` → X à 37 % de la largeur du plateau.
  - `!pachinko start|stop|skip` réservé broadcaster/moderator (tag `badges`).

## Juice & lisibilité
- **Traînée de vitesse** derrière chaque bille (émetteur de particules partagé qui suit, ou petit
  historique de positions dessiné en dégradé), intensité ∝ vitesse.
- **Pop-ups de score** : `BitmapText` en **pool** (≈ 64 objets recyclés), tween montée + fade,
  taille/couleur selon valeur.
- **Particules** : un seul `ParticleEmitter` par type d'effet, `explode()` à la demande.
- **PostFX** : glow sur bumpers et taquets dorés (WebGL), bloom léger optionnel.
- **Camera shake** sur bumper et gros bac (dosé, désactivable via `?shake=0`).
- **Classement** : lignes qui glissent (tween Y) quand les rangs changent, avatar + nom + score.
- **Podium** : top 3 avec avatars, confettis.
- Nom du viewer affiché au-dessus de sa bille à la création (fade après ~1 s) pour qu'il la repère.

## Performance (règles à respecter dès le début)
- Plafond `maxBalls` (défaut 150) ; collisions bille-bille via `collisionFilter` standard.
- Taquets/rampes/bumpers = corps **statiques** (quasi gratuits pour Matter).
- Vitesse des billes clampée + 2 sous-pas physiques par frame pour éviter qu'une bille rapide
  traverse un bumper ou un taquet (tunneling).
- Avatars : une texture par user, créée une fois. Pas de `Graphics` redessiné par frame pour les billes.
- Objets éphémères (pop-ups, effets) poolés, jamais `new` dans la boucle de jeu.
- Mode `?debug=1&bots=150` pour mesurer : objectif **60 fps stables à 150 billes** dans OBS.

## Paramètres d'URL
`?channel=<login>` (requis hors debug) · `duration` (min, défaut 5) · `maxBalls` (150) ·
`seed` · `shake` (1) · `debug` (0) · `bots` (0, debug uniquement) · `theme` (forçage) ·
`date` (`YYYY-MM-DD`, simule la date pour la résolution du thème) · `pattern` (debug, étape 10).

## Étapes d'implémentation
Chaque étape se termine par sa vérification. Ne pas passer à la suivante tant qu'elle échoue.

### 1. Scaffold Vite + TS + Phaser
- [x] `npm create vite@latest` (template `vanilla-ts`), puis `npm i phaser` et `npm i -D vitest`.
- [x] Scripts `dev`, `build`, `preview`, `test` dans `package.json`.
- [x] `vite.config.ts` : `base: './'` pour que `dist/index.html` fonctionne en fichier local dans OBS.
- [x] `src/config.ts` : lecture des params URL (`channel`, `duration`, `maxBalls`, `seed`, `shake`,
      `debug`, `bots`) avec valeurs par défaut et bornes (ex. `duration` entre 1 et 60).
- [x] `src/main.ts` : jeu Phaser 1920×1080, `type: WEBGL`, `transparent: true`,
      `scale.mode: FIT` + `autoCenter`, physique Matter (gravité y ≈ 1), scènes `Game` + `Hud` vides.
- [x] Fond du plateau dessiné par la scène (zone gauche 1440 px), panneau droit 480 px.

⚠️ Vigilance
- Vérifier la version installée de Phaser (3.90 visée). Si npm installe Phaser 4, épingler `phaser@3`
  sauf décision contraire : l'API FX/Matter diffère.
- Les modules ES en `file://` peuvent être bloqués. Tester tôt dans OBS avec « Fichier local ».
  Si ça ne marche pas, utiliser `npm run preview` (URL http) ou `vite-plugin-singlefile`.
- Dans OBS : régler le FPS de la source navigateur à **60** (30 par défaut) et activer
  l'accélération matérielle de la source navigateur.

- [x] **Vérif (étape terminée)** : `npm run dev` affiche le plateau vide sans erreur console ; `npm run build` passe.

### 2. RNG seedé + générateur de carte (pattern Classique) + tests
- [x] `src/rng.ts` : `mulberry32(seed)`, `range(min, max)`, `int(min, max)`, `pick(arr)`, `chance(p)`.
- [x] Types dans `mapgen.ts` : `Peg {x, y, golden}`, `Ramp {x, y, length, angle}`,
      `Spinner {x, y, radius, speed}`, `Bumper {x, y, radius}`, `Bin {x, width, points}`, `MapData`.
- [x] `generateMap(seed, bounds)` avec le pattern Classique : quinconce, quelques trous, 2–4 bumpers,
      taquets dorés rares, bacs (valeurs plus hautes sur les bords).
- [x] Fonction `validateMap(map, bounds)` exportée (réutilisée par les tests et par un `console.warn`
      en debug).
- [x] `mapgen.test.ts` : 1000 seeds → `validateMap` OK, et même seed → carte identique.

⚠️ Vigilance
- **Aucun import Phaser** dans `mapgen.ts` ou `rng.ts`, sinon vitest doit charger Phaser (lent, et
  plante sans DOM).
- Ne jamais utiliser `Math.random()` dans la génération : tout passe par le RNG seedé.
- La règle de distance doit inclure les rampes (distance point–segment) et les tourniquets
  (rayon de balayage complet), pas seulement les centres.
- Garder des taquets près des murs latéraux, sinon les billes tombent droit le long des bords.

- [x] **Vérif (étape terminée)** : `npm run test` vert.

### 3. Fondations des thèmes (thème de base) + scène Game : plateau, billes, bacs, scoring de base

**3a. Fondations des thèmes** (spec thèmes §1–3 ; seul le thème `base` existe à cette étape)

- [x] `src/themes/types.ts` : recopier les types de la spec (§1) : `DrawFn`, `SpriteSource`,
      `ElementKey`, `ParticleKey`, `Palette`, `Theme`, plus :
```ts
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...a: never[]) => unknown ? T[K]
    : T[K] extends object ? DeepPartial<T[K]> : T[K];
};
export type ThemeDef = DeepPartial<Theme> & { id: string; extends?: string };
```
      `DrawFn` = `(ctx: CanvasRenderingContext2D, w: number, h: number, palette: Palette) => void`
      (largeur/hauteur séparées pour les rampes, qui ne sont pas carrées).
- [x] Écrire le test qui échoue, `src/themes/resolve.test.ts` (registre fictif, indépendant des vrais thèmes) :
```ts
import { describe, it, expect, vi } from 'vitest';
import { resolveTheme, mergeTheme, todayMMDD } from './resolve';
import type { ThemeDef } from './types';

const defs = {
  base:   { id: 'base', palette: { peg: '#a00', marquee: ['#fff'] }, ambient: null },
  winter: { id: 'winter', period: { from: '12-01', to: '02-29' }, priority: 1,
            ambient: { count: 10 }, palette: { peg: '#00f' } },
  xmas:   { id: 'xmas', extends: 'winter', period: { from: '12-01', to: '12-26' }, priority: 2,
            palette: { marquee: ['#f00', '#0f0'] } },
  // priorité haute : si la résolution lisait les thèmes fusionnés, il hériterait de la période
  // de winter et gagnerait → le test le détecterait
  noPeriodChild: { id: 'noPeriodChild', extends: 'winter', priority: 5 },
} as unknown as Record<string, ThemeDef>;

const id = (date: string, forced?: string) => resolveTheme(date, forced, defs).id;

describe('resolveTheme', () => {
  it.each([
    ['06-15', 'base'], ['12-15', 'xmas'], ['12-27', 'winter'], ['01-15', 'winter'],
    ['02-29', 'winter'], ['03-01', 'base'], ['11-30', 'base'],
  ])('%s → %s', (d, expected) => expect(id(d)).toBe(expected));

  it('un enfant sans période n\'hérite pas de celle du parent', () =>
    expect(id('01-15')).not.toBe('noPeriodChild'));

  it('thème forcé connu, même hors période', () => expect(id('06-15', 'xmas')).toBe('xmas'));

  it('thème forcé inconnu → résolution par date + warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(id('12-15', 'nope')).toBe('xmas');
    expect(warn).toHaveBeenCalled();
  });
});

describe('mergeTheme', () => {
  it('hérite des champs du parent', () => expect(mergeTheme('xmas', defs).ambient).toEqual({ count: 10 }));
  it('surcharge les champs simples', () => expect(mergeTheme('winter', defs).palette.peg).toBe('#00f'));
  it('un tableau enfant remplace celui du parent', () =>
    expect(mergeTheme('xmas', defs).palette.marquee).toEqual(['#f00', '#0f0']));
  it('ne modifie pas les définitions', () => {
    mergeTheme('xmas', defs);
    expect(defs.base.palette!.peg).toBe('#a00');
  });
});

describe('todayMMDD', () => {
  it('lit ?date= valide', () => expect(todayMMDD('2026-12-15')).toBe('12-15'));
  it.each(['hier', '2026-13-40', '2026-1-5', ''])('ignore %j → date du jour', (p) =>
    expect(todayMMDD(p)).toMatch(/^\d\d-\d\d$/));
});
```
- [x] Lancer `npx vitest run src/themes` → **échec attendu** (module `./resolve` introuvable).
- [x] Implémenter `src/themes/resolve.ts` :
```ts
import type { Theme, ThemeDef } from './types';
import { THEMES } from './index';

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function deepMerge<T>(base: T, over: unknown): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v; // tableaux et fonctions remplacés
  }
  return out as T;
}

export function mergeTheme(id: string, defs: Record<string, ThemeDef> = THEMES): Theme {
  const def = defs[id];
  if (id === 'base') return def as unknown as Theme;
  return deepMerge(mergeTheme(def.extends ?? 'base', defs), def);
}

const inPeriod = (d: string, p: { from: string; to: string }) =>
  p.from <= p.to ? p.from <= d && d <= p.to : d >= p.from || d <= p.to;

// Lit les définitions BRUTES : un enfant sans `period` n'hérite pas de celle du parent.
export function resolveTheme(date: string, forcedId?: string,
                             defs: Record<string, ThemeDef> = THEMES): Theme {
  if (forcedId) {
    if (defs[forcedId]) return mergeTheme(forcedId, defs);
    console.warn(`Thème inconnu : ${forcedId}`);
  }
  const match = Object.values(defs)
    .filter((t) => t.period && inPeriod(date, t.period as { from: string; to: string }))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
  return mergeTheme(match?.id ?? 'base', defs);
}

export function todayMMDD(param?: string | null): string {
  const m = /^\d{4}-(\d\d)-(\d\d)$/.exec(param ?? '');
  if (m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31) return `${m[1]}-${m[2]}`;
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
```
- [x] `src/themes/draw.ts` : `DrawFn` du thème de base, dessinées à **2× la taille de la hitbox**
      (rayons dans `config.ts`) puis affichées avec `setDisplaySize`. Exemple de référence pour le style :
```ts
export const drawPeg: DrawFn = (ctx, w, h, p) => {
  const r = w / 2;
  const g = ctx.createRadialGradient(r * 0.7, r * 0.6, r * 0.1, r, r, r);
  g.addColorStop(0, '#fff6d8');           // reflet décalé
  g.addColorStop(0.35, p.peg);            // laiton
  g.addColorStop(1, '#5a3d0a');           // bord sombre
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(r, r, r * 0.95, 0, Math.PI * 2); ctx.fill();
};
```
      Puis, sur le même modèle (dégradés, pas d'image) et selon le tableau §4 de la spec :
      `drawPegGolden` (or vif), `drawBumper` (anneau chrome `bumperRing` + cœur `bumperCore`
      translucide), `drawSpinner` (croix chrome, moyeu rouge), `drawRamp` (barre laiton biseautée,
      `w × h`), `drawBall` (acier chromé + reflet spéculaire), `drawBackground` (laque `#0b0f1a` +
      vignettage), `drawSpark` (point lumineux flou, particule par défaut).
- [x] `src/themes/base.ts` : `ThemeDef` complet (palette §4 : or `#e8b84a`, rouge `#c8102e`,
      chrome `#d8dde6`, fond `#0b0f1a` ; `ambient: null` ; police Dela Gothic One ;
      `texts.podiumTitle: '大当り'`). `src/themes/index.ts` : `export const THEMES = { base }`.
- [x] Télécharger `DelaGothicOne-Regular.woff2` (Google Fonts, OFL) dans `public/fonts/`.
- [x] `src/themes/apply.ts` : `applyTheme(scene, theme): Promise<void>`
      - pour chaque clé fixe (`peg`, `pegGolden`, `bumper`, `spinner`, `ramp`, `background`,
        `ball`, `fx-hit`, `fx-bumper`, `fx-bin`, `fx-confetti`) : source = `theme.sprites[k]` /
        `theme.particles[k]` ?? dessin par défaut de `draw.ts` ;
      - `DrawFn` → `document.createElement('canvas')` → `scene.textures.addCanvas(key, canvas)` ;
        chemin → `scene.load.image(key, url)` puis `scene.load.start()` et attente de `complete` ;
      - `scene.textures.exists(key)` → `scene.textures.remove(key)` avant de recréer ;
      - police : `const f = new FontFace(family, \`url(${url})\`); await f.load(); document.fonts.add(f)`.
- [x] `config.ts` : ajouter `theme` et `date` ; `main.ts` : `await applyTheme(...)` dans le `create`
      de Game avant de construire la carte, avec `resolveTheme(todayMMDD(params.date), params.theme)`.
- [x] `npm run test` → vert.

**3b. Scène Game**

- [x] Construire les corps Matter depuis `MapData` : murs latéraux, taquets (cercles statiques),
      murets et capteurs (`isSensor`) des bacs.
- [x] Rendu : des `Image` qui utilisent **uniquement** les clés fixes produites par `applyTheme`
      (`peg`, `pegGolden`, `ball`, …), jamais de référence au thème dans la scène.
- [x] `scenes/Backdrop.ts` : scène lancée **sous** Game, affiche la texture `background` (l'ambiance
      animée s'y ajoutera à l'étape 9). Ordre des scènes : Backdrop → Game → Hud.
- [x] Spawn d'une bille : `matter.add.image` avec forme cercle, `restitution` ≈ 0.5, `friction` faible,
      position X donnée, Y en haut, petite vitesse X aléatoire.
- [x] `collisionstart` : taquet → +1 (cooldown 150 ms par paire bille/taquet) ; capteur de bac →
      points du bac, destruction de la bille.
- [x] Mode debug : clic souris sur le plateau = drop pour un faux user, affichage des points en texte
      simple (le juice vient à l'étape 8).
- [x] Sous-pas physiques : `autoUpdate: false` et deux appels `world.step(delta / 2)` dans `update`.
      Vitesse des billes clampée.

⚠️ Vigilance
- Désactiver le sleeping Matter (`enableSleeping: false`), sinon des billes « s'endorment » sur une rampe.
- Une bille peut déclencher le capteur de bac deux fois dans la même frame : marquer la bille comme
  terminée avant de la détruire et ignorer les événements suivants.
- Détruire un corps pendant `collisionstart` peut casser l'itération : différer la destruction
  (liste traitée en fin de `update`).
- Identifier les corps par `body.label` ou une référence `gameObject`, pas par comparaison de positions.
- `resolve.ts` et `types.ts` ne doivent importer ni Phaser ni `apply.ts` ; `draw.ts` n'utilise que
  l'API Canvas 2D (importable sans DOM tant qu'on ne l'appelle pas).
- `deepMerge` ne doit **jamais** muter les définitions (le test le vérifie) : les thèmes sont refusionnés
  à chaque partie.
- Canvas dessiné à 2× puis réduit : sinon les dégradés sont flous sur la source OBS 1080p.

- [x] **Vérif (étape terminée)** : `npm run test` vert (dont `resolve.test.ts`) ; en `?debug=1`, le plateau
a le rendu laiton/laque du thème de base, des clics font tomber des billes, les taquets donnent des
points et les bacs détruisent les billes avec le bon score.

### 4. Rampes, tourniquets, bumpers + filet anti-blocage
- [x] Rampes : rectangles statiques inclinés (`angle`), friction quasi nulle, pas de points.
- [x] Tourniquets : corps statique composé (croix ou barre), rotation par `Body.setAngle(body, a, true)`
      à chaque step (le `true` met à jour la vitesse pour transmettre l'élan), +3 au contact.
- [x] Bumpers : cercle statique, au contact on impose à la bille une vitesse le long de la normale
      avec biais vers le haut, clampée ; +5.
- [x] Filet anti-blocage : vitesse < seuil pendant 3 s → impulsion aléatoire ; 8 s → bille retirée
      sans points de bac.
- [x] Toutes les constantes (forces, vitesses de rotation, seuils) dans `config.ts`.

⚠️ Vigilance
- Vérifier que la version de Matter embarquée accepte le 3ᵉ argument `updateVelocity` de `setAngle`.
  Sinon : corps dynamique fixé par une contrainte pivot + vitesse angulaire forcée.
- Bumper trop fort = bille éjectée hors du plateau ou à travers un mur : clamper la vitesse et
  ajouter un plafond invisible au-dessus de la zone de spawn.
- Le cooldown de score s'applique aussi aux bumpers et tourniquets (une bille coincée contre un
  tourniquet ne doit pas farmer des points).

- [x] **Vérif (étape terminée)** : en debug, chaque élément dévie les billes comme prévu ; aucune bille ne reste bloquée
plus de 8 s sur 5 minutes de spam.

### 5. État de partie + HUD (timer, classement, podium, cycle)
- [x] `game/state.ts` : `players`, `activeBall`, `phase`, `endsAt`, méthodes `canDrop(userId)`,
      `addScore(userId, pts)`, `top(n)`, `reset()`.
- [x] Drop refusé si bille déjà active pour ce user ou si `maxBalls` atteint.
- [x] Événements via `game.events` : `drop`, `score`, `ballFinished`, `phase`.
- [x] Scène Hud : timer `mm:ss`, top 10 (nom + score), nombre de joueurs.
- [x] Cycle : `playing` → fin du timer → `podium` (drops refusés, billes restantes finissent et
      comptent) → ~15 s → suppression des billes, nouvelle seed, nouvelle carte, scores remis à zéro
      → `playing`.
- [x] Podium : top 3 affiché par-dessus le plateau, titre = `theme.texts.podiumTitle`
      (lu par le Hud via un registre `game.registry.set('theme', theme)`, pas d'import de thème).
- [x] Nouvelle partie : `resolveTheme(todayMMDD(params.date), params.theme)` ; si l'`id` diffère du
      thème courant → **d'abord** détruire billes et objets de la carte, **puis** `await applyTheme`,
      puis construire la nouvelle carte.

⚠️ Vigilance
- Timer basé sur un horodatage de fin (`endsAt = Date.now() + duration`), pas sur une addition de
  `delta`, pour éviter la dérive.
- Ne pas trier tous les joueurs à chaque frame : recalculer le top 10 seulement sur l'événement
  `score`, au plus quelques fois par seconde.
- Ex æquo au classement : départager par l'heure d'atteinte du score (premier arrivé devant).
- Libérer `activeBall` dans **tous** les cas de fin de bille (bac, anti-blocage, reset de partie),
  sinon un viewer reste bloqué sans pouvoir relancer.

- [x] **Vérif (étape terminée)** : partie de 1 min en debug (`?duration=1`) : timer, classement live, podium, nouvelle carte.

### 6. Tchat IRC + Heat
- [x] `twitch/chat.ts` : connexion WebSocket, `CAP REQ`, `PASS`/`NICK justinfan<n>`, `JOIN`.
- [x] Parseur IRC exporté (tags, préfixe, commande, params, message) + `chat.test.ts` avec de vraies
      lignes PRIVMSG, ROOMSTATE et PING.
- [x] `PING` → `PONG` ; reconnexion avec backoff (1 s, 2 s, 4 s… max 30 s).
- [x] Commandes : `!drop` (X aléatoire), `!drop N` (0–100, borné) ; `!pachinko start|stop|skip` si
      badge `broadcaster` ou `moderator`.
- [x] `room-id` du ROOMSTATE → ouverture de `twitch/heat.ts`.
- [x] `twitch/heat.ts` : WebSocket Heat, ne traiter que `type === 'click'`, `parseFloat(x)`,
      ids `A…` ignorés, `U…` en « Anonyme-xxxx », clics hors plateau ignorés ; reconnexion avec backoff.

⚠️ Vigilance
- Une frame WebSocket IRC peut contenir **plusieurs lignes** : découper sur `\r\n`.
- Le `!drop` peut avoir des espaces ou majuscules en trop : normaliser (`trim`, `toLowerCase`).
- Le x Heat est normalisé sur toute la vidéo : convertir avec la largeur du plateau (1440/1920), pas
  avec la largeur de la fenêtre.
- Ne jamais logger de données viewers au-delà du nécessaire en prod (logs seulement en debug).

- [x] **Vérif (étape terminée)** : `npm run test` vert ; en réel, `!drop` depuis le tchat lâche une bille au bon endroit,
un clic Heat aussi, et un viewer ne peut pas avoir deux billes.

### 7. Utilisateurs et avatars
- [x] `twitch/users.ts` : cache `Map` + `localStorage` (id → nom, couleur, URL avatar, date), TTL ≈ 7 jours.
- [x] Lookup `heat-api.j38.net/user/{id}` seulement si absent du cache ; requêtes identiques en cours
      dédupliquées (une seule promesse par id).
- [x] Chargement de l'avatar (`crossOrigin = 'anonymous'`), rendu en cercle dans une `CanvasTexture`
      `avatar-<id>` à 2× la taille de la bille, bordure couleur du viewer, puis **reflet spéculaire
      chromé dessiné par-dessus** (même dégradé que `drawBall`) pour que la bille reste « en métal ».
- [x] Fallback immédiat : bille colorée + initiale ; échange de texture quand l'avatar arrive.

⚠️ Vigilance
- La bille doit tomber **tout de suite**, sans attendre le lookup réseau.
- Si le CDN Twitch ne renvoie pas les en-têtes CORS, la texture WebGL échoue (canvas « tainted ») :
  le vérifier en premier ; repli sur le fallback couleur + initiale.
- Ne pas créer une texture par bille : une par **user**, réutilisée à chaque relance.
- Gérer l'échec du lookup (API Heat en panne) sans casser le jeu.

- [x] **Vérif (étape terminée)** : billes avec avatar pour des comptes réels ; après rechargement de la page, pas de
nouvelle requête pour les users en cache.

### 8. Juice + direction artistique de base
- [x] Police bitmap des pop-ups générée dans `applyTheme` : après `document.fonts.load('64px "<family>"')`,
      dessiner `+0123456789` en grille fixe (11 cellules, une ligne) sur un canvas avec la police du
      thème, `textures.addCanvas('digits', canvas)`, puis enregistrer via
      `Phaser.GameObjects.RetroFont.Parse(scene, { image: 'digits', width, height, chars: '+0123456789',
      charsPerRow: 11, spacing: {x:0,y:0}, offset: {x:0,y:0}, lineSpacing: 0 })` et
      `scene.cache.bitmapFont.add('digits', …)` (supprimer l'entrée existante au changement de thème).
- [x] Pool d'environ 64 pop-ups `BitmapText` (`digits`) : montée + fade, taille et teinte selon la valeur.
- [x] **Marquee** : ~40 ampoules (sprite `fx-hit` teinté avec `palette.marquee`) le long du cadre du
      plateau ; chenillard lent au repos, frénétique et or pendant ~1,5 s sur un gros bac
      (seuil dans `config.ts`).
- [x] Bumper « ampoule » : cœur qui s'allume (tint + alpha) au contact puis retombe.
- [x] Bac : flash plein de l'alvéole à l'entrée d'une bille ; gros bacs avec liseré rouge/or.
- [x] Filigrane du panneau : `theme.texts.watermark` (kanji) en alpha ≈ 0.06.
- [x] Traînée de vitesse derrière chaque bille, intensité proportionnelle à la vitesse.
- [x] Un émetteur de particules par type d'effet (étincelles taquet, burst bumper, confettis bac) via `explode()`.
- [x] Flash et scale tween des taquets touchés ; pulse et anneau d'onde des bumpers.
- [x] Glow PostFX sur bumpers et taquets dorés.
- [x] Camera shake sur bumper et gros bac, désactivable avec `?shake=0`.
- [x] Nom du viewer au-dessus de sa bille au spawn (fade après ~1 s).
- [x] Classement : lignes animées (tween Y) aux changements de rang, avec avatars.
- [x] Podium : slow-mo léger, avatars du top 3, confettis.

⚠️ Vigilance
- Aucun `new` d'objet dans `update()` ni dans les handlers de collision : tout vient d'un pool.
- Le glow PostFX coûte cher : uniquement sur des éléments peu nombreux (bumpers, taquets dorés),
  jamais sur les billes.
- Shake dosé : un shake répété en continu avec 100 billes devient illisible. Mettre un cooldown global.
- Trop de particules à 150 billes : plafonner le nombre max par émetteur.
- Police pas chargée au moment du dessin de `digits` → chiffres en police par défaut :
  toujours `await document.fonts.load(...)` avant ; vérifier visuellement au premier lancement
  (cache vidé).
- Le marquee ne doit pas recréer de tweens à chaque gros gain : un seul timer dont on change la vitesse.

- [x] **Vérif (étape terminée)** : en `?debug=1&bots=50`, le jeu est lisible et agréable, sans chute de
FPS visible ; les pop-ups sont en Dela Gothic One dès le premier lancement (cache navigateur vidé).

### 9. Thèmes saisonniers
Spec thèmes §5. Chaque thème = `src/themes/<id>.ts` exportant un `ThemeDef` partiel ; tous les
sprites sont des `DrawFn` dans `draw.ts`.

- [x] Étendre `resolve.test.ts` avec le **vrai** registre (test qui échoue tant que les thèmes
      n'existent pas) :
```ts
import { THEMES } from './index';

describe('registre réel', () => {
  it.each([
    ['10-31', 'halloween'], ['11-02', 'base'], ['12-15', 'noel'], ['12-30', 'hiver'],
    ['01-15', 'hiver'], ['02-29', 'hiver'], ['03-25', 'sakura'], ['08-01', 'plage'], ['06-15', 'base'],
  ])('%s → %s', (d, expected) => expect(resolveTheme(d, undefined, THEMES).id).toBe(expected));

  it('noel hérite de la neige de hiver', () =>
    expect(mergeTheme('noel', THEMES).ambient).toBe(mergeTheme('hiver', THEMES).ambient));

  it.each(Object.keys(THEMES))('%s a une palette complète', (k) => {
    const p = mergeTheme(k, THEMES).palette;
    for (const key of Object.keys(THEMES.base.palette!))
      expect(p[key as keyof typeof p], key).toBeDefined();
  });
});
```
- [x] `npx vitest run src/themes` → **échec attendu** (thèmes absents du registre).
- [x] `draw.ts` : `drawPumpkin`, `drawCandy`, `drawBat`, `drawSnowflake`, `drawChristmasBall`,
      `drawStar`, `drawSakuraFlower`, `drawPetal`, `drawBubble`, `drawDrop`, `drawShell`,
      `drawStarfish`, `drawBuoy` (formes simples + dégradés, cohérentes avec le rendu métallique).
- [x] `halloween.ts` (`10-15 → 11-01`), `hiver.ts` (`12-01 → 02-29`, priorité 1),
      `noel.ts` (`extends: 'hiver'`, `12-01 → 12-26`, priorité 2), `sakura.ts` (`03-20 → 04-30`),
      `plage.ts` (`07-01 → 08-31`) : palette, `sprites`, `particles`, `ambient`, `font`, `texts`
      exactement selon le tableau §5 de la spec. Ajouter au registre `index.ts`.
- [x] Polices woff2 dans `public/fonts/` : Creepster, Mountains of Christmas, Lilita One (OFL).
- [x] `npm run test` → vert.
- [x] Ambiance dans `scenes/Backdrop.ts` : un émetteur avec la texture `ambient`, `count` ≤ 60,
      direction `down` / `up` / `across`, `drift` (oscillation X), `spin` (rotation), alpha ≈ 0.5.
      Recréé quand le thème change.
- [x] `apply.ts` : générer aussi la texture `ambient` quand `theme.ambient` existe ; si
      `palette.ballRim` est défini, supprimer les textures `avatar-*` (elles seront recréées avec ce liseré).
- [x] Debug : touche **T** = thème suivant du registre (même chemin que le changement entre parties :
      destruction → `applyTheme` → reconstruction).

⚠️ Vigilance
- Ordre au changement de thème : détruire billes et carte **avant** `textures.remove`, sinon des
  objets pointent vers une texture supprimée (carré vert « missing » ou crash WebGL).
- Un élément remplacé (citrouille, bouée, étoile de mer) garde la **même hitbox** : dessiner dans la
  même taille de canvas que l'élément d'origine.
- Ambiance : dans Backdrop, donc insensible au shake de la caméra de Game ; ne jamais la mettre
  au-dessus du plateau.
- Les périodes ne s'héritent pas : `noel` doit déclarer la sienne.
- Lisibilité : vérifier sur chaque thème que les billes chromées et les pop-ups restent bien
  contrastés sur le nouveau fond.

- [x] **Vérif (étape terminée)** : `npm run test` vert ; `?date=2026-10-31`, `?date=2026-12-15`,
`?date=2026-01-15`, `?date=2026-04-01`, `?date=2026-08-01` affichent respectivement Halloween, Noël,
Hiver, Sakura, Plage ; la touche T fait défiler les 6 thèmes 20 fois de suite sans texture manquante
ni hausse continue de la mémoire (onglet Memory de Chrome).

### 10. Les 4 autres patterns de génération
- [x] Symétrique : moitié gauche générée puis miroir (rampes : angle inversé ; tourniquets : sens inversé).
- [x] Diagonale : bandes de taquets en diagonale et rampes en zigzag/chevrons.
- [x] Trous : grille dense, zones vidées (cercles/rectangles), spinner ou bumper au centre des trous.
- [x] Entonnoirs : rampes en V qui concentrent vers des tourniquets, alternées avec des rangées de taquets.
- [x] Tirage du pattern par la seed ; `?pattern=` en debug pour forcer un pattern.
- [x] `mapgen.test.ts` étendu : 1000 seeds × 5 patterns.

⚠️ Vigilance
- Le miroir ne doit pas dupliquer un élément posé sur l'axe central (chevauchement).
- Un entonnoir qui mène droit dans un bac rend la carte prévisible : toujours des taquets entre
  la dernière rampe et les bacs.
- Vérifier visuellement chaque pattern sur une dizaine de seeds, le test ne juge pas l'intérêt du jeu.

- [x] **Vérif (étape terminée)** : `npm run test` vert ; chaque pattern forcé en debug donne des parties jouables.

### 11. Passe perf et réglages finaux
- [x] Mode bots (`?bots=N`, touche B) qui relance des billes en continu pour N faux users.
- [x] Compteur FPS et nombre de billes affichés en debug.
- [x] Mesure à 150 billes dans le navigateur **et** dans OBS ; profiler (onglet Performance de
      Chrome) si moins de 60 fps.
- [x] Ajustement des valeurs dans `config.ts` : points, forces, rayons, valeurs des bacs, durée du podium.
- [x] Test réel complet sur la chaîne (tchat + Heat + avatars + partie complète).

> Mesures du 2026-10-02 (Chrome, iGPU Intel UHD 630, vsync coupée, 150 billes) : 103–108 fps,
> `Game.update` p50 ≈ 4,5 ms / p95 ≈ 7 ms. Leviers appliqués : glow PostFX remplacé par des halos
> additifs (+15 fps), particules plafonnées, solveur Matter 4/3 itérations (0 bille sortie, 1 retirée
> par l'anti-blocage sur 4 078). Équilibrage : bacs tirés par carte (un seul 500, jamais au bord),
> déflecteurs muraux (le couloir le long des murs donnait le 500 à 30–45 % des billes), billes 32 px.
> **Reste à faire par le streamer : mesure dans OBS et partie réelle sur la chaîne.**

⚠️ Vigilance
- OBS rend souvent moins vite que Chrome : le chiffre qui compte est celui mesuré dans OBS.
- Si Matter sature : réduire `maxBalls` ou les itérations du solveur avant d'envisager Rapier.
- Équilibrage : un viewer qui spamme ne doit pas écraser les autres uniquement grâce au nombre de
  lancers ; surveiller le ratio points taquets / points bacs.

- [x] **Vérif (étape terminée)** : 60 fps stables à 150 billes dans OBS ; une partie réelle de bout en bout sans bug.

### 12. Mode streamer
- [x] Réglages persistants (défauts < sauvegardés < URL), application à chaud (`Game.applySettings`).
- [x] Contrôle de partie : pause/reprise, terminer, carte suivante, rejouer, démarrer (menu + `!pachinko pause|resume|end|skip|start`, `stop` = alias de `pause`).
- [x] Le streamer joue à la souris (id = room-id de sa chaîne, `streamer` sans chaîne).
- [x] Joueurs (classement complet, retirer la bille, score à zéro, exclure), bans et historique persistants.
- [x] Menu DOM (Échap / roue crantée), plein écran, curseur masqué après 3 s.
- [x] **Vérif** : `npm run verify` (Playwright headless sur le Chrome installé, 2026-10-02) — 20/20 OK :
      premier lancement → Réglages, chaîne persistée, pause 9 s (timer gelé, bille conservée), exclusion,
      historique après une partie de 1 min, 60 fps menu fermé / 60 fps menu ouvert à 145 billes.
      À vérifier à la main : Échap en plein écran (verrou clavier Chrome ; Firefox : préférer F11).

### 13. Timer à la première bille
- [x] `GameState` : état d'attente (`waiting`), timer lancé par la première bille ; billes comptées par viewer (`extraBall`).
- [x] Hud : durée complète figée + « En attente de la première bille ».
- [x] **Vérif** : `npm run test` et `npm run verify` verts (timer figé avant la première bille).

### 14. Top du mois
- [x] `src/game/monthly.ts` : meilleur score par viewer sur le mois civil, persistant, anonymes exclus.
- [x] Enregistrement en fin de podium (hors `?debug=1`), retrait à l'exclusion.
- [x] Panneau latéral « TOP DU MOIS » pendant le podium et l'attente.
- [x] **Vérif** : `npm run test` et `npm run verify` verts ; à la main : record visible dès le podium, conservé après rechargement.

### 15. Taquets spéciaux
- [x] Réglages `specialEvery` / `specialEffects` (menu + URL).
- [x] `src/game/specials.ts` (catalogue + tirage, pur) et `src/scenes/specials.ts` (taquet allumé, 7 effets).
- [x] Texture `pegSpecial` (clé fixe, teintable).
- [x] **Vérif** : `npm run test` et `npm run verify` verts ; 60 fps à `?debug=1&bots=150` ; les 7 effets vus à la main.

### 16. Fin de partie nette + lien copiable des réglages
Remplace le cycle de l'étape 5 (billes qui finissaient leur course au ralenti pendant le podium).
- [x] À 0:00 (ou « Terminer maintenant ») : toutes les billes retirées avant le podium, score figé, plus de ralenti.
- [x] `settingsQuery` (`src/settings.ts`, inverse de `mergeSettings`) + champ « Lien avec ces réglages » et
      bouton « Copier le lien » dans l'onglet Réglages (source navigateur OBS, GitHub Pages).
- [x] **Vérif** : `npm run test` et `npm run verify` verts (bille lâchée juste avant 0:00 retirée, score figé, lien copié).

### 17. Réglages enregistrés automatiquement + lien OBS sans menu
- [x] Onglet Réglages : plus de bouton « Enregistrer », chaque champ est enregistré au `change`, à la
      fermeture, au changement d'onglet et au rechargement de la page ; chaîne invalide ignorée, le reste est enregistré.
- [x] « Nouvelle partie maintenant » : immédiat avant la première bille, deux clics si la partie a commencé.
- [x] Croix de fermeture du menu ; `menu=0` (ajouté au lien copiable) : ni menu ni roue crantée.
- [x] Captures d'écran dans le README (`docs/screenshots/`).
- [x] **Vérif** : `npm run test` et `npm run verify` verts (2026-10-12, 56/56 OK, 158 fps à 150 billes).

### 18. Chaîne connectée par un bouton + état de la connexion
Revient sur un point de l'étape 17 : la chaîne enregistrée en quittant le champ connectait le jeu au tchat
d'une chaîne à moitié tapée (ses modos pouvaient alors lancer `!pachinko end` / `skip`).
- [x] La chaîne sort de l'enregistrement automatique : bouton « Connecter » ou Entrée ; champ vidé = déconnexion ;
      saisie non validée abandonnée à la fermeture.
- [x] État à côté du champ : « Non connecté », « Connexion à #… », « Aucune réponse : vérifie le nom de la
      chaîne ou ta connexion Internet » après 5 s, « Chaîne modifiée… » tant que la saisie n'est pas validée,
      nom invalide signalé au même endroit, « Connecté à #… » une fois le `room-id` reçu (`Game.connected`).
- ⚠️ L'état ne retombe pas si la socket se coupe en cours de stream (reconnexion automatique, non affichée).
- [x] **Vérif** : `npm run test` et `npm run verify` verts.

### 19. Taquets à valeur
- [x] `Peg.value` (1, 5, 10, 30, 50) en nombres fixes par carte, un seul 50, 30 et 50 espacés, miroir en symétrique.
- [x] Textures `peg5`, `peg30`, `peg50` (le 10 garde `pegGolden`), halos, étincelles selon la valeur.
- [x] Taquets spéciaux sur les taquets à 1 point ; pluie d'or : au moins 10 points, chaque taquet retrouve sa texture.
- ⚠️ La carte d'une seed change (tirages modifiés) : l'historique rejoue une carte différente pour les anciennes parties.
- [x] **Vérif** : `npm run test` (246) et `npm run verify` verts, 158 fps headless à 150 billes.
      À valider à l'œil sur `dev` : rendu des paliers dans chaque thème (touche T).

### 20. Barres bumpers et hélices longues
- [x] `Bar` (capsule, rebond perpendiculaire), une fois sur trois à la place d'un bumper dans les motifs.
- [x] Hélices longues (≈ 1 sur 3, plus lentes), texture `spinnerLong` (reprend l'hélice du thème s'il en dessine une).
- [x] **Vérif** : `npm run test` (248) et `npm run verify` verts, 158 fps headless à 150 billes.
      À valider à l'œil sur `dev` : rebond sur une barre, bras fins des hélices longues, étoile de mer du thème Plage.

### 21. Éléments mobiles
- [ ] `move` sur bumpers, barres, hélices ; capsule balayée dans les règles ; 2 à 4 mobiles posés avant les taquets.
- [ ] Corps déplacés à chaque sous-pas (`setPosition(…, true)`), figés en pause.
- ⚠️ Une barre mobile glisse dans son axe (sinon la zone balayée n'est plus une capsule).
- [ ] **Vérif** : `npm run test` et `npm run verify` verts ; 60 fps ; aucune bille coincée par un mobile.

### 22. Couloir du bas
- [ ] Réglage `lane` (menu + URL `lane=0`, carte suivante).
- [ ] Un élément de mur à mur au-dessus des bacs, deux en miroir en symétrique ; passage ≥ `MIN_GAP` aux bouts.
- [ ] **Vérif** : `npm run test` et `npm run verify` verts ; 60 fps.

### 23. Bacs qui défilent
- [ ] Réglage `binScroll` (désactivé / 30 s / 1 min, URL 0–300) ; `binShifts` (jackpot jamais au bord).
- [ ] `src/scenes/bins.ts` : glissement animé, valeurs payées tout de suite, figé en pause et au podium.
- [ ] **Vérif** : `npm run test` et `npm run verify` verts (défilement, pause, `binScroll=45` conservé).

### 24. Billes d'animation
- [ ] Réglage `attract` ; `src/scenes/attract.ts` : billes hors `GameState` pendant l'attente, figées puis éclatées à la première vraie bille.
- [ ] **Vérif** : `npm run test` et `npm run verify` verts (classement vide, plafond, changement de thème) ; 60 fps.

### 25. Réglages en sous-onglets, « À propos », version automatique
- [ ] Version `majeur.mineur.<nombre de commits>` + commit + date, injectée au build (`vite.config.ts`, `__BUILD__`) ; `pages.yml` en `fetch-depth: 0`.
- [ ] Réglages : sous-onglets Chaîne · Partie · Effets · Exclus (bascule de visibilité, enregistrement auto inchangé).
- [ ] Onglet « À propos » : version, langages, technos et versions installées, lien vers le dépôt GitHub.
- [ ] **Vérif** : `npm run test` et `npm run verify` verts ; version visible sur la GitHub Page après déploiement.

## Vérification
- `npm run test` : `mapgen.test.ts` (1000 seeds × 5 patterns respectent les règles),
  `chat.test.ts` (parse de lignes IRC réelles avec tags) et `themes/resolve.test.ts`
  (résolution par date, héritage, forçage, `?date=` invalide).
- `?date=…` / `?theme=…` / touche T : chaque thème s'affiche correctement, sans fuite de textures.
- `npm run dev` + `?debug=1` : clics souris = drops, touche B = bots, compteur FPS visible.
- `?debug=1&bots=150` : 60 fps stables, aucune bille bloquée plus de 8 s.
- Test réel : `npm run build`, source navigateur OBS sur `dist/index.html?channel=<login>`
  (ou `npm run preview`), `!drop` depuis le tchat, clic via Heat installé sur la chaîne,
  vérifier avatar, unicité de la bille par viewer et podium en fin de partie.

## Hors scope (à ajouter si besoin)
- Classement all-time persistant (localStorage ou petit backend).
- Token Helix en fallback si l'API Heat de lookup tombe.
- Sons (Phaser les gère nativement : facile à ajouter plus tard).
- Calibration de zone si la source OBS n'est pas plein écran.
