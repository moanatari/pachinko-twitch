# Spec — Timer à la première bille, top du mois, taquets spéciaux

Complète `PLAN.md` et les specs mode streamer et thèmes. Date : 2026-10-11.

## Contexte et objectif
Trois ajouts indépendants, implémentés dans cet ordre (étapes 13, 14 et 15 de `PLAN.md`) :

1. **Timer à la première bille** : une partie ne commence à décompter que lorsqu'une bille est jouée.
2. **Top du mois** : meilleur score de chaque viewer sur le mois civil, affiché entre les parties.
3. **Taquets spéciaux** : un taquet s'allume de temps en temps et déclenche un effet au premier contact.

**Ce que l'utilisateur a demandé** : garder un mois les meilleurs scores (un par viewer, battable à
chaque partie) et afficher ce classement entre les parties ; ne pas lancer le timer tant qu'aucune bille
(viewer ou streamer) n'a été jouée ; des taquets spéciaux qui apparaissent pendant la partie,
disparaissent au contact et ont des effets variés (bille doublée, gravité lunaire, téléportation,
ralenti des autres billes, plus des idées à trier en jouant).

**Choix validés en brainstorming** : top du mois dans le panneau latéral pendant le podium et l'attente
(le plateau reste dégagé) ; mois civil ; stockage `localStorage` ; un taquet **existant** devient spécial
puis redevient normal (la carte ne change pas de forme) ; un seul taquet spécial à la fois ; chaque
effet désactivable depuis le menu.

**Critères de réussite**
- Une chaîne sans joueur reste sur la même carte, timer figé, sans enchaîner de parties vides.
- Un viewer qui bat son record le voit dans le top du mois dès le podium ; le top survit au rechargement
  de la page et repart de zéro au changement de mois.
- Les effets se trient en direct : cases à cocher dans le menu, prise d'effet immédiate.
- 60 fps à `?debug=1&bots=150`, taquets spéciaux actifs.

## 1. Timer à la première bille

### État (`src/game/state.ts`)
- `start(now, durationMs)` mémorise la durée et passe en **attente** (`waiting === true`) : ni
  `startedAt` ni `endsAt` ne sont fixés.
- `ballStarted(viewer, now)` (nouveau paramètre `now`) : si la partie est en attente, fixe
  `startedAt = now`, `endsAt = now + durationMs` et sort de l'attente.
