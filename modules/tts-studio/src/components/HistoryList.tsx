import { Download, History, Loader2, Pause, Play, Search, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { TtsPort } from '@sky-app/service-contracts';
import { ButtonPrimitive } from '@sky-app/ui';
import { useTtsStudioStore } from '../store';
import { getPlayingId, playUrlAudio, stopAudio, useAudioPlayingId } from '../lib/audioPlayer';

function historyPlayId(id: string): string {
  return `history:${id}`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface HistoryListProps {
  ttsPort?: TtsPort;
}

export function HistoryList({ ttsPort }: HistoryListProps) {
  const history = useTtsStudioStore((s) => s.history);
  const removeHistory = useTtsStudioStore((s) => s.removeHistory);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const playingId = useAudioPlayingId();

  const filteredHistory = history.filter((entry) =>
    entry.text.toLowerCase().includes(searchText.toLowerCase()) ||
    entry.voiceLabel.toLowerCase().includes(searchText.toLowerCase())
  );

  const handlePlay = async (id: string) => {
    if (!ttsPort?.getHistoryAudioUrl) return;
    const playId = historyPlayId(id);
    if (getPlayingId() === playId) {
      stopAudio();
      return;
    }
    setBusyId(id);
    try {
      const url = await ttsPort.getHistoryAudioUrl(id);
      await playUrlAudio(playId, url);
    } finally {
      setBusyId(null);
    }
  };

  const handleDownload = async (id: string) => {
    if (!ttsPort?.getHistoryAudioUrl) return;
    const url = await ttsPort.getHistoryAudioUrl(id);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tts-studio-${id}.wav`;
    a.click();
  };

  const handleDeleteEntry = async (id: string) => {
    if (!ttsPort?.deleteHistoryEntry) return;
    if (!confirm('Xóa bản ghi này?')) return;
    await ttsPort.deleteHistoryEntry(id);
    removeHistory(id);
  };

  const handleClearAll = async () => {
    if (!ttsPort?.clearHistory) return;
    if (!confirm('Xóa toàn bộ lịch sử? Hành động này không thể hoàn tác.')) return;
    await ttsPort.clearHistory();
    useTtsStudioStore.setState({ history: [] });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <History size={14} /> Các bản ghi gần đây
          <span className="text-2xs font-normal text-muted-foreground">({filteredHistory.length})</span>
        </div>
        {history.length > 0 && (
          <ButtonPrimitive
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            className="text-2xs"
          >
            Xóa toàn bộ
          </ButtonPrimitive>
        )}
      </div>

      {history.length > 0 && (
        <div className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5">
          <Search size={14} className="shrink-0 text-muted-foreground" />
          <input
            type="text"
            placeholder="Tìm theo văn bản hoặc giọng..."
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

      {history.length === 0 && (
        <p className="text-2xs text-muted-foreground italic">Chưa có bản ghi nào.</p>
      )}
      {history.length > 0 && filteredHistory.length === 0 && (
        <p className="text-2xs text-muted-foreground italic">Không tìm thấy bản ghi nào.</p>
      )}

      <div className="flex flex-col gap-1.5">
        {filteredHistory.map((entry) => {
          const isPlaying = playingId === historyPlayId(entry.id);
          return (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-xs text-foreground">{entry.text || '(trống)'}</span>
                <span className="text-2xs text-muted-foreground">
                  {entry.voiceLabel} · {(entry.durationMs / 1000).toFixed(1)}s · {formatTime(entry.createdAt)}
                  {entry.error && <span className="text-destructive"> · Lỗi: {entry.error}</span>}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {entry.hasAudio && (
                  <div className="flex items-center gap-1">
                    <ButtonPrimitive
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={busyId === entry.id}
                      onClick={() => handlePlay(entry.id)}
                      title={isPlaying ? 'Dừng' : 'Nghe lại'}
                    >
                      {busyId === entry.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : isPlaying ? (
                        <Pause size={12} />
                      ) : (
                        <Play size={12} />
                      )}
                    </ButtonPrimitive>
                    <ButtonPrimitive
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleDownload(entry.id)}
                      title="Tải WAV"
                    >
                      <Download size={12} />
                    </ButtonPrimitive>
                  </div>
                )}
                <ButtonPrimitive
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleDeleteEntry(entry.id)}
                  title="Xóa"
                >
                  <Trash2 size={12} />
                </ButtonPrimitive>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
