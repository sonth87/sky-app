import type { AppModule } from '@sky-app/kernel';
import { CeremonyApp } from './CeremonyApp.js';

// Side-effect imports — port từ control/main.tsx gốc. i18n.ts khởi tạo
// i18next, theme.ts áp theme đã lưu lên <html> ngay khi module load (tránh
// FOUC), cả 2 chạy 1 lần khi module này được import lần đầu.
//
// styles.css KHÔNG import ở đây — CSS side-effect import trong 1 package đã
// build (dist/) không resolve được qua bundler của app host (Vite không copy
// .css theo .js khi build lib). Host tự `import '@sky-app/module-ceremony/styles.css'`
// (package.json's "./styles.css" export) ở entry app — xem apps/shell-electron/src/main.tsx.
import './control/i18n.js';
import './control/theme.js';

export const ceremonyModule: AppModule = {
  id: 'ceremony',
  name: 'Ceremony',
  icon: 'lucide:GraduationCap',
  category: 'ceremony',
  window: {
    defaultSize: { width: 1280, height: 820 },
    minSize: { width: 960, height: 600 },
  },

  // window.slide (backend port GĐ4) là bridge Electron-only — chưa có adapter
  // web (đó là việc bọc dần thành TtsPort/DataPort, xem ports-and-adapters.md).
  requiredCapabilities: ['network', 'tts', 'secondary-display'],
  requiredServices: [],

  render: CeremonyApp,
};

export { CeremonyApp } from './CeremonyApp.js';
export { ControlApp } from './control/ControlApp.js';
export type { ControlAppProps } from './control/ControlApp.js';

// Backdrop — BrowserWindow kiosk riêng ngoài device-layout (màn phụ), KHÔNG
// phải AppModule trong shell. Host tự mount qua entry riêng — xem
// apps/shell-electron/backdrop.html + src/backdrop-main.tsx.
export { BackdropApp } from './backdrop/BackdropApp.js';
