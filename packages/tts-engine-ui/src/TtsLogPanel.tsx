import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown } from 'lucide-react';
import type { TtsEnginePort, TtsDebugInfo, TtsLogLine } from '@sky-app/service-contracts';

const POLL_INTERVAL_MS = 1500;
/** Cap buffer log thô — tương đương voicebox's `MAX_LOG_ENTRIES`. Dòng cũ nhất bị bỏ khi
 *  vượt, không phải giới hạn để tiết kiệm bộ nhớ tuyệt đối (renderer thừa sức giữ nhiều hơn)
 *  mà để tránh danh sách phình vô hạn trong 1 phiên chạy dài không ai bấm Xoá. */
const MAX_LOG_LINES = 2000;
/** Ngưỡng (px) tính "đang ở cuối" — dưới ngưỡng này vẫn coi là đã cuộn tới đáy dù còn dư vài
 *  px do làm tròn subpixel, khớp cách voicebox's LogsPage làm. */
const AT_BOTTOM_THRESHOLD_PX = 40;

export interface TtsLogPanelProps {
  port: TtsEnginePort;
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
export function TtsLogPanel({ port }: TtsLogPanelProps) {
  const { t } = useTranslation();
  const [debug, setDebug] = useState<TtsDebugInfo | null>(null);
  const [visibleCount, setVisibleCount] = useState(30);

  const [logLines, setLogLines] = useState<TtsLogLine[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  // Tự cuộn xuống dòng mới nhất TRỪ KHI người dùng đã tự cuộn lên xem log cũ — theo dõi qua
  // onScroll bên dưới, đúng UX voicebox's LogsPage (autoScroll tắt ngay khi rời đáy, bật lại
  // khi bấm nút "Cuộn xuống cuối" hoặc tự cuộn về đáy).
  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logLines, autoScroll]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < AT_BOTTOM_THRESHOLD_PX;
    setAutoScroll(atBottom);
  };

  const jumpToBottom = () => {
    setAutoScroll(true);
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  };

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

      {/* Log thô realtime — phần chính, chiếm nhiều chỗ nhất (flex-1), style hộp sáng kiểu
          voicebox's Server Logs (không phải terminal nền tối). */}
      {port.subscribeLogLines && (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">
              Nhật ký <span className="text-xs font-normal text-muted-foreground">· {logLines.length} dòng</span>
            </span>
            <button
              type="button"
              onClick={() => setLogLines([])}
              className="rounded-lg border border-border px-2.5 py-1 text-2xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Xoá
            </button>
          </div>
          <div className="relative min-h-0 flex-1">
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="h-full overflow-y-auto rounded-xl border border-border bg-muted/40 p-3 font-mono text-2xs leading-relaxed"
            >
              {logLines.length === 0 ? (
                <span className="text-muted-foreground">Chưa có dòng log nào.</span>
              ) : (
                logLines.map((entry, i) => (
                  <div
                    key={i}
                    className={`whitespace-pre-wrap break-all py-0.5 ${entry.stream === 'stderr' ? 'text-destructive' : 'text-foreground/80'}`}
                  >
                    <span className="text-muted-foreground">
                      {new Date(entry.ts).toLocaleTimeString('vi-VN')} [{entry.tier}]
                    </span>{' '}
                    {entry.line}
                  </div>
                ))
              )}
            </div>
            {!autoScroll && (
              <button
                type="button"
                onClick={jumpToBottom}
                className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-primary px-3 py-1 text-2xs text-primary-foreground shadow-lg hover:bg-primary/90"
              >
                <ArrowDown size={11} /> Cuộn xuống cuối
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex max-h-40 min-h-0 shrink-0 flex-col gap-1.5">
        <span className="text-xs font-semibold text-muted-foreground">
          {t('ttsStatus.activity')} ({debug.activityLog.length})
        </span>
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
    </div>
  );
}
