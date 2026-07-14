import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useControlStore } from '../../store';
import { Dot } from './Dot';
import { StatusPopover } from './StatusPopover';
import { StatRow } from './statusRow';

const QR_ONLINE_WINDOW_MS = 60_000;

export function QrChip({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const lastScan = useControlStore((s) => s.lastScan);
  const scanLog = useControlStore((s) => s.scanLog);
  const [, tick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  const online =
    lastScan != null && Date.now() - new Date(lastScan.ts).getTime() < QR_ONLINE_WINDOW_MS;
  const label = online ? t('statusBar.qr.active') : t('statusBar.qr.waiting');

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 px-2 hover:bg-muted h-full transition-colors"
        title={t('statusBar.qr.tooltip')}
      >
        <Dot color={online ? 'green' : 'slate'} />
        <span>{label}</span>
      </button>
      <StatusPopover open={open} onClose={onToggle} className="right-0 min-w-[400px] max-w-[450px]">
        <div className="px-3 py-2 border-b border-border font-semibold text-foreground">
          {t('statusBar.qr.title')}
        </div>
        <div className="px-3 py-2 space-y-1">
          <StatRow
            label={t('statusBar.qr.status')}
            value={online ? t('statusBar.qr.statusActive') : t('statusBar.qr.statusWaiting')}
            accent={online ? 'green' : 'slate'}
            tooltip={t('statusBar.qr.statusTooltip')}
          />
          {lastScan ? (
            <>
              <StatRow
                label={t('statusBar.qr.lastScan')}
                value={new Date(lastScan.ts).toLocaleTimeString('vi-VN')}
                tooltip={t('statusBar.qr.lastScanTooltip')}
              />
              <StatRow
                label={t('statusBar.qr.student')}
                value={`${lastScan.student.full_name} (${lastScan.student.student_code})`}
                tooltip={t('statusBar.qr.studentTooltip')}
              />
            </>
          ) : (
            <StatRow
              label={t('statusBar.qr.lastScan')}
              value={t('statusBar.qr.none')}
              tooltip={t('statusBar.qr.lastScanTooltip')}
            />
          )}
          <StatRow
            label={t('statusBar.qr.totalScanned')}
            value={t('statusBar.qr.totalScannedValue', { count: scanLog.length })}
            tooltip={t('statusBar.qr.totalScannedTooltip')}
          />
          <StatRow
            label={t('statusBar.qr.description')}
            value={t('statusBar.qr.descriptionValue')}
            tooltip={t('statusBar.qr.descriptionTooltip')}
          />
        </div>
      </StatusPopover>
    </div>
  );
}
