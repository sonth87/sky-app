import { useState } from 'react';
import { History, Search, Trash2, X } from 'lucide-react';
import type { SttHistoryEntry } from '@sky-app/service-contracts';

export interface TranscribeHistoryPanelProps {
  history: SttHistoryEntry[];
  onDelete: (id: string) => void;
  onClearAll: () => void;
  /** Bấm vào 1 dòng để nạp lại text đó vào ResultPanel — tiện xem lại/sao chép nhanh. */
  onSelect?: (entry: SttHistoryEntry) => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Mirror modules/tts-studio/src/components/HistoryList.tsx nhưng ĐƠN GIẢN HƠN — text-only
 * (không play/download audio, vì `stt_history` không lưu file gốc — xem
 * docs/dev/history/2026-08-15-stt-app-rieng-va-lich-su.md). Nhận `history` đã lọc sẵn theo
 * `source: 'speech_to_text'` từ nơi gọi — không lẫn dòng ghi từ nút mic VoiceCloneModal. */
export function TranscribeHistoryPanel({ history, onDelete, onClearAll, onSelect }: TranscribeHistoryPanelProps) {
  const [searchText, setSearchText] = useState('');

  const filtered = history.filter((e) => e.text.toLowerCase().includes(searchText.toLowerCase()));

  const handleDelete = (id: string) => {
    if (!confirm('Xoá bản ghi này?')) return;
    onDelete(id);
  };

  const handleClearAll = () => {
    if (!confirm('Xoá toàn bộ lịch sử? Hành động này không thể hoàn tác.')) return;
    onClearAll();
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <History size={14} /> Lịch sử phiên âm
          <span className="text-2xs font-normal text-muted-foreground">({filtered.length})</span>
        </div>
        {history.length > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            className="text-2xs text-muted-foreground hover:text-destructive transition-colors"
          >
            Xoá toàn bộ
          </button>
        )}
      </div>

      {history.length > 0 && (
        <div className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5">
          <Search size={14} className="shrink-0 text-muted-foreground" />
          <input
            type="text"
            placeholder="Tìm trong lịch sử..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
          {searchText && (
            <button
              type="button"
              onClick={() => setSearchText('')}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {history.length === 0 && <p className="text-2xs italic text-muted-foreground">Chưa có bản ghi nào.</p>}
      {history.length > 0 && filtered.length === 0 && (
        <p className="text-2xs italic text-muted-foreground">Không tìm thấy bản ghi nào.</p>
      )}

      <div className="flex flex-col gap-1.5">
        {filtered.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5"
          >
            <button
              type="button"
              onClick={() => onSelect?.(entry)}
              className="flex min-w-0 flex-1 flex-col items-start text-left"
            >
              <span className="w-full truncate text-xs text-foreground">{entry.text || '(trống)'}</span>
              <span className="text-2xs text-muted-foreground">
                {entry.sourceFilename ?? 'audio'} ·{' '}
                {entry.durationSec != null ? `${entry.durationSec.toFixed(1)}s` : '?'} ·{' '}
                {formatTime(entry.createdAt)}
                {entry.error && <span className="text-destructive"> · Lỗi: {entry.error}</span>}
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleDelete(entry.id)}
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              title="Xoá"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
