import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const git = (args: string) => {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return ''; // archive sans .git : version en x.y.0, sans commit
  }
};
// version affichée dans « À propos » : majeur.mineur de package.json + nombre de commits (une PR fusionnée = +1)
const [major, minor] = json('package.json').version.split('.');
const dep = (name: string): string => json(`node_modules/${name}/package.json`).version;

// base relative : dist/index.html utilisable en « Fichier local » dans OBS
export default defineConfig(({ command }) => ({
  base: './',
  build: { chunkSizeWarningLimit: 2000 },
  define: {
    __BUILD__: JSON.stringify({
      version: `${major}.${minor}.${git('rev-list --count HEAD') || 0}`,
      commit: git('rev-parse --short HEAD'),
      date: new Date().toISOString().slice(0, 10),
      dev: command === 'serve',
      deps: { phaser: dep('phaser'), vite: dep('vite'), typescript: dep('typescript'), vitest: dep('vitest'), playwright: dep('playwright-core') },
    }),
  },
}));
