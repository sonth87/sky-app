import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TtsEnginePort, TtsEngines, TtsCapabilities } from '@sky-app/service-contracts';
import type { TtsStatusLevel } from './useTtsStatus.js';

// Khớp đúng hover của MenuDropdown/MenuItemRow trong device-layout ("các menu khác") thay
// vì token bg-muted của sky-app — bg-accent-active là utility CSS toàn cục do device-layout
// định nghĩa (dist-lib/style.css), không phụ thuộc biến CSS nào của sky-app nên hiển thị
// đúng dù render trong Popover.Portal (ngoài cây DOM bình thường của app).
const MENU_ITEM_CLASS =
  'rounded-md px-2 py-1.5 text-left text-xs text-black transition-colors hover:bg-accent-active hover:text-white dark:text-white';

const STATUS_DOT_CLASS: Record<TtsStatusLevel, string> = {
  ok: 'bg-green-500',
  busy: 'bg-yellow-400 animate-pulse',
  error: 'bg-red-500',
  neutral: 'bg-neutral-400',
};

export interface TtsStatusPanelProps {
  port: TtsEnginePort;
  status: TtsStatusLevel;
  detail: string;
  /** Mở cửa sổ "Cấu hình" gộp (ConfigWindow) — thay 3 lối tắt tách rời cũ (Quản lý engine/
   *  Thiết bị xử lý/Xem log) bằng 1 mục duy nhất, cửa sổ đó tự có tab cho từng phần. */
  onOpenConfig: () => void;
}

/**
 * Nội dung popover khi bấm icon trạng thái TTS trên menu bar — trạng thái hiện tại, thông
 * tin engine/thiết bị đang dùng, và 1 lối tắt duy nhất mở cửa sổ "Cấu hình" gộp.
 *
 * Chỉ trả về nội dung THUẦN — không tự bọc Popover/FloatingWindow. Nơi lắp ráp (package
 * device-shell, nơi đã phụ thuộc device-layout) quyết định hiển thị bằng cơ chế nào; package
 * này không biết và không cần biết tới device-layout.
 */
export function TtsStatusPanel({
  port,
  status,
  detail,
  onOpenConfig,
}: TtsStatusPanelProps) {
  const { t } = useTranslation();
  const [engines, setEngines] = useState<TtsEngines | null>(null);
  const [caps, setCaps] = useState<TtsCapabilities | null>(null);

  useEffect(() => {
    void port.listEngines().then(setEngines);
    void port.getCapabilities().then(setCaps);
  }, [port]);

  const currentEngine = engines?.engines.find((e) => e.id === engines.current);
  const statusLabel =
    status === 'ok'
      ? t('ttsStatus.ready')
      : status === 'error'
        ? t('ttsStatus.error')
        : status === 'busy'
          ? t('ttsStatus.starting')
          : t('ttsStatus.unknown');

  return (
    <div className="flex w-64 flex-col gap-3 text-foreground">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${STATUS_DOT_CLASS[status]}`} />
          <span className="text-xs font-semibold">{statusLabel}</span>
        </div>
        {detail && <p className="pl-4 text-2xs text-muted-foreground">{detail}</p>}
      </div>

      <div className="h-px bg-border" />

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-2xs text-muted-foreground">{t('ttsStatus.engine')}</span>
          <span className="text-xs font-medium">{currentEngine?.label ?? '—'}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-2xs text-muted-foreground">{t('ttsStatus.device')}</span>
          <span className="text-xs font-medium">
            {caps ? `${caps.current_providers.join(', ') || 'CPU'} · ${caps.current_threads ? `${caps.current_threads} ${t('ttsStatus.threads')}` : t('ttsStatus.threadsAuto')}` : '—'}
          </span>
        </div>
      </div>

      <div className="h-px bg-border" />

      <div className="flex flex-col gap-0.5">
        <button onClick={onOpenConfig} className={MENU_ITEM_CLASS}>
          {t('ttsStatus.openConfig')}
        </button>
      </div>
    </div>
  );
}
