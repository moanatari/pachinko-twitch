# Pachinko Twitch

Jeu de pachinko 2D en navigateur, chargé comme source OBS, contrôlé par les viewers Twitch
(clic via l'extension Heat, ou `!drop` dans le tchat). Voir PLAN.md pour le design complet.

## Suivi
PLAN.md contient la checklist des étapes (« Avancement » en haut, détail dans « Étapes d'implémentation »).
Travailler étape par étape, relire les points ⚠️ de l'étape avant de coder, et cocher les cases
(sous-tâches, vérif, puis la ligne d'avancement) au fur et à mesure.

## Stack
Vite + TypeScript + Phaser 3.90 (WebGL) avec Matter.js intégré. vitest pour les tests.
Aucun backend, aucun token Twitch.

## Commandes
- `npm run dev` — serveur de dev (ouvrir `/?debug=1` pour jouer à la souris, touche B = bots)
- `npm run build` / `npm run preview` — build statique pour OBS
- `npm run test` — vitest (mapgen, parse IRC)

## Architecture
- `src/mapgen.ts` : génération procédurale **pure** (seed → éléments). Ne jamais importer Phaser ici.
- `src/game/state.ts` : source de vérité joueurs/scores/billes actives/phase.
- `src/scenes/Game.ts` : physique + rendu du plateau + juice ; `src/scenes/Hud.ts` : timer, classement, podium.
- `src/twitch/` : `chat.ts` (IRC WebSocket anonyme), `heat.ts` (WebSocket Heat), `users.ts` (lookup + avatars).
- Communication via `game.events` (Phaser EventEmitter), pas de bus maison.
- `src/themes/` : thèmes visuels (spec : `docs/superpowers/specs/2026-10-02-themes-design.md`).
  `resolve.ts` est pur (date `MM-DD` + `?theme=` → thème fusionné) ; `apply.ts` produit des textures
  aux **clés fixes** (`peg`, `bumper`, `ball`, `fx-*`, `ambient`, `digits`…). Les scènes n'utilisent que
  ces clés : aucune logique propre à un thème dans `scenes/`.
- Scènes dans l'ordre : `Backdrop` (fond + ambiance, insensible au shake) → `Game` → `Hud`.

## Intégrations Twitch
- Tchat : `wss://irc-ws.chat.twitch.tv`, login `justinfan<n>`, tags IRCv3 ; `room-id` du ROOMSTATE = id chaîne.
- Heat : `wss://heat-api.j38.net/channel/{roomId}`, x/y normalisés 0–1 (strings). Ids préfixés `A` = ignorés, `U` = anonyme.
- Users : `https://heat-api.j38.net/user/{id}` → `display_name`, `profile_image_url`. Toujours passer par le cache de `users.ts`.

## Règles de perf (non négociables)
- Une bille active max par viewer ; plafond global `maxBalls`.
- Avatars : texture circulaire créée **une fois** par user, jamais de masque par frame.
- Pop-ups et effets : pool d'objets, pas d'allocation dans `update()`.
- Obstacles = corps statiques ; tourniquets kinématiques.
- Vitesse des billes clampée + sous-pas physiques (anti-tunneling).
- Tester toute modif gameplay avec `?debug=1&bots=150` : 60 fps attendus.

## Conventions
- Code et identifiants en anglais, textes affichés en français.
- Valeurs de gameplay (points, tailles, forces, durées) centralisées dans `src/config.ts`.
- Toute nouvelle règle de génération de carte doit être couverte par `mapgen.test.ts`.
- Direction artistique : pachinko japonais sobre et clinquant (laque sombre, laiton, chrome, ampoules).
  Le clinquant vient des réactions du jeu, pas du décor.
- Nouveau thème = `src/themes/<id>.ts` (`ThemeDef` partiel) + entrée dans `themes/index.ts` + une ligne
  dans le test « registre réel ». Un élément re-skinné garde la même hitbox.
- Changement de thème : détruire billes/carte **avant** de supprimer les textures.
