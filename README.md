# Pachinko Twitch

Jeu de pachinko 2D dans le navigateur. Le streamer le lance en plein écran, y joue à la souris, et OBS
capture la fenêtre. Les viewers lâchent leur bille en cliquant sur le stream (extension Twitch **Heat**)
ou en tapant `!drop` dans le tchat. Parties chronométrées, classement en direct, podium, carte
procédurale différente à chaque partie.

Aucun backend, aucun token Twitch : le tchat est lu en anonyme.

## Prérequis

- Node.js 22 ou plus récent
- Chrome ou Firefox

## Lancer le jeu (sans Twitch)

```bash
npm install
npm run dev
```

Ouvrir <http://localhost:5173/>.

Au premier lancement, le menu s'ouvre sur l'onglet **Réglages** et demande ta chaîne Twitch. Le jeu tourne
déjà : ferme le menu avec **Échap** et clique sur le plateau. Chaque clic lâche ta bille (une seule à la
fois, comme pour les viewers).

### Mode debug

Ouvrir <http://localhost:5173/?debug=1> :

| Touche / paramètre | Effet |
|---|---|
| `B` | +10 bots qui relancent leur bille en continu |
| `T` | thème suivant |
| `?debug=1&bots=150` | 150 bots dès le départ (test de perf : 60 fps attendus) |

Le compteur FPS / billes s'affiche en haut à gauche. Pour simuler un viewer depuis la console du navigateur :

```js
game.scene.getScene('Game').requestDrop({ id: 'v1', name: 'Viewer1', color: '#ff0000' }, 500)
```

### Forcer une carte, un thème, une date

| Paramètre | Exemple | Effet |
|---|---|---|
| `seed` | `?seed=42` | même carte à chaque fois |
| `pattern` | `?pattern=trous` | `classique`, `symetrique`, `diagonale`, `trous`, `entonnoirs` |
| `theme` | `?theme=noel` | `base`, `halloween`, `hiver`, `noel`, `sakura`, `plage` |
| `date` | `?date=2026-10-31` | thème choisi comme si on était à cette date |

Les réglages du menu peuvent aussi être passés dans l'URL pour une session (ils ne sont alors pas
sauvegardés) : `channel`, `duration` (minutes), `maxBalls`, `shake=0`, `autoNext=0`.

## Jouer avec Twitch

1. Dans le menu (**Échap** ou roue crantée en bas à droite) → **Réglages** → saisir le login de la chaîne
   → **Enregistrer**. C'est mémorisé pour les lancements suivants.
2. Bouton **Plein écran** (ou F11), puis capturer la fenêtre du navigateur dans OBS.
3. Pour les clics des viewers : installer l'extension **Heat** sur la chaîne. Le mapping des clics suppose
   un plein écran 16:9.

**Viewers** : `!drop` (position aléatoire) ou `!drop 0-100` (position en % de la largeur du plateau).

**Modérateurs** : `!pachinko pause`, `resume`, `end`, `skip`, `start` (`stop` = `pause`).

**Menu du streamer** :
- **Partie** : pause, terminer, carte suivante, rejouer la carte, démarrer la suivante.
- **Joueurs** : retirer une bille, remettre un score à zéro, exclure.
- **Historique** : les 50 dernières parties, avec « Rejouer cette carte ».
- **Réglages** : chaîne, durée, nombre de billes max, thème, secousses, enchaînement auto, joueurs exclus.

Réglages, exclusions et historique sont gardés dans le `localStorage` du navigateur.

## Build

```bash
npm run build      # build statique dans dist/
npm run preview    # sert dist/ en local
```

## Tests

```bash
npm test           # tests unitaires (vitest)
npm run verify     # vérification navigateur du mode streamer, avec `npm run dev` lancé à côté
```

`npm run verify` pilote le Chrome installé en headless (Playwright) : premier lancement, réglages
persistés, pause, exclusion, historique, FPS à 150 billes menu fermé / ouvert. Il se connecte au tchat
de la chaîne de test `pachinko_test` en lecture anonyme.

## Pour aller plus loin

- `PLAN.md` : design complet et avancement.
- `docs/superpowers/specs/` : spec des thèmes et du mode streamer.
- `CLAUDE.md` : architecture et règles du projet.
