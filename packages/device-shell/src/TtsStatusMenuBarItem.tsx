import { useState } from 'react';
import { Mic } from 'lucide-react';
import type { PlatformContext } from '@sky-app/kernel';
import type { TtsEnginePort, EffectPresetPort, TtsPort } from '@sky-app/service-contracts';
import { useTtsStatus, TtsStatusPanel, ConfigWindow, ensureTtsEngineI18n } from '@sky-app/tts-engine-ui';
import type { MenuBarExtraItem } from '@sonth87/device-layout';

// Side-effect module-level, chạy đúng 1 lần khi file này được import lần đầu — device-shell
// luôn mount TRƯỚC mọi app (Ceremony/TTS Studio lazy-load theo nhu cầu khi mở cửa sổ), nên
// đây thường là nơi ĐẦU TIÊN cần i18next sẵn sàng để TtsStatusPanel gọi t(...) không lỗi.
ensureTtsEngineI18n();

export interface UseTtsStatusMenuBarItemResult {
  /** Truyền thẳng vào `<DeviceLayout menuBarExtras>`. `null` khi platform không có port
   * 'tts-engine' đăng ký (không nên xảy ra trong sky-app, nhưng an toàn phòng hờ). */
  item: MenuBarExtraItem | null;
  /** Render cùng cấp `<DeviceLayout>` — cửa sổ "Cấu hình" gộp (Models/Engine, Effects,
   * Logs, Settings), tách khỏi `item` vì `MenuBarExtraItem.content` chỉ chứa popover, không
   * chứa modal full-screen. */
  modals: React.ReactNode;
}

/**
 * Icon trạng thái TTS trên menu bar, cạnh đồng hồ hệ thống — hiển thị GLOBAL, không phụ
 * thuộc app nào đang focus (Ceremony hay TTS Studio), vì `menuBarExtras` là prop của chính
 * `<DeviceLayout>` chứ không phải của từng AppModule. Đặt việc lắp ráp ở ĐÚNG MỘT chỗ này
 * (SkyDeviceLayout, nơi platform đã có sẵn) thay vì lặp lại trong mỗi app.
 *
 * TttsStatusPanel/TtsLogPanel (nội dung) đến từ @sky-app/tts-engine-ui — package đó KHÔNG
 * phụ thuộc device-layout, nên FloatingWindow/MenuBarExtraItem (đặc thù chrome desktop)
 * được lắp ráp ở TẦNG NÀY, nơi đã phụ thuộc device-layout sẵn.
 */
export function useTtsStatusMenuBarItem(platform: PlatformContext): UseTtsStatusMenuBarItemResult {
  const enginePort = platform.services.get<TtsEnginePort>('tts-engine');
  const ttsPort = platform.services.get<TtsPort>('tts');
  const effectPresetPort = platform.services.get<EffectPresetPort>('effectPreset');
  const { status, detail } = useTtsStatus(enginePort);
  const canInstall = platform.capabilities.has('tts-local');

  const [configOpen, setConfigOpen] = useState(false);

  if (!enginePort) {
    return { item: null, modals: null };
  }

  const item: MenuBarExtraItem = {
    id: 'tts-status',
    icon: <Mic size={13} />,
    status,
    label: `TTS: ${detail}`,
    content: (
      <TtsStatusPanel
        port={enginePort}
        status={status}
        detail={detail}
        onOpenConfig={() => setConfigOpen(true)}
      />
    ),
  };

  const modals = (
    <ConfigWindow
      open={configOpen}
      onClose={() => setConfigOpen(false)}
      port={enginePort}
      ttsPort={ttsPort}
      effectPresetPort={effectPresetPort}
      canInstall={canInstall}
      assetUrl={platform.assetUrl}
    />
  );

  return { item, modals };
}
