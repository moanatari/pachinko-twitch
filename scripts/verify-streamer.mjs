// Vérification navigateur du mode streamer (spec §8), sur le Chrome installé en headless.
// Usage : `npm run dev` dans un terminal, puis `npm run verify [-- http://localhost:5173/]`.
import { chromium } from 'playwright-core';

const URL = process.argv[2] ?? 'http://localhost:5173/';
const G = `window.game.scene.getScene('Game')`;
const viewer = (id) => `{ id: '${id}', name: '${id}', color: '#ff0000' }`;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, permissions: ['clipboard-read', 'clipboard-write'] });
const errors = [];
const open = async (query) => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${URL}${query}`);
  await page.waitForFunction(`!!${G}?.map`);
  return page;
};
const remaining = (page) => page.evaluate(`${G}.state.remainingMs(Date.now())`);
const H = `window.game.scene.getScene('Hud')`;
const entry = (id, score) => `{ id: '${id}', name: '${id}', color: '#ff0000', score: ${score}, scoredAt: 1, balls: 1 }`;
const inMonthly = (page, id) => page.evaluate(`${G}.monthly.top(500, Date.now()).some((e) => e.id === '${id}')`);
const S = `${G}.specials`;
const gravityY = (page) => page.evaluate(`${G}.matter.world.localWorld.gravity.y`);

// 1. Premier lancement → menu ouvert sur Réglages
let page = await open('?debug=1');
check('premier lancement : menu ouvert', await page.isVisible('.menu-backdrop'));
check('premier lancement : onglet Réglages', (await page.textContent('.menu-tabs .active')) === 'Réglages');
check('premier lancement : message', (await page.textContent('.menu-notice')).includes('Entre ta chaîne Twitch'));

// 1 bis. Le streamer ne peut pas s'exclure, même sous son identité provisoire après l'arrivée du room-id
check('drop du streamer provisoire', await page.evaluate(`${G}.requestDrop(${G}.streamer, 500)`));
await page.evaluate(`${G}.monthly.record([${entry('streamer', 3)}], Date.now())`);
await page.evaluate(`${G}.setStreamer('999', 'x'); ${G}.moderate('ban', 'streamer')`);
check('streamer provisoire : non excluable', !(await page.evaluate(`${G}.bans.isBanned('streamer')`)));
check('streamer provisoire : retiré du top du mois', !(await inMonthly(page, 'streamer')));

// 2. Chaîne saisie → persistée après rechargement
await page.fill('input[name=channel]', 'Pachinko_Test');
await page.press('input[name=channel]', 'Enter');
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('pachinko-settings')));
check('enregistrement auto : sur Entrée, menu resté ouvert', (await saved())?.channel === 'pachinko_test' && await page.isVisible('.menu-backdrop'));
check('enregistrement auto : plus de bouton Enregistrer', (await page.locator('[data-act=save]').count()) === 0);
await page.uncheck('input[name=shake]');
check('enregistrement auto : case à cocher au clic', (await saved()).shake === false);
await page.check('input[name=shake]');
await page.fill('input[name=duration]', '999');
await page.press('input[name=duration]', 'Enter');
check('enregistrement auto : valeur bornée remise dans le champ', (await page.inputValue('input[name=duration]')) === '60');
await page.fill('input[name=channel]', 'bad name');
await page.fill('input[name=duration]', '7');
await page.keyboard.press('Escape'); // fermer enregistre la saisie en cours
check('enregistrement auto : à la fermeture, chaîne invalide ignorée', (await saved()).duration === 7 && (await saved()).channel === 'pachinko_test');
await page.keyboard.press('Escape');
await page.fill('input[name=duration]', '5');
await page.click('[data-tab=game]'); // changer d'onglet aussi
check('enregistrement auto : au changement d\'onglet', (await saved()).duration === 5);
await page.click('[data-tab=settings]');
// 2 a. Lien copiable : adresse de la page + tous les réglages enregistrés + menu=0, sans les paramètres de dev
const link = await page.inputValue('input[name=link]');
check('lien : adresse de la page, chaîne et réglages', link.startsWith(`${URL}?channel=pachinko_test&`)
  && ['duration=5', 'maxBalls=150', 'theme=auto', 'shake=1', 'autoNext=1', 'specialEvery=20', 'specialEffects='].every((p) => link.includes(p))
  && link.endsWith('&menu=0') && !link.includes('debug'), link);
await page.click('[data-act=copy-link]');
await page.waitForFunction(`document.querySelector('.menu-notice').textContent === 'Lien copié'`);
check('lien : copié dans le presse-papiers', (await page.evaluate(() => navigator.clipboard.readText())) === link);
await page.reload();
await page.waitForFunction(`!!${G}?.map`);
check('chaîne persistée', await page.evaluate(() => JSON.parse(localStorage.getItem('pachinko-settings')).channel) === 'pachinko_test');
check('2e lancement : menu fermé', !(await page.isVisible('.menu-backdrop')));
// 2 bis. Timer en attente tant qu'aucune bille n'est jouée
const w1 = await remaining(page);
await page.waitForTimeout(1200);
check('attente : timer figé avant la première bille', (await page.evaluate(`${G}.state.waiting`)) && (await remaining(page)) === w1, `${w1} ms`);
// 2 bis'. « Nouvelle partie maintenant » : immédiat tant qu'aucune bille n'est jouée
const seedWaiting = await page.evaluate(`${G}.map.seed`);
await page.keyboard.press('Escape');
await page.click('[data-tab=settings]');
await page.click('[data-act=apply-now]');
check('nouvelle partie : sans confirmation avant la première bille',
  await page.waitForFunction(`${G}.map && ${G}.map.seed !== ${seedWaiting}`, null, { timeout: 5000 }).then(() => true, () => false));
await page.keyboard.press('Escape');

// 2 ter. Top du mois affiché pendant l'attente
await page.evaluate(`${G}.monthly.record([${entry('42', 777)}], Date.now()); window.game.events.emit('player', '42')`);
await page.waitForFunction(`${H}.lines.some((l) => l.id === '42')`);
check('attente : top du mois affiché', await page.evaluate(`${H}.title.text.startsWith('TOP DU MOIS')`));

// 3. Pause : timer gelé, drops refusés, billes conservées après une longue pause
check('drop avant pause', await page.evaluate(`${G}.requestDrop(${viewer('v0')}, 300)`));
check('première bille : timer lancé', !(await page.evaluate(`${G}.state.waiting`)));
await page.waitForFunction(`${H}.title.text === 'CLASSEMENT'`);
check('première bille : classement en direct', !(await page.evaluate(`${H}.lines.some((l) => l.id === '42')`)));
await page.evaluate(`${S}.apply('moon', [...${G}.balls.values()][0])`);
check('gravité lunaire appliquée', (await gravityY(page)) < 1);
await page.keyboard.press('Escape');
await page.click('[data-tab=game]');
await page.click('[data-act=pause]');
const t1 = await remaining(page);
await page.waitForTimeout(9000); // > STUCK_KILL_MS
check('pause : timer gelé', (await remaining(page)) === t1, `${t1} ms`);
check('pause : drop refusé', !(await page.evaluate(`${G}.requestDrop(${viewer('v1')}, 400)`)));
await page.click('[data-act=pause]'); // Reprendre
await page.waitForTimeout(300);
check('reprise : bille conservée', (await page.evaluate(`${G}.ballCount`)) >= 1);
check('pause : effet à durée gelé', (await gravityY(page)) < 1, 'gravité lunaire encore active après 9 s de pause');
const t2 = await remaining(page);
await page.waitForTimeout(1100);
check('reprise : timer repart', (await remaining(page)) < t2);

// 4. Exclure empêche un drop (clics pendant les rafraîchissements 2×/s)
check('drop viewer', await page.evaluate(`${G}.requestDrop(${viewer('v1')}, 400)`));
await page.click('[data-tab=players]');
await page.evaluate(`${G}.monthly.record([${entry('v1', 5)}], Date.now())`);
await page.click('[data-act=ban][data-id=v1]'); // arme
await page.click('[data-act=ban][data-id=v1]'); // confirme
check('exclu : retiré du classement', !(await page.evaluate(`${G}.state.players.has('v1')`)));
check('exclu : drop refusé', !(await page.evaluate(`${G}.requestDrop(${viewer('v1')}, 400)`)));
check('exclu : ban persisté', await page.evaluate(() => localStorage.getItem('pachinko-bans').includes('"v1"')));
check('exclu : retiré du top du mois', !(await inMonthly(page, 'v1')));
await page.click('[data-tab=settings]');
await page.click('[data-act=unban][data-id=v1]');
check('réintégré : drop accepté', await page.evaluate(`${G}.requestDrop(${viewer('v1')}, 400)`));

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

// 5. Historique alimenté après une partie de 1 min
await page.fill('input[name=duration]', '1');
const seedBefore = await page.evaluate(`${G}.map.seed`);
await page.click('[data-act=apply-now]'); // arme
check('nouvelle partie : confirmation si la partie a commencé',
  (await page.textContent('[data-act=apply-now]')) === 'Confirmer ?' && (await page.evaluate(`${G}.map.seed`)) === seedBefore);
await page.click('[data-act=apply-now]'); // confirme
await page.waitForFunction(`${G}.state.remainingMs(Date.now()) > 55000 && ${G}.state.remainingMs(Date.now()) <= 60000`);
check('durée 1 min appliquée', true);
check('carte suivante : effets annulés', await page.evaluate(
  `${G}.matter.world.localWorld.gravity.y === 1 && !${S}.gold && ${S}.mult('v3') === 1`));
await page.evaluate(`${G}.requestDrop(${viewer('v2')}, 700)`);
// 5 bis. Fin de partie : une bille lâchée juste avant 0:00 est retirée, le score ne bouge plus
await page.waitForFunction(`!${G}.state.waiting && ${G}.state.remainingMs(Date.now()) < 800`, null, { timeout: 100_000 });
check('drop juste avant la fin', await page.evaluate(`${G}.requestDrop(${viewer('v4')}, 700)`));
await page.waitForFunction(`${G}.state.phase === 'podium'`);
const total = () => page.evaluate(`[...${G}.state.players.values()].reduce((n, p) => n + p.score, 0)`);
const frozen = await total();
check('fin de partie : plus aucune bille', (await page.evaluate(`${G}.ballCount`)) === 0);
await page.waitForTimeout(2000);
check('fin de partie : score figé', (await total()) === frozen, `${frozen} pts`);
await page.waitForFunction(`${G}.history.list.length > 0`, null, { timeout: 100_000 });
const rec = await page.evaluate(`${G}.history.list[0]`);
check('historique : partie enregistrée', rec.players >= 1 && rec.top3.some((p) => p.id === 'v2'), JSON.stringify(rec.top3));
check('debug : rien d\'enregistré dans le top du mois', !(await inMonthly(page, 'v2')));
await page.click('[data-tab=history]');
check('historique : affiché', await page.isVisible('.menu-history li'));
await page.click('.menu-close');
check('croix : menu fermé', !(await page.isVisible('.menu-backdrop')));
await page.close();

// 5 ter. Lien pour OBS : aucun menu, même sans chaîne
page = await open('?debug=1&menu=0&channel=');
check('menu=0 : aucun menu', (await page.locator('.menu-root').count()) === 0);
await page.close();

// 6. FPS à 150 billes, menu fermé puis ouvert
page = await open('?debug=1&bots=150&specialEvery=2');
await page.evaluate(`(() => {
  const s = ${S}, apply = s.apply.bind(s);
  window.__fx = 0;
  s.apply = (id, ball) => { window.__fx++; apply(id, ball); };
})()`);
await page.waitForTimeout(8000);
const fps = async () => {
  let sum = 0;
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(500); sum += await page.evaluate('window.game.loop.actualFps'); }
  return Math.round(sum / 6);
};
const closed = await fps();
const fx = await page.evaluate('window.__fx');
check('taquets spéciaux : déclenchés par les billes', fx > 0, `${fx} effets en ~11 s`);
await page.keyboard.press('Escape');
await page.click('[data-tab=players]');
const opened = await fps();
check('150 billes : FPS menu fermé / ouvert', opened >= closed * 0.9, `${closed} / ${opened} fps (${await page.evaluate(`${G}.ballCount`)} billes)`);

// 6 bis. Changement de thème pendant une pluie d'or : textures remplacées sans erreur
await page.evaluate(`${S}.apply('gold', [...${G}.balls.values()][0])`);
const goldOn = await page.evaluate(`${S}.gold`);
const themeBefore = await page.evaluate(`${G}.theme.id`);
await page.evaluate(`${G}.nextTheme()`);
await page.waitForFunction(`${G}.theme.id !== '${themeBefore}' && !!${G}.map`);
await page.waitForTimeout(1000);
check('changement de thème pendant une pluie d\'or', goldOn && !(await page.evaluate(`${S}.gold`)),
  `${themeBefore} → ${await page.evaluate(`${G}.theme.id`)}`);

check('aucune erreur JS', errors.length === 0, errors.join(' | '));
await browser.close();
