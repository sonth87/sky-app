import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

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
    // @tailwindcss/vite processes @sky-app/module-ceremony's styles.css
    // (imported via its "./styles.css" export map entry in src/main.tsx) —
    // it has its own `@import "tailwindcss"` + `@theme` (Tailwind v4
    // CSS-only config), needs this plugin to expand into real CSS.
    plugins: [react(), tailwindcss()],
    root: '.',
    build: {
      outDir: 'dist',
      rollupOptions: {
        // Multi-page: index.html = mainWindow (device-layout + Ceremony
        // Control), backdrop.html = backdropWindow riêng (kiosk, màn phụ —
        // xem electron/slide/windows.ts's createBackdropWindow).
        input: {
          index: resolve(__dirname, 'index.html'),
          backdrop: resolve(__dirname, 'backdrop.html'),
        },
      },
    },
  },
});
