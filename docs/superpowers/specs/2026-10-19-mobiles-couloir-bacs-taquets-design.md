# Spec — Éléments mobiles, couloir du bas, bacs qui défilent, taquets à valeur, billes d'animation

Complète `PLAN.md` et les specs mode streamer, thèmes et taquets spéciaux. Date : 2026-10-19.

## Contexte et objectif
Six ajouts, implémentés dans cet ordre (étapes 19 à 24 de `PLAN.md`), une branche et une PR chacun :

19. **Taquets à valeur** : taquets à 1, 5, 10, 30 et 50 points, du plus courant au plus rare.
20. **Barres bumpers et hélices longues** : nouvel obstacle en barre, hélices de deux tailles.
21. **Éléments mobiles** : bumpers, barres et hélices en aller-retour linéaire entre deux points.
22. **Couloir du bas** : bande au-dessus des bacs où des éléments font des allers-retours sur toute la largeur.
23. **Bacs qui défilent** : la bande des valeurs des bacs tourne à intervalle réglable.
24. **Billes d'animation** : pendant l'attente du premier joueur, des billes factices animent le plateau.

L'ordre suit les dépendances : le couloir réutilise les mobiles, qui réutilisent les barres.

**Ce que l'utilisateur a demandé** : des bumpers et des hélices qui se déplacent linéairement entre deux
points, sans taquet sur leur trajectoire ; des éléments mobiles en bas du terrain, au-dessus des bacs et
sous la zone de taquets, sur toute la largeur (un seul en aller-retour, ou deux qui se partagent chacun une
moitié sur une carte symétrique), qui peuvent être des bumpers, des barres ou des hélices ; des hélices plus
longues ; des bacs qui changent de place toutes les 30 s ; des taquets à 1, 5, 10, 30 et 50 points, du moins
rare au plus rare ; des billes factices pendant l'attente d'un joueur, hors classement et sans points ;
des barres bumpers.

**Choix validés en brainstorming**
- Bacs : les séparateurs restent fixes, la bande des valeurs **défile** en carrousel (animée), toutes les
  30 s ou 1 min (réglable, désactivable). Une seule bande, y compris sur la carte symétrique (sa symétrie
  de bacs est perdue après le premier défilement). Le jackpot ne tombe jamais au bord.
- Mobiles : **2 à 4 par carte** (hors couloir), le trajet entier est interdit aux taquets.
- Couloir du bas : **sur toutes les cartes**, avec un réglage pour le couper.
- Taquets à valeur : **nombres fixes par carte**, toujours **exactement un** taquet à 50.
- Billes factices : à la première vraie bille, elles **se figent puis éclatent en particules**.
- Modèle de données : un champ `move` optionnel sur les éléments existants (pas de tableau de mobiles
  séparé, pas de tweens Phaser sur les corps).

**Critères de réussite**
- Chaque carte générée est valide (`validateMap` vide) pour tous les motifs, avec et sans couloir.
- Aucune bille ne reste coincée par un mobile : il reste toujours un passage d'au moins `MIN_GAP`.
- Une chaîne sans joueur montre un plateau vivant (billes factices, bacs qui défilent), et le classement
  reste vide tant que personne n'a joué.
- 60 fps à `?debug=1&bots=150`, couloir et 4 mobiles actifs.

## 1. Données de carte (`src/mapgen.ts`, pur)

```ts
interface Move { x2: number; y2: number; periodMs: number; phase: number } // aller-retour (x,y) ↔ (x2,y2)
interface Peg     { x: number; y: number; value: PegValue }                  // remplace `golden`
type PegValue = 1 | 5 | 10 | 30 | 50;
interface Bumper  { x: number; y: number; radius: number; move?: Move }
interface Spinner { x: number; y: number; radius: number; speed: number; move?: Move } // radius court ou long
interface Bar     { x: number; y: number; length: number; angle: number; move?: Move } // barre bumper, centre + angle
type LaneEl = ({ kind: 'bumper' } & Bumper) | ({ kind: 'bar' } & Bar) | ({ kind: 'spinner' } & Spinner);
interface MapData { /* existant */ bars: Bar[]; lane: LaneEl[] }
generateMap(seed, pattern?, bounds?, opts?: { lane?: boolean }) // lane = true par défaut
```

- `phase` ∈ [0, 1) : position de départ dans le cycle. Les paires miroir partagent la même phase.
- Les éléments du couloir ont tous un `move`.

### Géométrie
- Barre : capsule de longueur `length`, rayon `BAR_THICK / 2`.
- Élément mobile : la forme vérifiée est la **capsule balayée** de (x, y) à (x2, y2), de rayon égal au
  rayon de l'élément (le rayon de balayage pour une hélice, la demi-longueur plus la demi-épaisseur pour
  une barre). Toutes les règles existantes (écart `MIN_GAP`, murs, spawn, bande des bacs) s'appliquent
  à cette capsule sans cas particulier. Une barre mobile ne tourne pas.
