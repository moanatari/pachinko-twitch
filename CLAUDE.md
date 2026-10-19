# Pachinko Twitch

Jeu de pachinko 2D lancé en plein écran dans le navigateur (fenêtre capturée par OBS), joué par le streamer
à la souris et par les viewers Twitch (clic via l'extension Heat, ou `!drop` dans le tchat). Voir PLAN.md
pour le design complet et `docs/superpowers/specs/2026-10-02-streamer-mode-design.md` pour le mode streamer.

## Suivi
PLAN.md contient la checklist des étapes (« Avancement » en haut, détail dans « Étapes d'implémentation »).
Travailler étape par étape, relire les points ⚠️ de l'étape avant de coder, et cocher les cases
(sous-tâches, vérif, puis la ligne d'avancement) au fur et à mesure.

## Stack
Vite + TypeScript + Phaser 3.90 (WebGL) avec Matter.js intégré. vitest pour les tests.
Aucun backend, aucun token Twitch.

## Commandes
- `npm run dev` — serveur de dev (clic = bille du streamer, Échap = menu ; `/?debug=1` : touche B = bots, T = thème)
- `npm run build` / `npm run preview` — build statique
- `npm run test` — vitest (mapgen, réglages, état, bans, historique, top du mois, taquets spéciaux, parse IRC)
- `npm run verify` — vérification navigateur du mode streamer (Playwright sur le Chrome installé, dev server lancé)

## Git
`main` = production : chaque push déploie sur GitHub Pages (`pages.yml`, tests puis build). Ne jamais y pousser directement.
`dev` = intégration : tout y est fusionné et testé par un humain avant de partir en production.
- Une branche courte par étape du PLAN (`feat/…`, `fix/…`, `ci/…`), créée depuis `dev` à jour.
- `npm run test` et `npm run verify` verts en local (verify ne tourne pas en CI : Chrome installé + Twitch en direct).
- `gh pr create --fill --base dev`, attendre la CI (`ci.yml` : tests + build), puis `gh pr merge --squash --delete-branch`.
- Mise en production : seulement après test humain de `dev` et accord explicite. PR `dev` → `main`, fusionnée
  avec `gh pr merge --merge` (pas de squash : `dev` et `main` gardent la même histoire ; jamais `--delete-branch`).

## Architecture
- `src/mapgen.ts` : génération procédurale **pure** (seed → éléments). Ne jamais importer Phaser ici.
- `src/game/state.ts` : source de vérité joueurs/scores/billes actives/phase/pause.
- `src/settings.ts` + `src/storage.ts` : réglages persistants (URL > sauvegardé > défaut), localStorage tolérant.
  `params` (config.ts) est le résultat mutable de cette fusion. `src/game/bans.ts`, `src/game/history.ts`, `src/game/monthly.ts` (top du mois) : purs, persistants.
- `src/ui/` : menu DOM du streamer ; n'appelle que l'API publique de `Game` (`admin`, `replay`, `moderate`,
  `applySettings`) et lit l'état, jamais les scènes.
- `src/scenes/Game.ts` : physique + rendu du plateau + juice ; `src/scenes/Hud.ts` : timer, classement, podium.
- Taquets spéciaux : `src/game/specials.ts` (catalogue des effets + tirage, pur) et `src/scenes/specials.ts`
  (taquet allumé, effets, possédé par `Game` comme `Juice`). Spec :
  `docs/superpowers/specs/2026-10-11-timer-top-du-mois-taquets-speciaux-design.md`.
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
- Une bille active max par viewer (plus une bille bonus, taquet spécial) ; plafond global `maxBalls`.
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
