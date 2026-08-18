import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Loader2, Play, Plus, Square } from 'lucide-react';
import type { StoryPort, StoryWithItems, TtsPort } from '@sky-app/service-contracts';
import { getPlayingId, playUrlAudio, stopAudio, useAudioPlayingId } from '../../lib/audioPlayer';
import { AddFromHistoryPicker } from './AddFromHistoryPicker';
import { TimelineItem, type ItemChange } from './TimelineItem';
import { PX_PER_MS, TRACK_HEIGHT } from './timelineConstants';

export interface TimelineProps {
  storyId: string;
  storyPort: StoryPort;
  ttsPort: TtsPort;
}

const EXPORT_PLAY_ID = 'story-export';
const MIN_CANVAS_MS = 10_000; // tối thiểu 10s bề rộng canvas kể cả Story rỗng
const CANVAS_PADDING_MS = 4_000; // chừa chỗ trống bên phải item cuối để còn kéo-thả vào

export function Timeline({ storyId, storyPort, ttsPort }: TimelineProps) {
  const [story, setStory] = useState<StoryWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [exporting, setExporting] = useState(false);
  const playingId = useAudioPlayingId();

  const refresh = useCallback(async () => {
    try {
      const fresh = await storyPort.get(storyId);
      setStory(fresh);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [storyPort, storyId]);

  useEffect(() => {
    setLoading(true);
    setSelectedItemId(null);
    void refresh();
  }, [refresh]);

  const items = story?.items ?? [];
  const trackCount = Math.max(1, ...items.map((i) => i.track + 1)) + 1; // +1 hàng trống để kéo item vào
  const maxEndMs = Math.max(MIN_CANVAS_MS, ...items.map((i) => i.startTimeMs + (i.durationMs - i.trimStartMs - i.trimEndMs)));
  const canvasWidthPx = (maxEndMs + CANVAS_PADDING_MS) * PX_PER_MS;

  async function withErrorCatch(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const handleCommitChange = (itemId: string, changes: ItemChange) =>
    void withErrorCatch(async () => {
      const item = items.find((i) => i.id === itemId);
      if (!item) return;
      const calls: Promise<unknown>[] = [];
      if (changes.startTimeMs !== undefined || changes.track !== undefined) {
        calls.push(storyPort.moveItem(
          storyId, itemId,
          changes.startTimeMs ?? item.startTimeMs,
          changes.track ?? item.track,
        ));
      }
      if (changes.trimStartMs !== undefined || changes.trimEndMs !== undefined) {
        calls.push(storyPort.trimItem(
          storyId, itemId,
          changes.trimStartMs ?? item.trimStartMs,
          changes.trimEndMs ?? item.trimEndMs,
        ));
      }
      await Promise.all(calls);
      await refresh();
    });

  const handleDelete = (itemId: string) =>
    void withErrorCatch(async () => {
      if (!confirm('Xoá đoạn này khỏi Story?')) return;
      await storyPort.deleteItem(storyId, itemId);
      setSelectedItemId(null);
      await refresh();
    });

  const handleDuplicate = (itemId: string) =>
    void withErrorCatch(async () => {
      await storyPort.duplicateItem(storyId, itemId);
      await refresh();
    });

  const handleSplit = (itemId: string, splitTimeMs: number) =>
    void withErrorCatch(async () => {
      await storyPort.splitItem(storyId, itemId, splitTimeMs);
      await refresh();
    });

  const handleVolumeChange = (itemId: string, volume: number) =>
    void withErrorCatch(async () => {
      await storyPort.setItemVolume(storyId, itemId, volume);
      await refresh();
    });

  const handleAddFromHistory = (historyEntryId: string) =>
    void withErrorCatch(async () => {
      // Track trống cuối cùng (đã +1 ở trackCount) — thêm mới luôn có chỗ riêng, không đè
      // lên item có sẵn.
      await storyPort.addItemFromHistory(storyId, historyEntryId, trackCount - 1);
      setShowPicker(false);
      await refresh();
    });

  const handlePlayExport = async () => {
    if (getPlayingId() === EXPORT_PLAY_ID) {
      stopAudio();
      return;
    }
    try {
      const url = await storyPort.exportAudioUrl(storyId);
      await playUrlAudio(EXPORT_PLAY_ID, url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDownload = async () => {
    setExporting(true);
    try {
      const url = await storyPort.exportAudioUrl(storyId);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${story?.name || 'story'}.wav`;
      a.click();
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 size={16} className="mr-2 animate-spin" /> Đang tải...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden" onPointerDown={() => setSelectedItemId(null)}>
      <div className="flex flex-none items-center justify-between gap-2 border-b border-border p-2">
        <h3 className="truncate text-sm font-semibold text-foreground">{story?.name}</h3>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-2xs hover:bg-muted/50"
          >
            <Plus size={13} /> Thêm đoạn
          </button>
          <button
            type="button"
            onClick={handlePlayExport}
            disabled={items.length === 0}
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-2xs hover:bg-muted/50 disabled:opacity-40"
          >
            {playingId === EXPORT_PLAY_ID ? <Square size={13} /> : <Play size={13} />}
            {playingId === EXPORT_PLAY_ID ? 'Dừng' : 'Nghe thử'}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={items.length === 0 || exporting}
            className="flex items-center gap-1 rounded-lg bg-primary px-2 py-1 text-2xs text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Trộn & Tải
          </button>
        </div>
      </div>

      {error && (
        <p className="flex-none border-b border-destructive/30 bg-destructive/10 px-2 py-1 text-2xs text-destructive">
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        <div
          className="relative"
          style={{ width: canvasWidthPx, height: trackCount * TRACK_HEIGHT }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Hàng track nền — thuần trang trí, không tương tác */}
          {Array.from({ length: trackCount }).map((_, i) => (
            <div
              key={i}
              className="pointer-events-none absolute inset-x-0 border-b border-border/60"
              style={{ top: i * TRACK_HEIGHT, height: TRACK_HEIGHT }}
            />
          ))}

          {items.map((item) => (
            <TimelineItem
              key={item.id}
              item={item}
              selected={selectedItemId === item.id}
              onSelect={setSelectedItemId}
              onCommitChange={handleCommitChange}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              onSplit={handleSplit}
              onVolumeChange={handleVolumeChange}
            />
          ))}

          {items.length === 0 && (
            <p className="pointer-events-none absolute left-3 top-3 text-2xs text-muted-foreground">
              Chưa có đoạn nào — bấm &quot;Thêm đoạn&quot; để chọn từ lịch sử đã sinh.
            </p>
          )}
        </div>
      </div>

      {showPicker && (
        <AddFromHistoryPicker
          ttsPort={ttsPort}
          onPick={handleAddFromHistory}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
