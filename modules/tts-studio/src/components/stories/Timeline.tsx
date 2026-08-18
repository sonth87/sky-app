import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GripHorizontal, Minus, Pause, Play, Plus, Square } from 'lucide-react';
import type { StoryPort, StoryWithItems } from '@sky-app/service-contracts';
import { ConfirmDialog } from '../ConfirmDialog';
import { TimelineItem, type ItemChange } from './TimelineItem';
import { DEFAULT_PX_PER_MS, MAX_PX_PER_MS, MIN_PX_PER_MS, TRACK_HEIGHT } from './timelineConstants';
import { useStoryPlaybackStore } from './storyPlaybackStore';
import type { useStoryPlayback } from './useStoryPlayback';

export interface TimelineProps {
  storyId: string;
  story: StoryWithItems;
  storyPort: StoryPort;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
  playback: ReturnType<typeof useStoryPlayback>;
}

const MIN_EDITOR_HEIGHT = 140;
const MAX_EDITOR_HEIGHT = 480;
const MIN_CANVAS_MS = 10_000; // tối thiểu 10s bề rộng canvas kể cả Story rỗng
const CANVAS_PADDING_MS = 4_000; // chừa chỗ trống bên phải item cuối để còn kéo-thả vào

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Panel editor "docked" ở đáy — waveform + zoom + playhead sống theo playback thật
 * (`useStoryPlayback`, gọi 1 LẦN duy nhất ở `StoryContent.tsx` rồi truyền props xuống đây,
 * tránh 2 AudioContext cùng lúc nếu mỗi nơi tự gọi hook). Phần lõi kéo-thả/trim mỗi item vẫn
 * là Pointer Events tự code như bản Phase 4 gốc (`TimelineItem.tsx`) — chỉ thêm waveform/zoom
 * chồng lên trên, không viết lại phần đó.
 *
 * Containment: panel `absolute bottom-0` (KHÔNG `fixed` như voicebox) trong wrapper `relative`
 * của `StoryContent.tsx` — giữ trong subtree `.tts-studio-root`, xem kế hoạch's "Quyết định
 * kiến trúc quan trọng".
 */