- En attente : `remainingMs()` renvoie la durée complète ; `tick()` ne renvoie aucune transition ;
  `pause()` / `resume()` ne décalent rien ; `canDrop()` est inchangé (c'est le drop qui lance la partie).
- `endNow(now)` en attente : sort de l'attente avec `startedAt = endsAt = now`. Le podium vide habituel
  suit (« Personne n'a joué… »), puis la carte suivante ; `History.add` ignore déjà les parties sans joueur.
- « Passer » (`admin('skip')`) et « Rejouer » sont inchangés : nouvelle carte, de nouveau en attente.
- La durée réglée dans le menu continue de s'appliquer à la partie suivante.

### Affichage (`src/scenes/Hud.ts`)
- En attente : le timer affiche la durée complète et une ligne « En attente de la première bille »
  apparaît sous lui. Elle disparaît à la première bille.

## 2. Top du mois

### Données (`src/game/monthly.ts`, pur, stockage injecté comme `history.ts`)
```ts
interface MonthlyEntry { id: string; name: string; color: string; score: number; at: number }
// localStorage 'pachinko-monthly' : { month: 'YYYY-MM', entries: MonthlyEntry[] }
class Monthly {
  constructor(kv: KV | null);
  record(players: Iterable<Player>, now: number): void; // garde le max par viewer
  top(n: number, now: number, live?: Iterable<Player>): MonthlyEntry[];
  remove(id: string): void;
}
```
- Le mois est le mois civil en heure locale, dérivé de `now`. Si le mois stocké diffère du mois courant,
  la table est vide : `record` la remplace, `top` renvoie `[]` (ou les seuls scores `live`).
- `record` : pour chaque joueur de score > 0, crée l'entrée ou la remplace si le score est strictement
  supérieur (nom, couleur et date mis à jour). Un score égal ou inférieur ne change rien.
- `top` : tri par score décroissant, puis par `at` croissant (le premier à avoir atteint le score est
  devant). Avec `live`, le classement est calculé comme si `record(live)` avait eu lieu, sans rien écrire.
- **Exclus** : les viewers anonymes de Heat (id préfixé `U`), dont l'identité ne dure pas d'une session
  à l'autre.
- Seules les 500 meilleures entrées sont conservées. Données illisibles ou invalides → table vide.

### Intégration (`src/scenes/Game.ts`)
- `readonly monthly = new Monthly(this.kv)`, exposé au Hud par le registre (`'monthly'`), comme `'state'`.
- `recordGame()` appelle `monthly.record(state.players.values(), now)` : même moment et même garde
  « une seule fois » que l'historique. **Rien n'est enregistré en `?debug=1`** (bots, parties de test) ;
  le Hud n'y fusionne pas non plus les scores `live`, pour ne pas afficher des bots qui disparaîtraient.
- `moderate('ban', id)` appelle `monthly.remove(id)`. `resetScore` ne touche que la partie en cours.
- Le streamer est un joueur comme les autres.
- Avatars : après `recordGame()` et à la fin de `loadGame()`, les entrées du top 10 sans texture
  reçoivent la bille de repli (`fallbackKey`) et passent par `fetchIdentity` (cache de `users.ts`).

### Affichage (`src/scenes/Hud.ts`)
- Le panneau est en mode **top du mois** quand `phase === 'podium'` ou que la partie est en attente ;
  il revient au classement en direct à la première bille.
- Titre : « TOP DU MOIS · OCTOBRE » (nom du mois courant) à la place de « CLASSEMENT ». Mêmes dix
  lignes, mêmes animations : `renderTop` reçoit la liste à afficher au lieu de lire `state.top`.
- Pendant le podium, la liste est `monthly.top(10, now, state.players.values())` : les scores de la
  partie qui se termine y figurent déjà, et bougent encore tant que des billes tombent. Pendant
  l'attente, c'est `monthly.top(10, now)`.
- Top vide : les dix rangs restent estompés, comme un classement sans joueur.
- Le podium sur le plateau est inchangé.

## 3. Taquets spéciaux

### Règles
- **Un seul** taquet spécial à la fois. Il apparaît `specialEvery` secondes après la fin du précédent
  (touché ou expiré), et la première fois `specialEvery` secondes après la première bille.
- Taquet choisi au hasard parmi les taquets non dorés de la carte. L'effet est tiré au hasard parmi
  les effets activés, au moment de l'apparition : la couleur du taquet l'annonce.
- Non touché au bout de `SPECIAL_TTL_MS` (20 s) : il s'éteint et le compte à rebours repart.
- Au contact : l'effet se déclenche pour la bille qui l'a touché, le taquet redevient normal, et le
  contact rapporte les points d'un taquet normal. Un texte « NOM · EFFET » s'affiche au point d'impact.
- Aucune apparition pendant l'attente, la pause ou le podium. Au passage au podium et à chaque nouvelle
  carte, le taquet spécial s'éteint et tous les effets en cours sont annulés (gravité, vitesses, textures
  et points remis à la normale).
- Les tirages utilisent `Math.random`, pas le seed de la carte : rejouer une carte donne la même carte,
  pas les mêmes taquets spéciaux.

### Effets
Durées et forces dans `src/config.ts`.

| Id | Nom affiché | Effet |
|---|---|---|
| `double` | BILLE BONUS | Une 2e bille au nom du viewer part du taquet, vitesse horizontale opposée. |
| `moon` | GRAVITÉ LUNAIRE | Gravité du monde à 30 % pendant 6 s, pour tout le monde. |
| `warp` | TÉLÉPORTATION | La bille repart du haut du plateau à une abscisse aléatoire, vitesse nulle. |
| `slow` | RALENTI | Les billes des autres viewers en jeu à cet instant sont ralenties (×0,4) pendant 5 s. |
| `x2` | POINTS ×2 | Tous les points du viewer sont doublés pendant 10 s. |
| `gold` | PLUIE D'OR | Tous les taquets valent `PTS_PEG_GOLDEN` et prennent la texture dorée pendant 8 s. |
| `quake` | SÉISME | Chaque bille en jeu reçoit une impulsion vers le haut ; secousse d'écran si `shake`. |

- `double` : la bille bonus compte dans le plafond `maxBalls` ; l'effet n'est pas tiré quand le plafond
  est atteint. `GameState` compte les billes **par viewer** (`Map<id, nombre>` à la place du `Set`) :
  `canDrop` refuse tant qu'il en reste une, le plafond porte sur le total, et une nouvelle méthode
  `extraBall(id)` ajoute la bille bonus sans compter une bille jouée de plus. `moderate('removeBall')`
  retire déjà toutes les billes du viewer.
- Un effet déjà en cours qui est redéclenché repart pour sa durée complète (pas de cumul).
- `slow` : une bille lâchée pendant l'effet n'est pas ralentie. Repose sur `body.timeScale` de Matter
  (vérifié dans le Matter de Phaser 3.90 : `Body.update` multiplie le pas par `timeScale` et corrige la
  vitesse au changement).
- `warp` : l'ancre anti-blocage de la bille est réinitialisée.
- `x2` et `gold` se cumulent (un taquet vaut alors 20 points pour le viewer). Le pop-up affiche les
  points réellement marqués.

### Code
- `src/game/specials.ts` (pur, testé) : la liste `EFFECTS` (id, nom affiché, couleur), et le tirage
  `pickEffect(enabled, canDouble, rnd)` → id ou `null` si aucun effet n'est tirable.
- `src/scenes/specials.ts` : classe `Specials`, possédée par `Game` comme `Juice`. Elle tient le compte
  à rebours, le taquet allumé et les échéances des effets en cours, dans un état de taille fixe (aucune
  allocation dans `update()`). `Game` lui donne ce dont les effets ont besoin (billes, taquets, monde
  physique, `drop`).
- `Game` : `onCollision` signale le contact avec le taquet allumé ; `score()` applique le multiplicateur
  `x2` et la valeur `gold` ; `update()` appelle `specials.update(delta)` (figé en pause, puisque la scène
  l'est) ; le passage au podium et `loadGame()` appellent `specials.clear()` — dans `loadGame()`,
  **avant** `clearMap()`, qui détruit les images des taquets.
- Coût : une image et un halo de plus à l'écran ; chaque effet parcourt les billes ou les taquets une
  fois au début et une fois à la fin, jamais à chaque frame.

### Visuel
- Nouvelle texture à clé fixe `pegSpecial`, produite par `themes/apply.ts` (dessin neutre, teintable),
  posée **par-dessus** l'image du taquet, teintée de la couleur de l'effet, avec un halo additif pulsant
  (`fx-glow`). L'image du taquet lui-même n'est pas modifiée : le flash de contact de `Juice` efface la
  teinte d'un taquet, et la pluie d'or change sa texture. **Même hitbox** : le corps physique n'est pas
  touché.
- Aucune logique propre à un thème dans `scenes/` : les couleurs des effets viennent de `EFFECTS`.
- Le texte d'annonce réutilise le pool d'étiquettes de `Juice`.

### Réglages (`src/settings.ts`, menu Réglages)
```ts
specialEvery: number;   // secondes entre deux taquets spéciaux, 0–300, défaut 20 ; 0 = désactivé
specialEffects: string; // ids activés, séparés par des virgules, ordre de EFFECTS ; défaut : tous
```
- `specialEffects` est une chaîne pour passer tel quel par les mécanismes existants (comparaison de
  `formPatch`, surcharge d'URL `?specialEffects=moon,warp`). Ids inconnus ignorés ; chaîne vide =
  aucun effet, donc aucun taquet spécial.
- Menu : un champ « Taquets spéciaux : toutes les (s) » et une case à cocher par effet.
- Prise d'effet immédiate : le prochain tirage lit `params`.

## Tests
- `state.test.ts` : attente (pas de transition, `remainingMs` complet, première bille, pause sans
  décalage, `endNow`), compteur de billes par viewer et `extraBall`.
- `monthly.test.ts` : maximum par viewer, égalité, changement de mois, `remove`, fusion `live` sans
  écriture, exclusion des anonymes, plafond de 500, données corrompues.
- `settings.test.ts` : bornes de `specialEvery`, nettoyage de `specialEffects`, surcharge d'URL.
- `specials.test.ts` : `pickEffect` (effets désactivés, `double` écarté au plafond, liste vide).
- Navigateur : `npm run verify` reste vert ; vérification manuelle des sept effets et de la perf à
  `?debug=1&bots=150`.

## Hors périmètre
- Bouton « vider le top du mois » dans le menu, consultation des mois précédents.
- Top du mois partagé entre machines ou navigateurs (aucun backend).
- Effets écartés : bille géante (se coince dans l'écart minimal entre obstacles), aimant vers le gros
  bac (force à appliquer à chaque frame).
- Taquets spéciaux générés par `mapgen.ts` : la génération de carte n'est pas modifiée.
