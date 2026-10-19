// Onglet « À propos » : version (calculée au build, voir vite.config.ts), technos et dépôt.
const REPO = 'https://github.com/moanatari/pachinko-twitch';

export function aboutHtml(): string {
  const b = __BUILD__;
  const date = b.date.split('-').reverse().join('/');
  return `
    <h3>Pachinko Twitch</h3>
    <dl class="menu-info">
      <dt>Version</dt><dd>v${b.version}${b.commit ? ` · ${b.commit}` : ''} · ${date}${b.dev ? ' (dev)' : ''}</dd>
      <dt>Langages</dt><dd>TypeScript, HTML, CSS</dd>
      <dt>Moteur</dt><dd>Phaser ${b.deps.phaser} (WebGL), Matter.js intégré</dd>
      <dt>Outils</dt><dd>Vite ${b.deps.vite} · TypeScript ${b.deps.typescript} · vitest ${b.deps.vitest} · Playwright ${b.deps.playwright}</dd>
      <dt>Twitch</dt><dd>Tchat IRC anonyme, extension Heat</dd>
      <dt>Code source</dt><dd><a href="${REPO}" target="_blank" rel="noopener">${REPO.replace('https://', '')}</a></dd>
    </dl>`;
}
