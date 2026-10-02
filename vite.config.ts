import { defineConfig } from 'vite';

// base relative : dist/index.html utilisable en « Fichier local » dans OBS
export default defineConfig({ base: './', build: { chunkSizeWarningLimit: 2000 } });
