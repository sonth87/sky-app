import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TtsEnginePort, TtsPort, TtsDebugInfo, TtsLogLine } from '@sky-app/service-contracts';
import { TtsHistoryList } from './TtsHistoryList.js';
import { TtsRawLogView } from './TtsRawLogView.js';

const POLL_INTERVAL_MS = 1500;
/** Cap buffer log thô — PHẢI khớp MAX_LOG_LINES ở python-server.ts (buffer phía main process
 *  dùng để seed lúc mount, xem getRecentLogLines/broadcastLogLine) để tab "Nhật ký" cuộn-lên-
 *  xem-thêm (TtsRawLogView.tsx) có đủ dữ liệu tải tới hết. Không phải "vô hạn" — vẫn có trần
 *  để tránh phình RAM vô thời hạn trong 1 phiên chạy dài không ai bấm Xoá; 10000 đủ rộng cho
 *  vài vòng cuộn-lên-tải-thêm (bước 500 dòng/lần) trước khi chạm trần. */
const MAX_LOG_LINES = 10000;

export interface TtsLogPanelProps {
  port: TtsEnginePort;
  /** Cần cho tab "Lịch sử" (Phase 4) — thiếu thì tab đó tự ẩn (vd Web adapter chưa
   *  implement listHistory). */
  ttsPort?: TtsPort;
}

/**
 * Nội dung cửa sổ xem log — PID/port/health, log thô stdout/stderr cuộn realtime (tham
 * khảo voicebox's ServerTab/LogsPage.tsx), nhật ký hoạt động (per-request, có durationMs/
 * cacheHit — chi tiết hơn voicebox). Nội dung gốc y hệt Ceremony's TtsChip từng hiện, viết
 * lại engine-agnostic + đóng gói dùng chung thay vì chỉ Ceremony mới xem được.
 *
 * Phần trạng thái (Process/Port/Health) + hoạt động vẫn POLL `getDebugInfo` mỗi 1.5s (đủ
 * mượt cho dữ liệu đổi chậm). Phần log thô ĐẨY REALTIME qua `subscribeLogLines` (event
 * push từ IPC, xem python-server.ts's broadcastLogLine) — khác hẳn: dòng mới xuất hiện gần
 * như tức thời, không đợi tick poll kế tiếp.
 *
 * KHÔNG tự bọc FloatingWindow — nơi lắp ráp (device-shell) quyết định hiển thị bằng cơ chế
 * nào, với `blocking={false}` để không chặn thao tác app khác trong lúc cửa sổ log mở.
 */
type LogSubTab = 'raw' | 'activity' | 'history';

