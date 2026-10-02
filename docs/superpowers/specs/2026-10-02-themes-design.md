# Spec — Direction artistique & système de thèmes

Complète `PLAN.md` (design général du jeu). Date : 2026-10-02.

## Objectif
Donner au jeu une identité visuelle **pachinko japonais sobre et clinquant**, et permettre de
l'habiller selon les saisons/événements (Halloween, Hiver, Noël, Sakura, Plage) **sans toucher au
gameplay ni au code des scènes**.

**Critères de réussite**
- Hors période saisonnière, le thème de base s'affiche ; pendant une période, le thème correspondant
  s'applique automatiquement à la partie suivante.
- Ajouter un thème = un fichier `src/themes/<id>.ts` (+ images optionnelles), rien d'autre à modifier
  hormis son ajout dans `src/themes/index.ts`.
- Aucun changement de thème n'altère la physique (hitbox identiques) ni les performances
  (objectif 60 fps à 150 billes inchangé).

**Ce que l'utilisateur a demandé** : style pachinko japonais sobre et clinquant ; thèmes selon
saisons/événements (Halloween, Noël, hiver, plage d'été…). **Choix validés en brainstorming** :
assets hybrides (code + images optionnelles), sélection auto par date + forçage URL, un thème peut
changer palette + ambiance animée + particules + images d'éléments + police/textes, modules TS typés,
5 thèmes en v1, sprites saisonniers dessinés en code en v1.

## 1. Modèle de thème

```ts
type DrawFn = (ctx: CanvasRenderingContext2D, w: number, h: number, palette: Palette) => void;
type SpriteSource = string | DrawFn;   // chemin d'image dans public/ ou fonction de dessin

type ElementKey = 'peg' | 'pegGolden' | 'bumper' | 'spinner' | 'ramp' | 'background';
type ParticleKey = 'hit' | 'bumper' | 'bin' | 'confetti';

interface Palette {
  background: string; frame: string; marquee: string[];   // couleurs des ampoules du cadre
  peg: string; pegGolden: string; bumperRing: string; bumperCore: string;
  spinner: string; ramp: string; bins: string[]; binHighlight: string;
  text: string; accent: string; ballRim: string | null;   // null = couleur du viewer
}

interface Theme {
  id: string;
  extends?: string;                               // parent, défaut 'base' (sauf pour base)
  period?: { from: string; to: string };          // 'MM-DD' inclusif, peut chevaucher l'année
  priority?: number;                              // défaut 0 ; le plus haut gagne en cas de chevauchement
  palette: Palette;
  sprites: Partial<Record<ElementKey, SpriteSource>>;   // absent = dessin par défaut de draw.ts
  particles: Record<ParticleKey, SpriteSource | null>;  // null = étincelle par défaut
  ambient: { sprite: SpriteSource; count: number; speed: number; drift: number;
             spin: number; direction: 'down' | 'up' | 'across' } | null;
  font: { family: string; url: string };          // woff2 dans public/fonts/
  texts: { podiumTitle: string; watermark?: string };
}
```
Les thèmes enfants sont déclarés en `DeepPartial<Theme>` et fusionnés en profondeur avec leur
parent (les tableaux sont remplacés, pas concaténés).

## 2. Résolution du thème
`resolveTheme(date: string /* 'MM-DD' */, forcedId?: string): Theme` — fonction **pure**.

1. `forcedId` (param `?theme=`) connu → ce thème. Inconnu → `console.warn` + continuer.
2. Sinon, thèmes dont la période contient `date` ; s'il y en a plusieurs, `priority` la plus haute.
3. Sinon `base`.

- Comparaison en chaînes `MM-DD` (`from <= date <= to`, ou `date >= from || date <= to` si
  `from > to`). Pas d'objets `Date` → pas de piège de fuseau horaire. `02-29` géré naturellement.
- La date du jour est prise en heure locale ; `?date=YYYY-MM-DD` la simule (debug/tests).
- Résolution refaite **à chaque nouvelle partie** (un stream qui franchit le 1er novembre bascule
  à la partie suivante, jamais en cours de partie).

## 3. Application (`apply.ts`)
`applyTheme(scene, theme)` appelé avant la construction de la carte, seulement si le thème change :
- Supprime les textures du thème précédent (`textures.remove`), sinon fuite mémoire GPU sur un
  long stream.
- Génère des textures aux **clés fixes** (`peg`, `pegGolden`, `bumper`, `spinner`, `ramp`,
  `background`, `ball-rim`, `fx-hit`, `fx-bumper`, `fx-bin`, `fx-confetti`, `ambient`) :
  `DrawFn` → canvas → `textures.addCanvas` ; chemin → chargement d'image.
- Charge la police (`FontFace` + `document.fonts.add`, puis `document.fonts.load`) **avant** de
  dessiner la police bitmap des pop-ups : les glyphes `+0123456789` sont rendus sur un canvas en
  grille fixe et enregistrés via `RetroFont`.
- La scène Game ne connaît **que** ces clés, `theme.ambient` et `palette.marquee` : aucune logique
  par thème dans les scènes.
- Hitbox inchangées : les sprites sont dessinés à la taille de la hitbox définie dans `config.ts`.

## 4. Direction artistique — thème de base
Principe : décor calme et sombre ; le clinquant vient du métal et des lumières, et les réactions
du jeu font le spectacle.

| Élément | Rendu |
|---|---|
| Fond | Laque noire bleutée `#0b0f1a`, léger vignettage, texture de bois laqué très discrète |
| Cadre | Liseré laiton + **marquee** de ~40 ampoules : chenillard lent au repos, frénétique et or sur gros gain |
| Taquet | Clou laiton (dégradé radial or, reflet blanc décalé) ; flash blanc + scale 1.3 au contact |
| Taquet doré | Or vif + glow pulsant lent |
| Bumper | Ampoule : anneau chrome, cœur rouge translucide qui s'allume, anneau d'onde au contact |
| Tourniquet | Croix chrome, moyeu rouge laqué |
| Rampe | Barre laiton biseautée |
| Bille | Acier chromé ; avatar dedans + **reflet spéculaire fixe par-dessus** ; liseré couleur viewer |
| Bacs | Alvéoles sombres, valeur en chiffres or ; gros bacs avec liseré rouge/or ; flash plein à l'entrée |
| Police | **Dela Gothic One** (scores, pop-ups, podium) ; sans-serif sobre pour les noms |
| Accents | Or `#e8b84a`, rouge laque `#c8102e`, chrome `#d8dde6`, blanc réservé aux flashs |
| Filigrane | Kanji discret dans le panneau, 大当り au-dessus du podium |

## 5. Thèmes saisonniers v1

| Thème | Période (priorité) | Palette | Ambiance | Particules | Éléments remplacés | Police · podium |
|---|---|---|---|---|---|---|
| `halloween` | 10-15 → 11-01 | Violet nuit, cuivre orangé, marquee orange/violet | Chauves-souris qui traversent lentement (`across`) + brume légère en bas | Bonbons, étincelles orange | Bumper = citrouille (s'illumine), taquet doré = bonbon | Creepster · « Les plus terrifiants » |
| `hiver` | 12-01 → 02-29 (1) | Bleu glacier, argent, marquee blanc froid | Neige (`down`) | Flocons | Bacs givrés (palette) | Base · « Champions du froid » |
| `noel` extends `hiver` | 12-01 → 12-26 (2) | Rouge/vert/or, marquee guirlande multicolore | Neige (héritée) | Étoiles + flocons | Taquet doré = boule de Noël | Mountains of Christmas · « Joyeux Noël ! » |
| `sakura` | 03-20 → 04-30 | Prune nocturne, rose pâle, laiton conservé | Pétales tournoyants (`down`) | Pétales | Taquet doré = fleur de sakura | Base · « 花見 » en filigrane |
| `plage` | 07-01 → 08-31 | Turquoise, sable, bois clair | Bulles (`up`) | Gouttes, coquillages | Tourniquet = étoile de mer, bumper = bouée | Lilita One · « Rois de la plage » |

Tous les sprites saisonniers sont des `DrawFn` en v1 (formes simples + dégradés, cohérents avec le
rendu métallique). Les billes restent chromées dans tous les thèmes.

**Règles communes**
- Ambiance : dans la scène `Backdrop` (sous Game), ≤ 60 particules, insensible au camera shake, alpha modéré pour ne
  jamais gêner la lecture des billes.
- Un élément remplacé garde exactement la même hitbox.
- Polices auto-hébergées en woff2 dans `public/fonts/` (licences OFL), aucune dépendance réseau en live.

## 6. Fichiers
```
src/themes/
  types.ts          Theme, Palette, DrawFn, SpriteSource, DeepPartial
  resolve.ts        resolveTheme + mergeTheme (pur, sans Phaser)
  resolve.test.ts
  draw.ts           DrawFn partagées (clou, ampoule, croix chrome, bille, citrouille, flocon, pétale…)
  apply.ts          applyTheme(scene, theme) : textures, police, RetroFont
  base.ts halloween.ts hiver.ts noel.ts sakura.ts plage.ts
  index.ts          registre des thèmes
public/fonts/       DelaGothicOne, Creepster, MountainsOfChristmas, LilitaOne (woff2)
public/themes/<id>/ images optionnelles (vide en v1)
```
Nouveaux paramètres d'URL : `theme`, `date` (`YYYY-MM-DD`). Debug : touche **T** = thème suivant.

## 7. Tests (`resolve.test.ts`)
- `10-31` → halloween ; `11-02` → base ; `12-15` → noel ; `12-30` et `01-15` → hiver ;
  `02-29` → hiver ; `03-25` → sakura ; `08-01` → plage ; `06-15` → base.
- `forcedId` connu → ce thème même hors période ; inconnu → résolution par date.
- Fusion : `noel` hérite de `ambient` de `hiver` ; un tableau enfant remplace celui du parent.
- Chaque thème du registre, une fois fusionné, a une palette complète (pas de `undefined`).

## Hors scope
- Sons par thème.
- Changement de thème par commande tchat.
- Thèmes déclenchés par événement de chaîne (anniversaire, raid…).
- Formes physiques différentes par thème.
