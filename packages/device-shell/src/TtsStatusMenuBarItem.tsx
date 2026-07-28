import { useState } from 'react';
import { Mic } from 'lucide-react';
import type { PlatformContext } from '@sky-app/kernel';
import type { TtsEnginePort } from '@sky-app/service-contracts';
import { useTtsStatus, TtsStatusPanel, TtsLogPanel, EngineManager, DeviceSettingsModal, ensureTtsEngineI18n } from '@sky-app/tts-engine-ui';
import { FloatingWindow, type MenuBarExtraItem } from '@sonth87/device-layout';

// Side-effect module-level, chạy đúng 1 lần khi file này được import lần đầu — device-shell
// luôn mount TRƯỚC mọi app (Ceremony/TTS Studio lazy-load theo nhu cầu khi mở cửa sổ), nên
// đây thường là nơi ĐẦU TIÊN cần i18next sẵn sàng để TtsStatusPanel gọi t(...) không lỗi.
ensureTtsEngineI18n();

export interface UseTtsStatusMenuBarItemResult {
  /** Truyền thẳng vào `<DeviceLayout menuBarExtras>`. `null` khi platform không có port
   * 'tts-engine' đăng ký (không nên xảy ra trong sky-app, nhưng an toàn phòng hờ). */
  item: MenuBarExtraItem | null;
  /** Render cùng cấp `<DeviceLayout>` — các hộp thoại icon mở ra (Quản lý engine/Thiết bị
   * xử lý/Xem log), tách khỏi `item` vì `MenuBarExtraItem.content` chỉ chứa popover, không
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
  const { status, detail } = useTtsStatus(enginePort);
  const canInstall = platform.capabilities.has('tts-local');

  const [showEngineManager, setShowEngineManager] = useState(false);
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

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
        onManageEngine={() => setShowEngineManager(true)}
        onDeviceSettings={() => setShowDeviceSettings(true)}
        onViewLogs={enginePort.getDebugInfo ? () => setShowLogs(true) : undefined}
      />
    ),
  };

  const modals = (
    <>
      <EngineManager
        open={showEngineManager}
        onClose={() => setShowEngineManager(false)}
        port={enginePort}
        canInstall={canInstall}
      />
      <DeviceSettingsModal
        open={showDeviceSettings}
        onClose={() => setShowDeviceSettings(false)}
        port={enginePort}
        canInstall={canInstall}
      />
      {showLogs && (
        // blocking=false — cửa sổ log là công cụ tiện ích muốn để mở song song, không phải
        // hộp thoại kiểu About cần đóng mới thao tác được app khác. resizable=true + kích
        // thước mặc định lớn hơn — cửa sổ trước đó "hơi nhỏ" cho danh sách log dài.
        // Xem FloatingWindow.tsx.
        <FloatingWindow
          onClose={() => setShowLogs(false)}
          title="TTS Logs"
          width={600}
          height={520}
          blocking={false}
          resizable
          minWidth={420}
          minHeight={320}
          contentClassName="h-full w-full flex-1 min-h-0"
        >
          <TtsLogPanel port={enginePort} />
        </FloatingWindow>
      )}
    </>
  );

  return { item, modals };
}
