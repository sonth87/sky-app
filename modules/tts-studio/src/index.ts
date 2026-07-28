import type { AppModule } from '@sky-app/kernel';
import { Speech } from 'lucide-react';
import './i18n.js'; // side-effect: khởi tạo i18n cho UI quản lý engine
import { TtsStudioApp } from './TtsStudioApp.js';

export const ttsStudioModule: AppModule = {
  id: 'tts-studio',
  name: 'TTS Studio',
  icon: Speech,
  iconColor: ['#11998e', '#38ef7d'],
  category: 'tools',
  window: {
    defaultSize: { width: 1000, height: 680 },
    minSize: { width: 720, height: 480 },
    // Đặt tên 'Cài đặt' cho khớp Ceremony — cùng một thanh menu, người dùng chuyển
    // qua lại giữa hai app không phải học lại chỗ tìm.
    // Action dispatch qua CustomEvent 'app:menu:action', bắt bằng useMenuAction
    // trong TtsStudioApp (chạy được cả web lẫn Electron).
    menuBarMenus: [
      {
        label: 'Cài đặt',
        items: [
          { key: 'settings-engine', label: 'Quản lý engine…', action: 'settings:engine' },
          { key: 'settings-device', label: 'Thiết bị xử lý…', action: 'settings:device' },
        ],
      },
    ],
  },

  requiredCapabilities: ['tts'],
  requiredServices: ['tts'],
  entitlement: undefined, // miễn phí — nghe/tạo giọng qua tts-service chung, không gate license

  render: TtsStudioApp,
};

export { TtsStudioApp } from './TtsStudioApp.js';
