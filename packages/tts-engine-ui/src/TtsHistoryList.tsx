import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2, Pause, Play, RefreshCw, Search, Trash2, X } from 'lucide-react';
import type { TtsPort, HistoryEntry } from '@sky-app/service-contracts';

/** Nhãn ngắn cho badge nguồn — hardcode (giống badge "PLAY"/"API CALL" ở LogsDrawer.tsx),
 *  không cần i18n cho vài mã kỹ thuật cố định này. */
const SOURCE_LABELS: Record<string, string> = {
  ceremony: 'Ceremony',
  tts_studio: 'TTS Studio',
  warmup: 'Warmup',
  pregen: 'Pregen',
  web: 'Web',
  unknown: '?',
};

/** Lấy 1 trang gần nhất — đủ cho nhu cầu xem lại/audit thông thường, tránh tải cả bảng
 *  (Phase 3's retention mặc định 5000 dòng/90 ngày, xem history_store.py). */
const FETCH_LIMIT = 300;

export interface TtsHistoryListProps {
  ttsPort: TtsPort;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Tab "Lịch sử" trong cửa sổ Cấu hình (Phase 4) — đọc `tts_generation_history` (Phase 3,
 * xem apps/tts-service/server/history_store.py) qua `TtsPort.listHistory()`. Dùng chung cho
 * MỌI app (cửa sổ Cấu hình lắp ở tầng device-shell, global menu bar — xem
 * TtsStatusMenuBarItem.tsx), nên thấy được cả lượt Ceremony phát thật, không chỉ TTS Studio.
 *
 * Mặc định ẨN dòng nguồn 'pregen' — audio của nó không nhân bản vào đây (xem
 * history_store.py's add_entry), số lượng lại có thể rất lớn (1 sự kiện 500-1000+ dòng),
 * hiện mặc định sẽ nhấn chìm các bản ghi có audio thật. Có ô tick bật lại khi cần audit.
 */
export function TtsHistoryList({ ttsPort }: TtsHistoryListProps) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showPregen, setShowPregen] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const refresh = () => {
    if (!ttsPort.listHistory) return;
    setLoading(true);
    ttsPort.listHistory({ limit: FETCH_LIMIT })
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  };

  // Nạp lại mỗi lần mount (mở tab) — không cần giữ realtime/push như tab Nhật ký, vì đây
  // luôn là dữ liệu ĐỌC LẠI từ server, không có state nào bị mất khi unmount.
  useEffect(() => {
    refresh();
    return () => {
      audioRef.current?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ nạp 1 lần lúc mount tab
  }, [ttsPort]);

  const stopAudio = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingId(null);
  };

  const handlePlay = async (entry: HistoryEntry) => {
    if (!ttsPort.getHistoryAudioUrl) return;
    if (playingId === entry.id) {
      stopAudio();
      return;
    }
    stopAudio();
    setBusyId(entry.id);
    try {
      const url = await ttsPort.getHistoryAudioUrl(entry.id);
      const audio = new Audio(url);
      audioRef.current = audio;
      setPlayingId(entry.id);
      const clearIfCurrent = () => setPlayingId((cur) => (cur === entry.id ? null : cur));
      audio.onended = clearIfCurrent;
      audio.onerror = clearIfCurrent;
      await audio.play();
    } finally {
      setBusyId(null);
    }
  };

  const handleDownload = async (entry: HistoryEntry) => {
    if (!ttsPort.getHistoryAudioUrl) return;
    const url = await ttsPort.getHistoryAudioUrl(entry.id);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tts-history-${entry.id}.wav`;
    a.click();
  };

  const handleDelete = async (id: string) => {
    if (!ttsPort.deleteHistoryEntry) return;
    if (!confirm(t('ttsStatus.historyConfirmDelete'))) return;
    await ttsPort.deleteHistoryEntry(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const handleClearAll = async () => {
    if (!ttsPort.clearHistory) return;
    if (!confirm(t('ttsStatus.historyConfirmClearAll'))) return;
    await ttsPort.clearHistory();
    setEntries([]);
  };

  const filtered = entries.filter((e) => {
    if (!showPregen && e.source === 'pregen') return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return e.text.toLowerCase().includes(q) || (e.voiceLabel ?? '').toLowerCase().includes(q);
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[140px] flex-1 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1">
          <Search size={13} className="shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('ttsStatus.historySearchPlaceholder')}
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
        <label className="flex shrink-0 items-center gap-1.5 text-2xs text-muted-foreground">
          <input type="checkbox" checked={showPregen} onChange={(e) => setShowPregen(e.target.checked)} />
          {t('ttsStatus.historyShowPregen')}
        </label>
        <button
          type="button"
          onClick={refresh}
          title={t('ttsStatus.historyRefresh')}
          className="shrink-0 rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
        {entries.length > 0 && ttsPort.clearHistory && (
          <button
            type="button"
            onClick={handleClearAll}
            className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-2xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {t('ttsStatus.historyClearAll')}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-muted/40">
        {filtered.length === 0 ? (
          <p className="p-3 text-2xs text-muted-foreground">
            {loading ? t('ttsStatus.loading') : t('ttsStatus.historyEmpty')}
          </p>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((entry) => (
              <div key={entry.id} className="flex items-center gap-2 px-3 py-1.5">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-2xs text-foreground">{entry.text || '(trống)'}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-2xs text-muted-foreground">
                    <span className="rounded bg-muted px-1 py-px font-medium text-foreground/70">
                      {SOURCE_LABELS[entry.source] ?? entry.source}
                    </span>
                    {entry.voiceLabel && <span>{entry.voiceLabel}</span>}
                    {entry.durationMs != null && <span>{(entry.durationMs / 1000).toFixed(1)}s</span>}
                    <span>{formatTime(entry.createdAt)}</span>
                    {entry.error && <span className="text-destructive">{entry.error}</span>}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {entry.hasAudio && ttsPort.getHistoryAudioUrl && (
                    <>
                      <button
                        type="button"
                        onClick={() => handlePlay(entry)}
                        disabled={busyId === entry.id}
                        title={playingId === entry.id ? t('ttsStatus.historyStop') : t('ttsStatus.historyPlay')}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                      >
                        {busyId === entry.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : playingId === entry.id ? (
                          <Pause size={13} />
                        ) : (
                          <Play size={13} />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownload(entry)}
                        title={t('ttsStatus.historyDownload')}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Download size={13} />
                      </button>
                    </>
                  )}
                  {ttsPort.deleteHistoryEntry && (
                    <button
                      type="button"
                      onClick={() => handleDelete(entry.id)}
                      title={t('ttsStatus.historyDelete')}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