export function Timeline({ storyId, story, storyPort, onRefresh, onError, playback }: TimelineProps) {
  const [pxPerMs, setPxPerMs] = useState(DEFAULT_PX_PER_MS);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [regeneratingItemId, setRegeneratingItemId] = useState<string | null>(null);
  const [pendingDeleteItemId, setPendingDeleteItemId] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartY = useRef(0);
  const resizeStartHeight = useRef(0);
  const tracksRef = useRef<HTMLDivElement>(null);

  const editorHeight = useStoryPlaybackStore((s) => s.trackEditorHeight);
  const setEditorHeight = useStoryPlaybackStore((s) => s.setTrackEditorHeight);
  const isPlaying = useStoryPlaybackStore((s) => s.isPlaying);
  const currentTimeMs = useStoryPlaybackStore((s) => s.currentTimeMs);

  const items = story.items;
  const trackCount = Math.max(1, ...items.map((i) => i.track + 1)) + 1; // +1 hàng trống để kéo item vào
  const maxEndMs = Math.max(MIN_CANVAS_MS, ...items.map((i) => i.startTimeMs + (i.durationMs - i.trimStartMs - i.trimEndMs)));
  const canvasWidthPx = (maxEndMs + CANVAS_PADDING_MS) * pxPerMs;

  async function withErrorCatch(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
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
      await onRefresh();
    });

  const handleDeleteConfirm = () =>
    void withErrorCatch(async () => {
      if (!pendingDeleteItemId) return;
      const itemId = pendingDeleteItemId;
      setPendingDeleteItemId(null);
      await storyPort.deleteItem(storyId, itemId);
      setSelectedItemId(null);
      await onRefresh();
    });

  const handleDuplicate = (itemId: string) =>
    void withErrorCatch(async () => {
      await storyPort.duplicateItem(storyId, itemId);
      await onRefresh();
    });

  const handleSplit = (itemId: string, splitTimeMs: number) =>
    void withErrorCatch(async () => {
      await storyPort.splitItem(storyId, itemId, splitTimeMs);
      await onRefresh();
    });

  const handleVolumeChange = (itemId: string, volume: number) =>
    void withErrorCatch(async () => {
      await storyPort.setItemVolume(storyId, itemId, volume);
      await onRefresh();
    });

  const handleRegenerate = (itemId: string) => {
    setRegeneratingItemId(itemId);
    void withErrorCatch(async () => {
      try {
        await storyPort.regenerateItem(storyId, itemId);
        await onRefresh();
      } finally {
        setRegeneratingItemId(null);
      }
    });
  };

  // Đọc `isPlaying` qua `getState()` (không phải biến `isPlaying` đã destructure ở trên) — hàm
  // này được gọi từ closure phím tắt (effect deps `[selectedItemId]`, không re-tạo mỗi lần
  // isPlaying đổi), nên PHẢI tự lấy state mới nhất tại thời điểm gọi thay vì dựa vào giá trị
  // đã đóng gói lúc effect đăng ký listener — nếu không, bấm Space sau khi bấm nút Play trên
  // toolbar có thể dùng nhầm giá trị isPlaying cũ.
  const handlePlayPause = () => {
    if (useStoryPlaybackStore.getState().isPlaying) playback.pause();
    else void playback.play();
  };

  // Zoom bounds — giữ trong khoảng cố định (không tự co giãn theo container width như
  // voicebox's zoom-theo-container, đơn giản hoá cho v1 của phần này).
  const handleZoomIn = () => setPxPerMs((v) => Math.min(MAX_PX_PER_MS, v * 1.4));
  const handleZoomOut = () => setPxPerMs((v) => Math.max(MIN_PX_PER_MS, v / 1.4));

  const handleResizeStart = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartY.current = e.clientY;
    resizeStartHeight.current = editorHeight;
  };

  useEffect(() => {
    if (!isResizing) return;
    function onMove(e: PointerEvent) {
      const deltaY = resizeStartY.current - e.clientY;
      setEditorHeight(Math.min(MAX_EDITOR_HEIGHT, Math.max(MIN_EDITOR_HEIGHT, resizeStartHeight.current + deltaY)));
    }
    function onUp() { setIsResizing(false); }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [isResizing, setEditorHeight]);

  const handleTimelineClick = (e: React.MouseEvent<HTMLElement>) => {
    if (!tracksRef.current) return;
    const rect = tracksRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + tracksRef.current.scrollLeft;
    playback.seek(Math.max(0, x / pxPerMs));
    setSelectedItemId(null);
  };

  // Phím tắt — chỉ khi không đang gõ vào ô nhập nào (input/textarea).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === ' ') { e.preventDefault(); handlePlayPause(); }
      else if (e.key === 'Escape') setSelectedItemId(null);
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedItemId) {
        e.preventDefault();
        setPendingDeleteItemId(selectedItemId);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlePlayPause đọc isPlaying mới nhất qua store getState() gián tiếp qua closure ổn định đủ dùng ở đây
  }, [selectedItemId]);

  const timeMarkers = useMemo(() => {
    const markers: number[] = [];
    let intervalMs = 5000;
    if (pxPerMs > 0.1) intervalMs = 1000;
    else if (pxPerMs > 0.05) intervalMs = 2000;
    else if (pxPerMs < 0.02) intervalMs = 10000;
    for (let ms = 0; ms <= maxEndMs + intervalMs; ms += intervalMs) markers.push(ms);
    return markers;
  }, [maxEndMs, pxPerMs]);

  const playheadLeft = currentTimeMs * pxPerMs;

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-10 flex flex-col border-t border-border bg-background/95 backdrop-blur"
      style={{ height: editorHeight }}
    >
      <button
        type="button"
        onPointerDown={handleResizeStart}
        aria-label="Đổi chiều cao panel"
        className="flex h-2 flex-none cursor-ns-resize items-center justify-center hover:bg-muted/50"
      >
        <GripHorizontal size={12} className="text-muted-foreground/50" />
      </button>

      <div className="flex flex-none items-center justify-between gap-2 border-b border-border px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePlayPause}
            className="rounded p-1 text-foreground hover:bg-muted"
            title="Phát/Tạm dừng (Space)"
          >
            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button
            type="button"
            onClick={playback.stop}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
            title="Dừng hẳn"
          >
            <Square size={13} />
          </button>
          <span className="ml-1 text-2xs tabular-nums text-muted-foreground">
            {formatTime(currentTimeMs)} / {formatTime(playback.totalDurationMs)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-2xs text-muted-foreground">Zoom</span>
          <button type="button" onClick={handleZoomOut} className="rounded p-1 text-muted-foreground hover:bg-muted"><Minus size={12} /></button>
          <button type="button" onClick={handleZoomIn} className="rounded p-1 text-muted-foreground hover:bg-muted"><Plus size={12} /></button>
        </div>
      </div>

      <div
        ref={tracksRef}
        className="min-h-0 flex-1 overflow-auto"
        onPointerDown={() => setSelectedItemId(null)}
      >
        {/* Ruler thời gian */}
        <button
          type="button"
          onClick={handleTimelineClick}
          className="relative block h-5 w-full cursor-pointer border-b border-border bg-muted/20 text-left"
          style={{ width: canvasWidthPx }}
          aria-label="Tua theo thời gian"
        >
          {timeMarkers.map((ms) => (
            <div key={ms} className="absolute top-0 h-full" style={{ left: ms * pxPerMs }}>
              <div className="h-1.5 w-px bg-border" />
              <span className="ml-1 select-none text-2xs text-muted-foreground">{formatTime(ms)}</span>
            </div>
          ))}
        </button>

        <div
          className="relative"
          style={{ width: canvasWidthPx, height: trackCount * TRACK_HEIGHT }}
          onPointerDown={(e) => e.stopPropagation()}
        >
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
              storyId={storyId}
              storyPort={storyPort}
              pxPerMs={pxPerMs}
              selected={selectedItemId === item.id}
              onSelect={setSelectedItemId}
              onCommitChange={handleCommitChange}
              onDelete={(id) => setPendingDeleteItemId(id)}
              onDuplicate={handleDuplicate}
              onSplit={handleSplit}
              onVolumeChange={handleVolumeChange}
              onRegenerate={handleRegenerate}
              onVersionChanged={() => void onRefresh()}
              regenerating={regeneratingItemId === item.id}
            />
          ))}

          {items.length === 0 && (
            <p className="pointer-events-none absolute left-3 top-3 text-2xs text-muted-foreground">
              Chưa có đoạn nào — bấm &quot;Thêm đoạn&quot; để chọn từ lịch sử đã sinh.
            </p>
          )}

          {/* Playhead */}
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-primary"
            style={{ left: playheadLeft }}
          >
            <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-primary" />
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={pendingDeleteItemId !== null}
        title="Xoá đoạn này khỏi Story?"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setPendingDeleteItemId(null)}
      />
    </div>
  );
}
