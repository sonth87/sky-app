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
    // @sky-app/ceremony-db stays externalized (require()'d at runtime, not bundled) —
    // it has an "exports.require" entry (dist-cjs/) precisely so this works, because
    // bundling it inline would also try to inline better-sqlite3 (native .node addon),
    // which Rollup cannot statically bundle.
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
    resolve: {
      // Dev-only: trỏ thẳng vào source thay vì package.json's "main" (dist/index.js) —
      // package @sky-app/module-ceremony chưa có script watch/build --watch, nên trước đây sửa
      // modules/ceremony/src không bao giờ tự phản ánh khi chạy `pnpm dev:app` (phải build tay
      // rồi restart). Alias để Vite dev server HMR thẳng TS/TSX nguồn. Production build vẫn dùng
      // "npm run build" bình thường (process.env check để không rò alias vào bản build).
      //
      // PHẢI dùng mảng { find: RegExp, replacement } neo `$` cuối chuỗi — object-form alias
      // (`{ '@sky-app/module-ceremony': ... }`) match theo PREFIX, nên nó ăn luôn cả subpath
      // "@sky-app/module-ceremony/styles.css" (export map riêng, phải trỏ src/styles.css) và nối
      // sai thành 1 đường dẫn không tồn tại → lỗi "Failed to resolve import
      // .../style.css" (bug thật gặp khi áp dụng, 2026-07-23). RegExp neo cuối chỉ khớp specifier
      // ĐÚNG BẰNG "@sky-app/module-ceremony", để "/styles.css" rơi qua package.json's exports map
      // như bình thường.
      alias: process.env.NODE_ENV !== 'production'
        ? [
            { find: /^@sky-app\/module-ceremony$/, replacement: resolve(__dirname, '../../modules/ceremony/src/index.ts') },
            // @sky-app/ui (2026-07-29) — cùng lý do: chưa có script watch/build --watch, và
            // Vite's dependency pre-bundle cache (node_modules/.vite/deps) không tự phát hiện
            // "dist/ vừa build lại" giữa các lần restart dev:app — sửa source rồi build tay vẫn
            // thấy UI CŨ cho tới khi tự tay xoá apps/shell-electron/node_modules/.vite (bug thật
            // gặp khi refactor ColorfulSwatchButton, "picker nằm dưới modal" tưởng chưa fix
            // nhưng thực ra do cache). Alias thẳng vào source để Vite dev server HMR trực tiếp
            // TS/TSX nguồn, không qua dist/ + cache nữa.
            { find: /^@sky-app\/ui$/, replacement: resolve(__dirname, '../../packages/ui/src/index.ts') },
          ]
        : [],
    },
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
