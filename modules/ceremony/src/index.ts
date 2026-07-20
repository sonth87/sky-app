import type { AppModule } from '@sky-app/kernel';
import { CeremonyApp } from './CeremonyApp.js';

// Side-effect import — port từ control/main.tsx gốc. i18n.ts khởi tạo i18next
// ngay khi module này được import lần đầu. theme.ts KHÔNG còn side-effect (đã
// refactor để tránh rò rỉ theme ra <html> toàn shell — xem ControlApp.tsx, áp
// theme qua React render thay vì DOM API thủ công lúc module load).
//
// styles.css KHÔNG import ở đây — CSS side-effect import trong 1 package đã
// build (dist/) không resolve được qua bundler của app host (Vite không copy
// .css theo .js khi build lib). Host tự `import '@sky-app/module-ceremony/styles.css'`
// (package.json's "./styles.css" export) ở entry app — xem apps/shell-electron/src/main.tsx.
import './control/i18n.js';

export const ceremonyModule: AppModule = {
  id: 'ceremony',
  name: 'Ceremony',
  icon: 'lucide:GraduationCap',
  category: 'ceremony',
  window: {
    defaultSize: { width: 1280, height: 820 },
    minSize: { width: 960, height: 600 },
    hasMenuBar: true,
    // Dịch từ apps/shell-electron/electron/slide/menu.ts's buildAppMenu (native
    // Electron menu gốc, tiếng Việt) sang menuBarMenus — dispatch qua
    // device-layout's 'app:menu:action' CustomEvent (chạy cả web lẫn Electron),
    // song song window.slide.onMenuAction (Electron native menu cũ, vẫn giữ
    // để tương thích ngược — xem ControlApp.tsx's handleMenuAction).
    //
    // Khác bản gốc 1 chỗ có chủ đích: "Cài đặt" mở rộng đủ 6 tab (bản gốc chỉ
    // có 1 mục trỏ settings:general) — các handler settings:tts/variable/
    // layout/api/backup đã có sẵn trong ControlApp.tsx (dùng cho 1 UI khác
    // trong app), tận dụng luôn cho menu thay vì chỉ 1 mục.
    //
    // Không đưa vào menu: 'develop:*' devtools (devtoolsControl/devtoolsBackdrop
    // gọi thẳng webContents.openDevTools() trong Electron main process, không
    // dispatch qua action string nào cả — không có gì để map sang menuBarMenus).
    menuBarMenus: [
      {
        label: 'Cài đặt',
        items: [
          { key: 'settings-general', label: 'Tổng quát…', action: 'settings:general' },
          { key: 'settings-tts', label: 'TTS…', action: 'settings:tts' },
          { key: 'settings-variable', label: 'Biến tùy chỉnh…', action: 'settings:variable' },
          { key: 'settings-layout', label: 'Layout…', action: 'settings:layout' },
          { key: 'settings-api', label: 'API…', action: 'settings:api' },
          { key: 'settings-backup', label: 'Import/Export Setting…', action: 'settings:backup' },
        ],
      },
      {
        label: 'Dữ liệu',
        items: [
          { key: 'data-import', label: 'Import', action: 'data:import' },
          { key: 'data-export', label: 'Export', action: 'data:export' },
          { key: 'sep1', label: '', separator: true },
          { key: 'data-reset', label: 'Đặt lại', children: [
            { key: 'data-reset-qr', label: 'Danh sách quét QR', action: 'data:reset:qr' },
            { key: 'data-reset-students', label: 'Danh sách sinh viên', action: 'data:reset:students' },
            { key: 'data-reset-cache', label: 'Cache', action: 'data:reset:cache' },
          ]},
        ],
      },
      {
        label: 'Develop',
        items: [
          { key: 'develop-sample-data', label: 'Dùng dữ liệu mẫu', action: 'develop:sampleData' },
          { key: 'develop-api-test', label: 'Giao diện thử nghiệm API', action: 'develop:apiTest' },
        ],
      },
      {
        label: 'Trợ giúp',
        items: [
          { key: 'about', label: 'Về ứng dụng', action: 'about' },
        ],
      },
    ],
    // Phần GIỮA menu tên app "Ceremony" (cột đậm đầu tiên bên trái menu bar,
    // giữa "About Ceremony" và "Quit Ceremony" — cả 2 mục đó CỐ ĐỊNH, không
    // khai báo được). Thay khối placeholder mặc định (Services/Hide/Hide
    // Others/Show All, đều disabled, không có ý nghĩa gì với Ceremony) —
    // @sonth87/device-layout ≥0.2.4 (2026-07-19).
    appNameMenuExtraItems: [
      // Chỉ có tác dụng khi ĐANG ở dashboard 1 Event — MenuBarItem không hỗ trợ ẩn/hiện động
      // theo state runtime (chỉ có `disabled` boolean TĨNH, khai báo 1 lần lúc module load),
      // nên item này LUÔN hiện trong menu — handleMenuAction's case 'event:exitToGate' tự
      // no-op nếu bấm lúc đang ở Gate (activeEvent === null).
      { key: 'event-exit-to-gate', label: 'Thoát ra danh sách đợt lễ', action: 'event:exitToGate' },
    ],
  },

  // window.slide (backend port GĐ4) là bridge Electron-only — chưa có adapter
  // web (đó là việc bọc dần thành TtsPort/DataPort, xem ports-and-adapters.md).
  requiredCapabilities: ['network', 'tts', 'secondary-display'],
  requiredServices: [],

  // Gate theo license (docs/guides/licensing-entitlement.md) — thiếu quyền
  // này thì app hiện mờ/khóa ở dock (packages/device-shell's toDeviceAppConfig).
  entitlement: 'app.ceremony',

  render: CeremonyApp,
};

export { CeremonyApp } from './CeremonyApp.js';
export { ControlApp } from './control/ControlApp.js';
export type { ControlAppProps } from './control/ControlApp.js';

// Backdrop — BrowserWindow kiosk riêng ngoài device-layout (màn phụ), KHÔNG
// phải AppModule trong shell. Host tự mount qua entry riêng — xem
// apps/shell-electron/backdrop.html + src/backdrop-main.tsx.
export { BackdropApp } from './backdrop/BackdropApp.js';
