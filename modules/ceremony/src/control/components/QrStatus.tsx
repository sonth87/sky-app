import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useControlStore } from '../store';

/** Cửa sổ coi máy quét còn "online": có lần quét trong N giây gần đây */
const QR_ONLINE_WINDOW_MS = 60_000;

export function QrStatus() {
  const { t } = useTranslation();
  const lastScan = useControlStore((s) => s.lastScan);
  const [, tick] = useState(0);

  // Cập nhật mỗi 10s để badge tự chuyển sang offline khi lâu không quét
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  const online =
    lastScan != null && Date.now() - new Date(lastScan.ts).getTime() < QR_ONLINE_WINDOW_MS;

  return (
    <span
      className={`flex items-center gap-1.5 text-xs ${
        online ? 'text-success' : 'text-muted-foreground'
      }`}
      title={lastScan ? t('qrStatus.lastScanAt', { time: new Date(lastScan.ts).toLocaleTimeString() }) : t('qrStatus.noScanYet')}
    >
      <span className={`h-2 w-2 rounded-full ${online ? 'bg-success' : 'bg-muted'}`} />
      {online ? t('qrStatus.active') : t('qrStatus.waiting')}
    </span>
  );
}
