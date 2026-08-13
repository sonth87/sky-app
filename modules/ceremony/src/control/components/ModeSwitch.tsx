import { useTranslation } from 'react-i18next';
import { useControlStore } from '../store';
import { useSocketRef } from '../SocketContext';

export function ModeSwitch() {
  const { t } = useTranslation();
  const mode = useControlStore((s) => s.mode);
  const socket = useSocketRef();

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase text-muted-foreground">{t('modeSwitch.label')}</span>
      <div className="inline-flex overflow-hidden rounded-md border border-border">
        {(['auto', 'manual'] as const).map((m) => (
          <button
            key={m}
            onClick={() => socket.current?.emit('cmd:setMode', { mode: m })}
            className={`px-3 py-1.5 text-sm ${
              // Dùng --primary (đổi theo palette đang chọn ở Cài đặt giao diện) thay vì --info
              // (màu xanh CỐ ĐỊNH, không đổi theo theme — xác nhận qua styles.css, --info chỉ
              // khai trong :root/.dark, không có trong bất kỳ khối [data-theme=...] nào) — phản
              // hồi thật 2026-07-29: nút Auto/Manual phải theo đúng màu theme ceremony đang chọn.
              mode === m ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-muted'
            }`}
          >
            {m === 'auto' ? t('modeSwitch.auto') : t('modeSwitch.manual')}
          </button>
        ))}
      </div>
    </div>
  );
}
