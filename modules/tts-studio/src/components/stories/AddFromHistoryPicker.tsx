import { useEffect, useState } from 'react';
import { Loader2, Play, Square, X } from 'lucide-react';
import type { HistoryEntry, TtsPort } from '@sky-app/service-contracts';
import { getPlayingId, playUrlAudio, stopAudio, useAudioPlayingId } from '../../lib/audioPlayer';

export interface AddFromHistoryPickerProps {
  ttsPort: TtsPort;
  onPick: (historyEntryId: string) => void;
  onClose: () => void;
}

/**
 * Chọn 1 dòng lịch sử sinh audio để thêm vào Story — CHỈ hiện dòng có audio thật
 * (`hasAudio`), lọc nguồn 'tts_studio' (khớp bộ lọc `HistoryList` đang dùng — không lẫn
 * dòng nguồn 'pregen'/'ceremony'/'warmup' số lượng lớn không liên quan tới việc phối Story).
 */
export function AddFromHistoryPicker({ ttsPort, onPick, onClose }: AddFromHistoryPickerProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const playingId = useAudioPlayingId();

  useEffect(() => {
    if (!ttsPort.listHistory) {
      setLoading(false);
      return;
    }
    let alive = true;
    ttsPort.listHistory({ source: 'tts_studio', limit: 100 })
      .then((list) => {
        if (alive) setEntries(list.filter((e) => e.hasAudio));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [ttsPort]);

  const handlePreview = async (id: string) => {
    if (!ttsPort.getHistoryAudioUrl) return;
    const playId = `picker-${id}`;
    if (getPlayingId() === playId) {
      stopAudio();
      return;
    }
    const url = await ttsPort.getHistoryAudioUrl(id);
    await playUrlAudio(playId, url);
  };

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm" onPointerDown={onClose}>
      <div
        className="flex max-h-[70%] w-96 flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-2.5">
          <h4 className="text-sm font-semibold text-foreground">Thêm từ lịch sử sinh giọng</h4>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-muted">
            <X size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {loading && (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 size={15} className="mr-2 animate-spin" /> Đang tải...
            </div>
          )}
          {!loading && entries.length === 0 && (
            <p className="p-3 text-center text-2xs text-muted-foreground">
              Chưa có bản ghi nào — sinh giọng ở tab &quot;Sinh giọng&quot; trước.
            </p>
          )}
          {entries.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onPick(e.id)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted/60"
            >
              <span
                role="button"
                tabIndex={0}
                onClick={(ev) => { ev.stopPropagation(); void handlePreview(e.id); }}
                onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.stopPropagation(); void handlePreview(e.id); } }}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border hover:bg-muted"
              >
                {playingId === `picker-${e.id}` ? <Square size={11} /> : <Play size={11} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-2xs text-foreground">{e.text}</div>
                <div className="truncate text-2xs text-muted-foreground">
                  {e.voiceLabel} · {((e.durationMs ?? 0) / 1000).toFixed(1)}s
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
