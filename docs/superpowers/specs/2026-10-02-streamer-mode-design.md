# Spec — Mode streamer : jeu plein écran + menus

Complète `PLAN.md` et la spec thèmes. Date : 2026-10-02.

## Contexte et objectif
Le jeu ne vise plus une « source navigateur OBS » pilotée par l'URL : il tourne dans un **navigateur
classique en plein écran** (Chrome ou Firefox) et OBS **capture la fenêtre**. Le streamer lance le jeu,
**y joue lui-même en cliquant**, et dispose de **menus et de listes** pour configurer, piloter et modérer.

**Ce que l'utilisateur a demandé** : jeu lancé et joué par le streamer dans le navigateur, menus et
listes accessibles en jeu, oublier l'intégration OBS. **Choix validés en brainstorming** : menus en
overlay dans le jeu (visibles des viewers), réglages persistants + contrôle de partie + listes +
modération, streamer = joueur comme les autres, historique et bans persistants (localStorage),
menus en HTML/CSS par-dessus le canvas.

**Critères de réussite**
- Premier lancement sans aucun paramètre d'URL : le menu guide la saisie de la chaîne, puis le jeu
  fonctionne ; au lancement suivant, tout est mémorisé.
- Le streamer peut tout faire depuis le menu (configurer, pause, terminer, carte suivante, rejouer une
  carte, consulter et modérer les joueurs, consulter l'historique) sans toucher à l'URL.
- Le gameplay, le tchat, Heat, les avatars et les thèmes existants restent inchangés pour les viewers.
- Aucune régression de perf : 60 fps à 150 billes, menu fermé ; menu ouvert, pas de chute visible.

## 1. Lancement et affichage
- `index.html` ouvert dans le navigateur ; plein écran via un bouton du menu (Fullscreen API) ou F11.
- Fond opaque (plus de `transparent: true`), `Scale.FIT` 16:9 (bandes noires si l'écran n'est pas 16:9).
- Curseur masqué après 3 s sans mouvement de souris (il serait visible à l'image), réaffiché au mouvement.
- Premier lancement (aucune chaîne en réglages ni en URL) : menu ouvert sur l'onglet **Réglages** avec
  le message « Entre ta chaîne Twitch ». Le jeu tourne déjà (le streamer peut jouer seul).
- Heat : en plein écran 16:9, l'image capturée = la fenêtre du jeu → le mapping actuel des clics
  (`x` normalisé sur la largeur du plateau) reste valide. Fenêtre non 16:9 ou capture partielle :
  hors scope (déjà noté dans PLAN.md).

## 2. Réglages persistants (`src/settings.ts`, pur)
```ts
interface Settings {
  channel: string | null;   // login Twitch, minuscules
  duration: number;         // minutes, 1–60, défaut 5
  maxBalls: number;         // 1–500, défaut 150
  theme: string;            // 'auto' ou id d'un thème du registre
  shake: boolean;           // défaut true
  autoNext: boolean;        // enchaînement automatique des parties, défaut true
}
```
- `loadSettings(storage)`, `saveSettings(storage, s)`, `mergeSettings(defaults, saved, urlParams)` :
  validation et bornes réutilisant `clampInt` de `config.ts` ; valeurs invalides → défaut.
- Priorité : **paramètres d'URL** (pour la session, non sauvegardés) > **réglages sauvegardés** > défauts.
  `debug`, `bots`, `seed`, `pattern`, `date` restent des paramètres d'URL uniquement.
- `params` (objet global actuel) devient le résultat de cette fusion et reste lu par le code existant.
- Application à chaud via `game.applySettings(next)` :

| Réglage | Prise d'effet |
|---|---|
| `channel` | Fermeture propre des sockets tchat + Heat, puis reconnexion à la nouvelle chaîne |
| `maxBalls`, `shake` | Immédiate |
| `duration`, `theme`, `autoNext` | Partie suivante (bouton « Appliquer maintenant » = carte suivante) |

- `socket.ts` gagne une fermeture définitive (`close()` qui stoppe la reconnexion) ; `connectChat` /
  `connectHeat` renvoient une fonction de déconnexion.

## 3. Interface (`src/ui/`)
- `ui/menu.ts` + `ui/menu.css` : calque DOM au-dessus du canvas (élément frère du canvas, `position:
  fixed`). Ouverture/fermeture : **Échap** ou bouton roue crantée discret (bas du panneau latéral,
  opacité réduite). Pendant que le menu est ouvert, les clics ne lâchent pas de bille.
- Panneau modal centré (~1000 × 720 px à l'échelle du jeu), fond laque translucide + flou léger,
  liseré laiton, titres en Dela Gothic One, texte en sans-serif ; couleurs du thème actif via variables
  CSS (`--accent`, `--frame`, `--text`, `--bg`) mises à jour sur l'événement `theme`.
- Quatre onglets : **Partie**, **Joueurs**, **Historique**, **Réglages**.
- Le menu ne touche jamais aux scènes : il appelle l'API publique de `Game` (`admin`, `moderate`,
  `applySettings`, `replay`) et écoute `game.events`.
- Le menu ouvert ne met pas le jeu en pause (choix explicite via le bouton Pause).

## 4. Contrôle de partie (onglet « Partie »)
| Action | Effet | Tchat (mods) |
|---|---|---|
| Pause / Reprendre | Gel complet : physique, timer, animations ; drops refusés ; bandeau « PAUSE » | `!pachinko pause` / `resume` (`stop` = alias de `pause`) |
| Terminer maintenant | Fin immédiate → podium | `!pachinko end` |
| Carte suivante | Nouvelle partie, nouvelle seed | `!pachinko skip` |
| Rejouer cette carte | Nouvelle partie, même seed et même pattern | — |
| Démarrer | Lance la partie suivante si `autoNext` est désactivé (podium figé jusque-là) | `!pachinko start` |

- `GameState.pause(now)` / `resume(now)` : `endsAt` décalé de la durée de la pause (et la fin du podium
  aussi) ; `canDrop` faux en pause ; `tick` sans effet en pause.
- Commandes reçues pendant un chargement (`loading`) : mises en file et rejouées à la fin du chargement.
- Infos affichées : phase, temps restant, pattern, seed, thème actif, billes en jeu / max.

## 5. Listes et modération
**Onglet « Joueurs »** (partie en cours)
- Classement complet : rang, avatar, nom, score, billes jouées, pastille « bille en jeu ».
- Recherche par nom ; rafraîchi au plus 2×/s et seulement menu ouvert.
- Actions : **Retirer sa bille** (via `removeBall`), **Score à zéro**, **Exclure** (confirmation ; retire
  la bille, retire le joueur du classement, ajoute aux bans).
- `GameState` compte les billes jouées par joueur (`balls`) et expose `resetScore(id)`, `remove(id)`.

**Bans** (`game/bans.ts`, pur, persistant)
- `{ id, name, at }[]` ; `isBanned(id)` testé dans `requestDrop` (point d'entrée unique : tchat, Heat,
  souris) → refus silencieux.
- Liste en bas de l'onglet Réglages avec « Réintégrer ». Ids anonymes `U…` acceptés. Le streamer ne peut
  pas s'exclure.

**Onglet « Historique »** (`game/history.ts`, pur, persistant)
- 50 dernières parties (FIFO) : `{ at, durationMs, pattern, seed, theme, players, top3: {id,name,score}[] }`.
- Enregistrement à la fin du podium (classement final, billes tardives comptées). Partie sans joueur :
  non enregistrée.
- Affichage du plus récent au plus ancien ; « Rejouer cette carte » (seed + pattern) ; « Effacer
  l'historique » avec confirmation.

## 6. Le streamer joue
- Clic sur le plateau (hors menu) → `requestDrop` avec l'identité du streamer : id = `room-id` de la
  chaîne (reçu du tchat), nom + avatar via `users.resolve`. Sans chaîne ou avant le `room-id` :
  `{ id: 'streamer', name: 'Streamer' }`.
- Mêmes règles que tout le monde (une bille à la fois, classement).
- Les clics souris ne sont plus réservés au debug ; `?debug=1` garde les bots, la touche B, la touche T
  et le compteur FPS.

## 7. Stockage
- Une couche `src/storage.ts` : `readJson(key, fallback)` / `writeJson(key, value)` protégées par
  try/catch (stockage indisponible ou plein → mémoire seulement, le jeu continue). Clés :
  `pachinko-settings`, `pachinko-history`, `pachinko-bans` (et `pachinko-users` existant).

## 8. Tests
- `settings.test.ts` : défauts, bornes, valeurs invalides, priorité URL > sauvegardé > défaut, URL non
  sauvegardée, stockage corrompu.
- `state.test.ts` étendu : pause/reprise (timer gelé, podium décalé, `canDrop` faux), billes jouées,
  `resetScore`, `remove`.
- `history.test.ts` : cap à 50 (FIFO), ordre, partie vide ignorée, persistance, stockage corrompu.
- `bans.test.ts` : ban/unban, persistance, doublons.
- `chat.test.ts` étendu : `pause`, `resume`, `end`, `start`, `skip`, `stop` (alias de `pause`).
- Vérification navigateur (Playwright headless sur le Chrome installé) : premier lancement → menu
  Réglages ; saisie de chaîne → persistée après rechargement ; Pause gèle le timer ; Exclure empêche un
  drop ; historique alimenté après une partie de 1 min ; FPS à 150 billes menu fermé/ouvert.

## Hors scope
- Panneau de contrôle dans une fenêtre séparée, raccourcis clavier configurables.
- Classement cumulé all-time, export/import des données.
- Sons, récompenses (points de chaîne, bits), événements de chaîne.
- Calibration Heat hors plein écran 16:9.
