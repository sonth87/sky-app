import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, Download, Search, X } from 'lucide-react';
import type { TtsLogLine } from '@sky-app/service-contracts';

/** Số dòng hiện mặc định — cũng là cap tổng của buffer phía TtsLogPanel/python-server.ts,
 *  xem MAX_LOG_LINES ở 2 nơi đó (phải khớp nhau để "cuộn lên xem thêm" có đủ dữ liệu tải). */
const INITIAL_VISIBLE = 2000;
/** Mỗi lần cuộn gần tới đỉnh, hiện thêm bấy nhiêu dòng cũ hơn. */
const LOAD_MORE_STEP = 500;
const BOTTOM_THRESHOLD_PX = 40;
/** Cuộn tới gần đỉnh trong khoảng này thì coi là "muốn xem thêm", không cần chạm đúng 0px. */
const TOP_THRESHOLD_PX = 60;

export interface TtsRawLogViewProps {
  lines: TtsLogLine[];
  onClear: () => void;
}

/**
 * Tab "Nhật ký" — log thô stdout/stderr. Tách khỏi TtsLogPanel.tsx để gọn file, nhưng CHỦ Ý
 * không tự giữ `lines`: state + subscribe realtime phải sống ở component cha (luôn mount
 * xuyên suốt), component này chỉ NHẬN prop và tự quản state hiển thị (search/cuộn) — tránh
 * lặp lại lỗi mất log khi remount đã sửa trước đó.
 */
export function TtsRawLogView({ lines, onClear }: TtsRawLogViewProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Lưu scrollHeight NGAY TRƯỚC khi tăng visibleCount (nạp thêm dòng cũ ở phía trên) — dùng
  // để bù lại scrollTop sau khi DOM cập nhật, không thì nội dung đang xem sẽ bị đẩy tụt xuống
  // đúng bằng chiều cao của các dòng mới chèn vào phía trên.
  const pendingScrollAdjustRef = useRef<number | null>(null);

  const q = search.trim().toLowerCase();
  const filtered = q ? lines.filter((l) => l.line.toLowerCase().includes(q)) : lines;
  const windowed = filtered.length > visibleCount ? filtered.slice(filtered.length - visibleCount) : filtered;
  const hasMore = windowed.length < filtered.length;

  // Đổi từ khoá tìm kiếm → bắt đầu lại cửa sổ hiển thị từ INITIAL_VISIBLE (kết quả lọc khác
  // hẳn tập gốc, giữ nguyên visibleCount cũ không có ý nghĩa gì).
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [q]);

  // Tự cuộn xuống dòng mới nhất khi có dòng MỚI THẬT SỰ phát sinh (lines.length đổi) — TRỪ
  // khi người dùng đã tự cuộn lên xem log cũ. Cố ý KHÔNG phụ thuộc `visibleCount`/`windowed`:
  // tăng visibleCount do cuộn-lên-xem-thêm không được kéo tuột người dùng về đáy lại.
  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines.length, autoScroll]);

  // Bù scrollTop NGAY SAU khi nội dung cũ được chèn thêm ở trên (visibleCount vừa tăng) —
  // giữ đúng vị trí đang xem, không bị giật xuống dưới.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || pendingScrollAdjustRef.current === null) return;
    el.scrollTop += el.scrollHeight - pendingScrollAdjustRef.current;
    pendingScrollAdjustRef.current = null;
  }, [visibleCount]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD_PX;
    setAutoScroll(atBottom);

    if (el.scrollTop < TOP_THRESHOLD_PX && hasMore) {
      pendingScrollAdjustRef.current = el.scrollHeight;
      setVisibleCount((n) => Math.min(n + LOAD_MORE_STEP, filtered.length));
    }
  };

  const jumpToBottom = () => {
    setAutoScroll(true);
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  };

  // Xuất đúng tập ĐANG LỌC (rỗng search = xuất hết buffer đang giữ), không chỉ phần đang
  // cuộn-vào-khung — khớp kỳ vọng "xuất những gì tìm kiếm ra", không phải "xuất những gì mắt
  // đang thấy trên màn hình".
  const handleExport = () => {
    const text = filtered
      .map((l) => `${new Date(l.ts).toISOString()} [${l.tier}] [${l.stream}] ${l.line}`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.href = url;
    a.download = `tts-log-${stamp}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    if (!confirm(t('ttsStatus.rawLogClearConfirm'))) return;
    setVisibleCount(INITIAL_VISIBLE);
    onClear();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[140px] flex-1 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1">
          <Search size={13} className="shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('ttsStatus.rawLogSearchPlaceholder')}
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-2xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Download size={12} /> {t('ttsStatus.rawLogExport')}
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-2xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {t('ttsStatus.rawLogClear')}
        </button>
      </div>

      {hasMore && (
        <p className="text-2xs text-muted-foreground">
          {t('ttsStatus.rawLogShowingCount', { shown: windowed.length, total: filtered.length })}
        </p>
      )}

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto rounded-xl border border-border bg-muted/40 p-3 font-mono text-2xs leading-relaxed"
        >
          {windowed.length === 0 ? (
            <span className="text-muted-foreground">
              {lines.length === 0 ? t('ttsStatus.rawLogEmpty') : t('ttsStatus.rawLogNoMatch')}
            </span>
          ) : (
            windowed.map((entry, i) => (
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
  );
}
