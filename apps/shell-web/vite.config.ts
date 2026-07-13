import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // @tailwindcss/vite processes @sky-app/module-ceremony's styles.css
  // (imported via its "./styles.css" export map entry in src/main.tsx) — it
  // has its own `@import "tailwindcss"` + `@theme` (Tailwind v4 CSS-only
  // config), needs this plugin to expand into real CSS. Same setup as
  // apps/shell-electron/electron.vite.config.ts.
  plugins: [react(), tailwindcss()],
});
