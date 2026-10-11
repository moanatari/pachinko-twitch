// Menu du streamer : calque DOM au-dessus du canvas. Ne touche jamais aux scènes : API publique de Game
// (admin, replay, moderate, applySettings) + lecture de l'état. Actions sur `pointerdown` : la partie
// « live » est re-rendue 2×/s et un bouton remplacé entre mousedown et mouseup perdrait son `click`.
import type Phaser from 'phaser';
import './menu.css';
import { params, WIDTH } from '../config';
import { THEMES } from '../themes/index';
import { PATTERNS, type PatternId } from '../mapgen';
import { normalizeChannel, formPatch, settingsQuery } from '../settings';
import { EFFECTS } from '../game/specials';
import { users } from '../twitch/users';
import { mmss } from '../scenes/Hud';
import type { Game } from '../scenes/Game';
import type { Theme } from '../themes/types';
import { esc, safeColor, safeImage } from './html';

type Tab = 'game' | 'players' | 'history' | 'settings';
const TABS: [Tab, string][] = [['game', 'Partie'], ['players', 'Joueurs'], ['history', 'Historique'], ['settings', 'Réglages']];
const REFRESH_MS = 500; // au plus 2×/s, menu ouvert seulement
const CURSOR_HIDE_MS = 3000;
const CONFIRM_MS = 3000;
const NO_REPLY_MS = 5000; // Twitch ne répond rien pour une chaîne inexistante
const INVALID_CHANNEL = 'Nom de chaîne invalide (lettres, chiffres et _ uniquement)';
const NO_CHANNEL = 'Entre ta chaîne Twitch';
const APPLY_NOW = 'Nouvelle partie maintenant';
const fr = (n: number) => n.toLocaleString('fr-FR');

export function createMenu(game: Phaser.Game) {
  // les scènes sont instanciées sur 'ready' (asynchrone après new Phaser.Game)
  game.events.once('ready', () => init(game, game.scene.getScene('Game') as Game));
}

