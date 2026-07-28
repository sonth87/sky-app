import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TtsEnginePort, TtsDebugInfo } from '@sky-app/service-contracts';

const POLL_INTERVAL_MS = 1500;

export interface TtsLogPanelProps {
  port: TtsEnginePort;
}

/**
 * Nội dung cửa sổ xem log — PID/port/health, stderr gần nhất, nhật ký hoạt động. Nội dung
 * y hệt Ceremony's TtsChip từng hiện (đối chiếu lúc thiết kế), viết lại engine-agnostic +
 * đóng gói dùng chung thay vì chỉ Ceremony mới xem được.
 *
 * Chỉ hoạt động khi `port.getDebugInfo` tồn tại (Electron — cần theo dõi tiến trình local).
 * Trên Web hiện thông báo thay vì để trống khó hiểu.
 *
 * KHÔNG tự bọc FloatingWindow — nơi lắp ráp (device-shell) quyết định hiển thị bằng cơ chế
 * nào, với `blocking={false}` để không chặn thao tác app khác trong lúc cửa sổ log mở.
 */
export function TtsLogPanel({ port }: TtsLogPanelProps) {
  const { t } = useTranslation();
  const [debug, setDebug] = useState<TtsDebugInfo | null>(null);
  const [visibleCount, setVisibleCount] = useState(30);

  useEffect(() => {
    if (!port.getDebugInfo) return;
    let cancelled = false;
    const fetchOnce = () => {
      port.getDebugInfo!().then((d) => {
        if (!cancelled) setDebug(d);
      }).catch(() => {});
    };
    fetchOnce();
    const id = setInterval(fetchOnce, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [port]);

  if (!port.getDebugInfo) {
    return <p className="p-4 text-xs text-muted-foreground">{t('ttsStatus.logsNotAvailable')}</p>;
  }
  if (!debug) {
    return <p className="p-4 text-xs text-muted-foreground">{t('ttsStatus.loading')}</p>;
  }

  return (
    // w-full h-full — LẤP ĐẦY khung do caller cấp (FloatingWindow's contentClassName),
    // không tự đặt kích thước cố định ở đây: caller mới biết cửa sổ có resizable hay
    // không và nên rộng/cao bao nhiêu theo ngữ cảnh dùng.
    <div className="flex h-full w-full flex-col gap-2 overflow-hidden p-3 text-foreground">
      <div className="grid grid-cols-[80px_1fr] gap-y-1 text-xs">
        <span className="text-muted-foreground">Process</span>
        <span className={debug.processAlive ? 'text-success' : 'text-destructive'}>
          {debug.processAlive ? `✓ Alive (PID ${debug.processPid})` : `✗ ${t('ttsStatus.notRunning')}`}
        </span>
        <span className="text-muted-foreground">Port</span>
        <span>{debug.port}</span>
        <span className="text-muted-foreground">Health</span>
        <span className={debug.healthOk ? 'text-success' : 'text-destructive'}>
          {debug.healthOk === true ? '✓ OK' : debug.healthOk === false ? `✗ ${t('ttsStatus.noResponse')}` : '—'}
        </span>
        {debug.lastStartupError && (
          <>
            <span className="text-muted-foreground">{t('ttsStatus.errorLabel')}</span>
            <span className="break-words text-destructive">{debug.lastStartupError}</span>
          </>
        )}
        {debug.lastExitCode !== null && (
          <>
            <span className="text-muted-foreground">Exit code</span>
            <span className={debug.lastExitCode === 0 ? 'text-success' : 'text-destructive'}>
              {debug.lastExitCode}
            </span>
          </>
        )}
      </div>

      <div className="h-px shrink-0 bg-border" />

      {debug.recentStderr.length > 0 && (
        <div className="flex min-h-0 flex-col gap-1">
          <span className="text-xs font-semibold text-muted-foreground">
            Stderr ({debug.recentStderr.length})
          </span>
          <div className="max-h-40 space-y-px overflow-y-auto rounded bg-foreground p-2 font-mono text-2xs leading-relaxed">
            {debug.recentStderr.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all text-background">
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-1">
        <span className="text-xs font-semibold text-muted-foreground">
          {t('ttsStatus.activity')} ({debug.activityLog.length})
        </span>
        <div className="min-h-0 flex-1 overflow-y-auto rounded bg-foreground p-2 font-mono text-2xs leading-relaxed">
          {debug.activityLog.length === 0 ? (
            <span className="text-muted-foreground">{t('ttsStatus.noEvents')}</span>
          ) : (
            debug.activityLog.slice(0, visibleCount).map((e, i) => (
              <div key={i} className={e.ok ? 'text-success' : 'text-destructive'}>
                <span className="text-muted-foreground">{e.time}</span>{' '}
                [{e.action}] {e.ok ? '✓' : '✗'}
                {e.cacheHit ? ' 💾' : ''}{' '}
                <span className="text-background">&quot;{e.text}&quot;</span>{' '}
                <span className="text-muted-foreground">
                  {e.model} {e.durationMs}ms
                </span>
                {e.error && <span className="text-destructive"> → {e.error}</span>}
              </div>
            ))
          )}
        </div>
        {visibleCount < debug.activityLog.length && (
          <button
            onClick={() => setVisibleCount((n) => n + 30)}
            className="self-start text-xs text-muted-foreground underline hover:text-foreground"
          >
            {t('ttsStatus.loadMore', { count: debug.activityLog.length - visibleCount })}
          </button>
        )}
      </div>
    </div>
  );
}