- `validateMap` inclut barres, mobiles (capsules balayées) et éléments du couloir.

### Ordre de génération
1. **Bacs** : inchangé.
2. **Couloir** (si `opts.lane`) : bande de hauteur `LANE_H` juste au-dessus de la bande `BIN_CLEAR`. La
   zone de jeu (`playBottom`) remonte de `LANE_H` ; aucun autre élément n'y est posé. Contenu tiré parmi
   bumper rond, barre horizontale (`LANE_BAR_LEN`) et hélice (normale ou longue) :
   - carte non symétrique : un élément, trajet d'un mur à l'autre en gardant `MIN_GAP` aux murs ;
   - carte symétrique : deux éléments identiques en miroir, chacun sur sa moitié, qui gardent `MIN_GAP`
     entre eux au centre et aux murs.
   - Période d'un aller-retour : `LANE_PERIOD_MS` (plus lente que les mobiles du plateau).
3. **Déflecteurs muraux** : inchangé.
4. **Mobiles** : `MOVERS_MIN`..`MOVERS_MAX` (2 à 4) bumpers, barres ou hélices, posés **avant** le motif.
   Trajet de `MOVE_LEN_MIN`..`MOVE_LEN_MAX` (150 à 350 px), angle tiré surtout près de l'horizontale.
   Période de `MOVE_PERIOD_MIN`..`MOVE_PERIOD_MAX` (4 à 8 s l'aller-retour). En symétrique, des paires
   miroir (une ou deux), mouvement miroir ; un mobile sur l'axe garde un trajet vertical.
5. **Motif** : les cinq générateurs actuels, inchangés dans leur logique. Là où ils posent un bumper, ils
   peuvent poser une barre (≈ 1 fois sur 3, angle libre, `BAR_LEN_MIN`..`BAR_LEN_MAX` = 90 à 160 px).
   Toute hélice est longue (`SPINNER_R_LONG` ≈ 75) avec une probabilité ≈ 1/3, et tourne alors à
   `SPINNER_LONG_SPEED` fois la vitesse (plus lente).
6. **Valeurs des taquets** : tirées après la pose de tous les taquets, en nombres fixes proportionnels
   au nombre `n` de taquets : 5 pts ≈ 7 %, 10 pts ≈ 3 %, 30 pts ≈ 1 % (au moins 1), 50 pts **exactement 1**.
   Les taquets à 30 et 50 sont espacés d'au moins `RARE_PEG_SPACING`. En symétrique, les valeurs sont en
   miroir (comptes des paliers 5, 10 et 30 arrondis à la paire) et le 50 est posé sur un taquet de l'axe
   central ; s'il n'en existe aucun, le générateur ajoute un taquet sur l'axe à un endroit libre.

### Bacs
`binShifts(points: number[]): number[]` : décalages `k` de rotation (`points[(i - k + n) % n]`) qui ne
mettent pas le jackpot (500) en position 0 ou n−1. Pur, contient toujours 0.

### Rejouer
Avec le couloir, une même seed ne donne pas la même carte selon le réglage. « Rejouer » utilise le
réglage courant ; l'option n'est pas stockée dans l'historique.

## 2. Jeu (`src/scenes/`)

### Barres bumpers (`Game.ts`)
- Corps rectangle statique à bouts arrondis (`chamfer`), label `bumper`, image `bar` étirée à la longueur.
- Rebond : normale depuis le point de la barre le plus proche de la bille, biaisée vers le haut comme le
  bumper rond, vitesse `BUMPER_SPEED`. Points `PTS_BUMPER`, juice du bumper (lueur au contact).

### Hélices longues
Même corps en croix, rayon long. La texture `spinner` est dessinée par taille (bras fins à toute
longueur) : clé fixe `spinnerLong` ajoutée au thème de base, hitbox inchangée par rapport au rayon.

### Mobiles
- `movers: { body, img, glow?, halo?, x, y, move }[]` construit avec la carte. À chaque sous-pas :
  `t` avance du pas, `p = (1 − cos(2π·(t/period + phase))) / 2`, position = (x, y) + p·(x2 − x, y2 − y),
  appliquée par `matter.body.setPosition(body, pos, true)` (élan transmis, comme `setAngle` des hélices).
- Images, lueurs et halos suivent le corps après les sous-pas, sans allocation par frame.
- Une hélice mobile tourne et se déplace. Tout se fige en pause (temps de scène).
- Le couloir utilise exactement le même chemin.

### Taquets à valeur
- Textures aux clés fixes : `peg` (1), `peg5` (chrome), `pegGolden` (10), `peg30` (rouge laqué),
  `peg50` (blanc éclatant). Halo pour 30 et 50 (gros halo pulsant pour 50). Chaque thème peut les
  repeindre (`ThemeDef` partiel), sinon il hérite du thème de base.
- Points = valeur du taquet. Pop-up et étincelles plus grosses avec la valeur.
- Taquets spéciaux : seuls les taquets à 1 point sont candidats (`Game.pegs`).
- Pluie d'or : les taquets à moins de 10 points paient 10 et prennent la texture `pegGolden` ; à la fin,
  chacun retrouve **sa** texture (aujourd'hui `endGold` remet `peg` partout).

### Bacs qui défilent (`src/scenes/bins.ts`, possédé par `Game` comme `Specials`)
- Chaque bac a son fond, son texte et son liseré (gros bacs) créés une fois par carte ; les séparateurs
  et capteurs ne bougent pas.
- Minuterie en temps de scène, active en partie et en attente, figée en pause, arrêtée au podium.
  Intervalle `params.binScroll` secondes (0 = désactivé, relu à chaque échéance).
- Échéance : décalage non nul tiré dans `binShifts` (sens et amplitude aléatoires) ; les `points` des
  capteurs changent immédiatement. La bande glisse en `BIN_SCROLL_MS` (≈ 800 ms, accélération et
  freinage) ; un bac qui sort d'un côté réapparaît en fondu de l'autre ; flash bref de la bande. Pas de
  masque.

### Billes d'animation (`src/scenes/attract.ts`, possédé par `Game`)
- Actives si `params.attract` et `state.waiting` et pas en pause : une bille toutes les
  `ATTRACT_EVERY_MS` (≈ 1,5 s), x aléatoire, au plus `ATTRACT_MAX` (6) à la fois.
- Une bille factice est une `Ball` avec `fake: true` : texture de bille du thème sans avatar, alpha
  réduit, pas d'étiquette de pseudo. Elle ne passe pas par `requestDrop` et ne touche jamais `GameState`
  (pas de classement, de top du mois, de timer, de `maxBalls`).
- Collisions : juice seulement (pulse des obstacles et des bacs, étincelles), aucun score, aucune pop-up,
  aucun taquet spécial. Ralenti et séisme les ignorent. `removeBall` ne notifie pas `GameState` pour
  elles et n'émet pas `ballFinished`.
- Première vraie bille (fin de l'attente) : les factices deviennent statiques, puis éclatent en particules
  du pool `Juice` après `ATTRACT_POP_MS` (≈ 400 ms) et sont retirées. Elles reviennent à la prochaine
  attente. Nouvelle carte ou thème : retirées avec les autres billes.

## 3. Réglages (`src/settings.ts`, menu, URL, lien OBS)

| Clé | Valeurs | Défaut | Prise d'effet |
|---|---|---|---|
| `binScroll` | secondes, 0 = désactivé ; menu : désactivé / 30 s / 1 min ; URL 0–300 | 30 | immédiate |
| `lane` | booléen (`lane=0` dans l'URL) | `true` | carte suivante |
| `attract` | booléen (`attract=0` dans l'URL) | `true` | immédiate |

`settingsQuery` les inclut automatiquement (lien OBS).

## 4. Configuration (`src/config.ts`)
Toutes les nouvelles valeurs y sont centralisées : `PEG_VALUES` et leurs proportions, `RARE_PEG_SPACING`,
`BAR_THICK`, `BAR_LEN_MIN/MAX`, `SPINNER_R_LONG`, `SPINNER_LONG_SPEED`, `MOVERS_MIN/MAX`,
`MOVE_LEN_MIN/MAX`, `MOVE_PERIOD_MIN/MAX`, `LANE_H`, `LANE_BAR_LEN`, `LANE_PERIOD_MS`, `BIN_SCROLL_MS`,
`ATTRACT_EVERY_MS`, `ATTRACT_MAX`, `ATTRACT_POP_MS`. `PTS_PEG_GOLDEN` disparaît au profit des valeurs.

## 5. Tests et vérification
- `mapgen.test.ts`, sur une centaine de seeds et pour chaque motif, avec et sans couloir :
  carte valide ; 2 à 4 mobiles hors couloir ; couloir présent ssi l'option ; passage ≥ `MIN_GAP` aux deux
  bouts du trajet du couloir (et entre les deux éléments au centre en symétrique) ; aucun taquet dans une
  capsule balayée ; exactement un « 50 » et comptes des paliers conformes ; écart entre taquets rares ;
  miroir des valeurs et des mouvements en symétrique ; présence de barres et d'hélices longues sur
  l'ensemble des seeds ; `binShifts` ne met jamais le jackpot au bord.
- `settings.test.ts` : défauts, bornes, URL et sauvegarde des trois réglages.
- `npm run verify` : en attente, des billes factices tombent et le classement reste vide ; elles
  disparaissent à la première bille ; avec `binScroll`, la valeur d'un capteur change après un défilement.
- Perf : 60 fps à `?debug=1&bots=150`, couloir et 4 mobiles actifs.

## Hors périmètre
- Rampes mobiles (seuls bumpers, barres et hélices bougent).
- Barres qui tournent en se déplaçant.
- Stocker l'option « couloir » dans l'historique pour un « Rejouer » exact.