function init(game: Phaser.Game, g: Game) {
  const root = document.createElement('div');
  root.className = 'menu-root';
  root.innerHTML = `
    <button class="menu-gear" data-act="toggle" title="Menu (Échap)">⚙</button>
    <div class="menu-backdrop" hidden>
      <div class="menu-panel">
        <nav class="menu-tabs">${TABS.map(([id, label]) => `<button data-tab="${id}">${label}</button>`).join('')}
          <button class="menu-close" data-act="toggle" title="Fermer (Échap)" aria-label="Fermer">✕</button></nav>
        <div class="menu-body"></div>
      </div>
    </div>`;
  document.body.append(root);
  const backdrop = root.querySelector<HTMLElement>('.menu-backdrop')!;
  const body = root.querySelector<HTMLElement>('.menu-body')!;

  let tab: Tab = 'game';
  let open = false;
  let notice = '';
  let search = '';
  let armed: { key: string; until: number } | null = null; // confirmation en deux clics
  let refresh: number | undefined;

  // --- calque aligné sur le canvas (Scale.FIT + centrage) ---
  const fit = () => {
    const r = game.canvas.getBoundingClientRect();
    root.style.transform = `translate(${r.left}px, ${r.top}px) scale(${r.width / WIDTH})`;
  };
  game.scale.on('resize', fit);
  window.addEventListener('resize', fit);
  fit();

  // --- couleurs du thème actif ---
  game.events.on('theme', (t: Theme) => {
    const p = t.palette;
    for (const [k, v] of [['--accent', p.accent], ['--frame', p.frame], ['--text', p.text], ['--bg', p.background]])
      root.style.setProperty(k, v);
  });

  // --- curseur masqué après 3 s d'immobilité (il serait visible à l'image) ---
  let idle: number | undefined;
  const wake = () => {
    document.body.classList.remove('cursor-hidden');
    clearTimeout(idle);
    idle = window.setTimeout(() => document.body.classList.add('cursor-hidden'), CURSOR_HIDE_MS);
  };
  window.addEventListener('pointermove', wake);
  wake();

  const confirmed = (key: string) => {
    if (armed?.key === key && Date.now() < armed.until) {
      armed = null;
      return true;
    }
    armed = { key, until: Date.now() + CONFIRM_MS };
    return false;
  };
  const label = (key: string, text: string) => (armed?.key === key && Date.now() < armed.until ? 'Confirmer ?' : text);

  const avatar = (id: string, color: string) => {
    const url = safeImage(users.get(id)?.avatar);
    return url ? `<img class="menu-avatar" src="${esc(url)}" alt="">` : `<span class="menu-avatar" style="background:${safeColor(color)}"></span>`;
  };

  // --- contenu des onglets : partie statique (formulaire, recherche) + partie « live » re-rendue ---
  const gameHtml = () => {
    const s = g.state;
    const rows: [string, string][] = [
      ['Phase', s.paused ? 'En pause' : s.phase === 'podium' ? 'Podium' : s.waiting ? 'En attente de la première bille' : 'En jeu'],
      ['Temps restant', mmss(s.remainingMs(Date.now()))],
      ['Carte', g.map ? `${g.map.pattern} · seed ${g.map.seed}` : '…'],
      ['Thème', g.theme?.id ?? '…'],
      ['Billes en jeu', `${g.ballCount} / ${params.maxBalls}`],
      ['Joueurs', String(s.players.size)],
      ['Chaîne', params.channel ?? 'aucune'],
    ];
    return `<dl class="menu-info">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <div class="menu-actions">
        <button data-act="pause">${s.paused ? 'Reprendre' : 'Pause'}</button>
        <button data-act="end"${s.phase === 'playing' ? '' : ' disabled'}>Terminer maintenant</button>
        <button data-act="skip">Carte suivante</button>
        <button data-act="replay-current"${g.map ? '' : ' disabled'}>Rejouer cette carte</button>
        <button data-act="start"${s.phase === 'podium' ? '' : ' disabled'}>Démarrer la partie suivante</button>
      </div>
      <p class="menu-hint">Tchat (modos) : !pachinko pause · resume · end · skip · start</p>`;
  };

  const playersHtml = () => {
    const q = search.trim().toLowerCase();
    const all = g.state.top(Infinity);
    const rows = all.map((p, i) => ({ p, rank: i + 1 })).filter(({ p }) => !q || p.name.toLowerCase().includes(q));
    if (!rows.length) return `<p class="menu-empty">${all.length ? 'Aucun joueur trouvé' : 'Aucun joueur pour l\'instant'}</p>`;
    return `<table class="menu-table">
      <thead><tr><th>#</th><th></th><th>Joueur</th><th>Score</th><th>Billes</th><th></th></tr></thead>
      <tbody>${rows.map(({ p, rank }) => {
        const id = esc(p.id), me = g.isStreamer(p.id), inPlay = g.state.hasBall(p.id);
        return `<tr>
          <td>${rank}</td><td>${avatar(p.id, p.color)}</td>
          <td>${esc(p.name)}${me ? ' <small>(toi)</small>' : ''}</td>
          <td>${fr(p.score)}</td>
          <td>${p.balls}${inPlay ? ' <span class="menu-dot" title="Bille en jeu"></span>' : ''}</td>
          <td class="menu-row-actions">
            <button data-act="removeBall" data-id="${id}"${inPlay ? '' : ' disabled'}>Retirer sa bille</button>
            <button data-act="resetScore" data-id="${id}">Score à zéro</button>
            ${me ? '' : `<button class="danger" data-act="ban" data-id="${id}">${label(`ban:${p.id}`, 'Exclure')}</button>`}
          </td></tr>`;
      }).join('')}</tbody></table>`;
  };

  const historyHtml = () => {
    const list = g.history.list;
    if (!list.length) return '<p class="menu-empty">Aucune partie terminée pour l\'instant</p>';
    return `<ul class="menu-history">${list.map((r) => `<li>
        <div><strong>${new Date(r.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</strong>
          · ${esc(r.pattern)} · seed ${r.seed} · ${esc(r.theme)} · ${mmss(r.durationMs)}
          · ${r.players} joueur${r.players > 1 ? 's' : ''}</div>
        <div class="menu-top3">${r.top3.map((p, i) => `${i + 1}. ${esc(p.name)} (${fr(p.score)})`).join(' · ')}</div>
        <button data-act="replay" data-seed="${r.seed}" data-pattern="${esc(r.pattern)}">Rejouer cette carte</button>
      </li>`).join('')}</ul>
      <button class="danger" data-act="clear-history">${label('clear-history', 'Effacer l\'historique')}</button>`;
  };

  const bansHtml = () => {
    const list = g.bans.list;
    if (!list.length) return '<p class="menu-empty">Aucun joueur exclu</p>';
    return `<ul class="menu-bans">${list.map((b) => `<li>${esc(b.name)}
        <small>${esc(b.id)} · ${new Date(b.at).toLocaleDateString('fr-FR')}</small>
        <button data-act="unban" data-id="${esc(b.id)}">Réintégrer</button></li>`).join('')}</ul>`;
  };

  const obsLink = () => `${location.href.split(/[?#]/)[0]}?${settingsQuery(params)}&menu=0`;

  const connText = () => {
    const c = params.channel;
    const typed = normalizeChannel(field('channel').value);
    if (typed === undefined) return INVALID_CHANNEL;
    if (typed !== c) return 'Chaîne modifiée : « Connecter » ou Entrée pour valider'; // sinon abandonnée sans un mot à la fermeture
    if (!c) return 'Non connecté';
    if (g.connected) return `Connecté à #${c}`;
    return Date.now() - g.connectingSince > NO_REPLY_MS ? 'Aucune réponse : vérifie le nom de la chaîne ou ta connexion Internet' : `Connexion à #${c}…`;
  };

  const settingsHtml = () => `
    <p class="menu-notice">${esc(notice)}</p>
    <h3>Chaîne Twitch</h3>
    <div class="menu-link">
      <input name="channel" aria-label="Chaîne Twitch" value="${esc(params.channel ?? '')}" placeholder="ta_chaine" spellcheck="false" autocomplete="off">
      <button data-act="connect">Connecter</button>
    </div>
    <p class="menu-conn" aria-live="polite"></p>
    <div class="menu-form">
      <label>Durée d'une partie (min) <input name="duration" type="number" min="1" max="60" value="${params.duration}"></label>
      <label>Billes en jeu (max) <input name="maxBalls" type="number" min="1" max="500" value="${params.maxBalls}"></label>
      <label>Thème <select name="theme">${[...new Set(['auto', ...Object.keys(THEMES), params.theme])].map((id) => // id inconnu (URL, ancien réglage) : listé, sinon la liste retomberait sur « auto » et l'enregistrerait
        `<option value="${esc(id)}"${id === params.theme ? ' selected' : ''}>${id === 'auto' ? 'Automatique (date)' : esc(id)}</option>`).join('')}</select></label>
      <label class="menu-check"><input name="shake" type="checkbox"${params.shake ? ' checked' : ''}> Secousses de l'écran</label>
      <label class="menu-check"><input name="autoNext" type="checkbox"${params.autoNext ? ' checked' : ''}> Enchaîner les parties automatiquement</label>
      <label>Taquets spéciaux : un toutes les (s, 0 = aucun) <input name="specialEvery" type="number" min="0" max="300" value="${params.specialEvery}"></label>
      ${EFFECTS.map((e) => `<label class="menu-check"><input name="fx-${e.id}" type="checkbox"${params.specialEffects.split(',').includes(e.id) ? ' checked' : ''}> ${esc(e.label)}</label>`).join('')}
    </div>
    <div class="menu-actions">
      <button data-act="apply-now">${APPLY_NOW}</button>
      <button data-act="fullscreen">Plein écran</button>
    </div>
    <p class="menu-hint">Les changements sont enregistrés automatiquement, sauf la chaîne : « Connecter » ou Entrée. Durée, thème et enchaînement prennent effet à la partie suivante : « ${APPLY_NOW} » n'attend pas, mais coupe la partie en cours et ses scores sont perdus (deux clics pour confirmer).</p>
    <h3>Lien pour OBS (sans menu)</h3>
    <div class="menu-link">
      <input name="link" readonly aria-label="Lien pour OBS (sans menu)" value="${esc(obsLink())}">
      <button data-act="copy-link">Copier le lien</button>
    </div>
    <p class="menu-hint">À coller dans une source navigateur OBS : le menu n'y apparaît pas. Il reprend les réglages ci-dessus.</p>
    <h3>Joueurs exclus</h3>
    <div class="menu-live"></div>`;

  function render() {
    for (const b of root.querySelectorAll<HTMLElement>('[data-tab]')) b.classList.toggle('active', b.dataset.tab === tab);
    body.innerHTML = tab === 'settings' ? settingsHtml()
      : tab === 'players' ? `<input class="menu-search" placeholder="Rechercher un joueur" value="${esc(search)}"><div class="menu-live"></div>`
        : '<div class="menu-live"></div>';
    refreshLive();
  }

  function refreshLive() {
    const live = body.querySelector('.menu-live');
    if (!open || !live) return;
    const now = body.querySelector('[data-act="apply-now"]'); // hors de la partie « live » : libellé rafraîchi à part
    if (now) now.textContent = label('apply-now', APPLY_NOW);
    const conn = body.querySelector('.menu-conn');
    const status = conn ? connText() : '';
    if (conn && conn.textContent !== status) conn.textContent = status; // aria-live : pas de réécriture à texte identique
    live.innerHTML = tab === 'game' ? gameHtml() : tab === 'players' ? playersHtml() : tab === 'history' ? historyHtml() : bansHtml();
  }

  function setOpen(on: boolean) {
    if (!on) save();
    open = on;
    backdrop.hidden = !on;
    clearInterval(refresh);
    if (on) {
      render();
      refresh = window.setInterval(refreshLive, REFRESH_MS);
    }
  }

  function setNotice(text: string) {
    notice = text;
    const el = body.querySelector('.menu-notice');
    if (el) el.textContent = text;
  }

  const field = (name: string) => body.querySelector<HTMLInputElement>(`[name="${name}"]`)!;

  /** Enregistrement automatique : à chaque `change`, et avant toute action ou fermeture (saisie en cours).
   *  Ne sauvegarde que les champs modifiés : une surcharge d'URL laissée telle quelle n'est jamais persistée.
   *  La chaîne n'en fait pas partie : un nom à moitié tapé connecterait le jeu au tchat d'un autre (voir `connect`). */
  function save() {
    if (!open || tab !== 'settings') return;
    const patch = formPatch({
      duration: field('duration').value, // champ vidé : valeur inchangée
      maxBalls: field('maxBalls').value,
      theme: field('theme').value,
      shake: field('shake').checked,
      autoNext: field('autoNext').checked,
      specialEvery: field('specialEvery').value, // champ vidé : valeur inchangée
      specialEffects: EFFECTS.filter((e) => field(`fx-${e.id}`).checked).map((e) => e.id).join(','),
    }, params);
    const changed = Object.keys(patch).length > 0;
    if (changed) g.applySettings(patch);
    // valeurs bornées et lien remis à jour sur place : redessiner le formulaire ferait perdre le focus
    for (const k of ['duration', 'maxBalls', 'specialEvery'] as const) field(k).value = String(params[k]);
    field('link').value = obsLink();
    if (changed) setNotice(params.channel ? 'Réglages enregistrés' : NO_CHANNEL);
  }

  /** Chaîne validée par un geste volontaire (bouton ou Entrée) ; champ vidé = déconnexion. */
  function connect() {
    const channel = normalizeChannel(field('channel').value);
    if (channel === undefined) return; // signalé sous le champ (connText)
    g.applySettings({ channel }); // même chaîne qu'en surcharge d'URL : enregistrée quand même ; ne reconnecte que si elle change
    field('channel').value = channel ?? '';
    field('link').value = obsLink();
    setNotice(channel ? 'Réglages enregistrés' : NO_CHANNEL);
  }

  /** Presse-papiers indisponible ou refusé : le champ reste sélectionnable à la main. */
  function copyLink() {
    const link = body.querySelector<HTMLInputElement>('[name="link"]')!.value;
    const failed = () => setNotice('Copie impossible : sélectionne le lien et copie-le à la main');
    if (!navigator.clipboard) return failed();
    const pending = normalizeChannel(field('channel').value) !== params.channel; // le lien porte la chaîne connectée, pas la saisie
    navigator.clipboard.writeText(link).then(() => setNotice(pending ? 'Lien copié, mais la chaîne saisie n\'est pas validée (« Connecter »)' : 'Lien copié'), failed);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    document.documentElement.requestFullscreen()
      // Chrome : sans verrou, Échap quitte le plein écran au lieu d'ouvrir le menu (maintenir Échap pour sortir)
      .then(() => (navigator as Navigator & { keyboard?: { lock(keys: string[]): Promise<void> } }).keyboard?.lock(['Escape']))
      .catch(() => {});
  }

  function act(el: HTMLElement) {
    const id = el.dataset.id ?? '';
    switch (el.dataset.act) {
      case 'toggle': return setOpen(!open);
      case 'pause': g.admin(g.state.paused ? 'resume' : 'pause'); break;
      case 'end': g.admin('end'); break;
      case 'skip': g.admin('skip'); break;
      case 'start': g.admin('start'); break;
      case 'replay-current': if (g.map) g.replay(g.map.seed, g.map.pattern); break;
      case 'replay': {
        const p = el.dataset.pattern ?? '';
        g.replay(Number(el.dataset.seed), (PATTERNS as readonly string[]).includes(p) ? (p as PatternId) : undefined);
        break;
      }
      case 'removeBall': g.moderate('removeBall', id); break;
      case 'resetScore': g.moderate('resetScore', id); break;
      case 'ban': if (confirmed(`ban:${id}`)) g.moderate('ban', id); break;
      case 'unban': g.moderate('unban', id); break;
      case 'clear-history': if (confirmed('clear-history')) g.history.clear(); break;
      // partie commencée (première bille jouée) : ses scores seraient perdus, confirmation en deux clics
      case 'apply-now': if (g.state.phase !== 'playing' || g.state.waiting || confirmed('apply-now')) g.admin('skip'); break;
      case 'connect': connect(); break;
      case 'copy-link': return copyLink();
      case 'fullscreen': return toggleFullscreen();
    }
    refreshLive();
  }

  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-tab]');
    if (!el || el.matches(':disabled')) return;
    save(); // le clic précède le `change` du champ en cours de saisie
    if (el.dataset.tab) {
      tab = el.dataset.tab as Tab;
      render();
    } else act(el);
  });
  body.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (!t.classList.contains('menu-search')) return;
    search = t.value;
    refreshLive();
  });
  // cases et listes : au clic ; nombres : en quittant le champ ou sur Entrée
  body.addEventListener('change', save);
  body.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || (e.target as HTMLInputElement).name !== 'channel') return;
    connect();
    refreshLive();
  });
  window.addEventListener('pagehide', save); // rechargement ou fermeture pendant une saisie : ni `change` ni fermeture du menu
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.repeat) return;
    e.preventDefault();
    setOpen(!open);
  });

  // premier lancement : aucune chaîne ni en réglages ni en URL → le menu guide la saisie (le jeu tourne déjà)
  if (!params.channel) {
    tab = 'settings';
    notice = NO_CHANNEL;
    setOpen(true);
  }
}
