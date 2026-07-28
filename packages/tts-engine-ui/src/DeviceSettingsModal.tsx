import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import type { TtsEnginePort } from '@sky-app/service-contracts';
import { FloatingWindow } from '@sonth87/device-layout';
import { DeviceConfig } from './DeviceConfig.js';

export interface DeviceSettingsModalProps {
  open: boolean;
  onClose: () => void;
  port: TtsEnginePort;
  canInstall?: boolean;
  engineManagerNotice?: ReactNode;
}

/**
 * Cửa sổ "Thiết bị xử lý" — bản dùng cho app mở từ menu, thay vì nhúng thẳng vào thanh bên.
 *
 * Có sẵn ở đây thay vì để mỗi app tự bọc FloatingWindow quanh DeviceConfig: hai app sẽ
 * dựng ra hai cái cửa sổ khác nhau về kích thước/tiêu đề cho cùng một nội dung.
 *
 * DeviceConfig chạy ở chế độ không thu gọn — đã mở cửa sổ riêng thì không bắt người dùng
 * bấm mở thêm một lớp nữa.
 */
export function DeviceSettingsModal({
  open,
  onClose,
  port,
  canInstall = false,
  engineManagerNotice,
}: DeviceSettingsModalProps) {
  const { t } = useTranslation();
  // FloatingWindow không tự gate theo `open` — xem chú thích tương tự trong EngineManager.tsx.
  if (!open) return null;
  return (
    <FloatingWindow
      onClose={onClose}
      title={t('deviceConfig.title')}
      width={460}
      height={520}
      blocking={false}
      resizable
      minWidth={360}
      minHeight={340}
      contentClassName="flex w-full flex-1 min-h-0 flex-col gap-3 overflow-y-auto p-5"
    >
      <DeviceConfig
        port={port}
        canInstall={canInstall}
        engineManagerNotice={engineManagerNotice}
        collapsible={false}
      />
    </FloatingWindow>
  );
}