export function TtsLogPanel({ port, ttsPort }: TtsLogPanelProps) {
  const { t } = useTranslation();
  const [debug, setDebug] = useState<TtsDebugInfo | null>(null);
  const [visibleCount, setVisibleCount] = useState(30);

  const [logLines, setLogLines] = useState<TtsLogLine[]>([]);

  // 3 tab con (Nhật ký thô | Hoạt động | Lịch sử) — CHỈ đổi phần JSX hiển thị, không unmount
  // gì: state + subscribe log realtime ở trên vẫn sống xuyên suốt dù đang xem tab nào, nên
  // chuyển qua lại các tab này không mất dữ liệu, khác hẳn lỗi đã sửa trước đó (ConfigWindow's
  // tab ngoài thật sự unmount/mount lại cả TtsLogPanel).
  const [activeSubTab, setActiveSubTab] = useState<LogSubTab>('raw');

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

  // Đăng ký nhận dòng mới TRƯỚC, rồi mới nạp lịch sử — nạp sau cùng để dòng phát sinh
  // đúng lúc round-trip IPC của getLogLines() không bị rớt (mất) giữa 2 bước.
  useEffect(() => {
    if (!port.subscribeLogLines) return;
    const unsub = port.subscribeLogLines((entry) => {
      setLogLines((prev) => {
        const next = [...prev, entry];
        return next.length > MAX_LOG_LINES ? next.slice(next.length - MAX_LOG_LINES) : next;
      });
    });
    port.getLogLines?.().then((history) => {
      if (history.length === 0) return;
      setLogLines((prev) => {
        // `ts` set 1 lần lúc main process phát dòng đó — trùng ts nghĩa là cùng 1 dòng đã
        // vào `prev` qua push trong lúc round-trip getLogLines() còn đang chạy.
        const seen = new Set(prev.map((l) => l.ts));
        const merged = [...history.filter((l) => !seen.has(l.ts)), ...prev];
        return merged.length > MAX_LOG_LINES ? merged.slice(merged.length - MAX_LOG_LINES) : merged;
      });
    });
    return unsub;
  }, [port]);

  if (!port.getDebugInfo) {
    return <p className="p-4 text-xs text-muted-foreground">{t('ttsStatus.logsNotAvailable')}</p>;
  }
  if (!debug) {
    return <p className="p-4 text-xs text-muted-foreground">{t('ttsStatus.loading')}</p>;
  }

  // Web adapter chưa implement subscribeLogLines/listHistory (xem TtsPort's docstring) —
  // khi thiếu cả 2 thì chỉ còn 1 view (Hoạt động), không cần thanh tab cho đúng 1 mục.
  const hasRawLog = !!port.subscribeLogLines;
  const hasHistory = !!ttsPort?.listHistory;
  const showTabBar = hasRawLog || hasHistory;
  const effectiveTab: LogSubTab =
    (activeSubTab === 'raw' && !hasRawLog) || (activeSubTab === 'history' && !hasHistory)
      ? 'activity'
      : activeSubTab;

  return (
    // w-full h-full — LẤP ĐẦY khung do caller cấp (FloatingWindow's contentClassName),
    // không tự đặt kích thước cố định ở đây: caller mới biết cửa sổ có resizable hay
    // không và nên rộng/cao bao nhiêu theo ngữ cảnh dùng.
    <div className="flex h-full w-full flex-col gap-3 overflow-hidden p-4 text-foreground">
      {/* Dải trạng thái gọn — 1 dòng, không chiếm chỗ của khung log (phần chính). */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${debug.processAlive ? 'bg-success' : 'bg-destructive'}`} />
          {debug.processAlive ? `PID ${debug.processPid}` : t('ttsStatus.notRunning')}
        </span>
        <span>Port {debug.port}</span>
        <span className="flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${debug.healthOk ? 'bg-success' : 'bg-destructive'}`} />
          {debug.healthOk === true ? 'Health OK' : debug.healthOk === false ? t('ttsStatus.noResponse') : '—'}
        </span>
        {debug.lastExitCode !== null && (
          <span className={debug.lastExitCode === 0 ? '' : 'text-destructive'}>Exit code {debug.lastExitCode}</span>
        )}
        {debug.lastStartupError && <span className="text-destructive">{debug.lastStartupError}</span>}
      </div>

      {/* Thanh tab ngang, gạch chân — tham khảo voicebox's ServerTab/SettingsLayout (cùng
          kiểu underline-tab dùng cho trang cấu hình), đổi sang token màu của sky-app. */}
      {showTabBar && (
        <nav className="flex shrink-0 gap-1 border-b border-border">
          {(
            [
              ...(hasRawLog
                ? [{ id: 'raw' as const, label: t('ttsStatus.rawLog'), count: logLines.length }]
                : []),
              { id: 'activity' as const, label: t('ttsStatus.activity'), count: debug.activityLog.length },
              ...(hasHistory ? [{ id: 'history' as const, label: t('ttsStatus.history'), count: null }] : []),
            ]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              className={`-mb-px border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
                effectiveTab === tab.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground'
              }`}
            >
              {tab.label}
              {tab.count !== null && <span className="text-2xs font-normal"> ({tab.count})</span>}
            </button>
          ))}
        </nav>
      )}

      {/* Log thô realtime — style hộp sáng kiểu voicebox's Server Logs (không phải terminal
          nền tối). Luôn giữ subscribe/state ở trên dù đang xem tab nào — chuyển tab chỉ ẩn/
          hiện JSX, không unmount, nên không mất dòng nào (khác lỗi tab NGOÀI đã sửa trước đó). */}
      {hasRawLog && effectiveTab === 'raw' && (
        <TtsRawLogView lines={logLines} onClear={() => setLogLines([])} />
      )}

      {effectiveTab === 'activity' && (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-muted/40 p-2.5 font-mono text-2xs leading-relaxed">
            {debug.activityLog.length === 0 ? (
              <span className="text-muted-foreground">{t('ttsStatus.noEvents')}</span>
            ) : (
              debug.activityLog.slice(0, visibleCount).map((e, i) => (
                <div key={i} className={e.ok ? 'text-foreground/80' : 'text-destructive'}>
                  <span className="text-muted-foreground">{e.time}</span>{' '}
                  [{e.action}] {e.ok ? '✓' : '✗'}
                  {e.cacheHit ? ' 💾' : ''}{' '}
                  &quot;{e.text}&quot;{' '}
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
      )}

      {hasHistory && effectiveTab === 'history' && <TtsHistoryList ttsPort={ttsPort!} />}
    </div>
  );
}
