import { Download, History, Loader2, Play } from 'lucide-react';
import { useState } from 'react';
import { ButtonPrimitive } from './ui/button-primitive';
import { useTtsStudioStore } from '../store';
import { getHistoryEntry } from '../lib/history-db';
import { playPcm } from '../lib/playPcm';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function HistoryList() {
  const history = useTtsStudioStore((s) => s.history);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handlePlay = async (id: string) => {
    setBusyId(id);
    try {
      const entry = await getHistoryEntry(id);
      if (!entry) return;
      const buffer = await entry.audioBlob.arrayBuffer();
      await playPcm(buffer, entry.sampleRate);
    } finally {
      setBusyId(null);
    }
  };

  const handleDownload = async (id: string) => {
    const entry = await getHistoryEntry(id);
    if (!entry) return;
    const url = URL.createObjectURL(entry.audioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tts-studio-${id}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <History size={14} /> Các bản ghi gần đây
        <span className="text-2xs font-normal text-muted-foreground">({history.length})</span>
      </div>
      {history.length === 0 && (
        <p className="text-2xs text-muted-foreground italic">Chưa có bản ghi nào.</p>
      )}
      <div className="flex flex-col gap-1.5">
        {history.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5"
          >
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-xs text-foreground">{entry.text || '(trống)'}</span>
              <span className="text-2xs text-muted-foreground">
                {entry.voiceLabel} · {(entry.durationMs / 1000).toFixed(1)}s · {formatTime(entry.createdAt)}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <ButtonPrimitive
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={busyId === entry.id}
                onClick={() => handlePlay(entry.id)}
                title="Nghe lại"
              >
                {busyId === entry.id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
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
          </div>
        ))}
      </div>
    </div>
  );
}
