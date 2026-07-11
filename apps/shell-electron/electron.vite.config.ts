import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  main: {
    // @sky-app/slide-shared is bundled inline (ESM workspace source, not a
    // published package) — same as @trao-bang/shared in the source repo.
    plugins: [externalizeDepsPlugin({ exclude: ['@sky-app/slide-shared'] })],
    build: {
      outDir: 'dist-electron/main',
      rollupOptions: {
        input: resolve(__dirname, 'electron/main.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@sky-app/slide-shared'] })],
    build: {
      outDir: 'dist-electron/preload',
      rollupOptions: {
        input: resolve(__dirname, 'electron/preload.ts'),
      },
    },
  },
  renderer: {
    plugins: [react()],
    root: '.',
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: resolve(__dirname, 'index.html'),
      },
    },
  },
});
