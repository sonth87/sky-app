import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Download, Loader2, Pause, Play, Plus } from 'lucide-react';
import type { EffectPresetPort, StoryItem, StoryPort, StoryWithItems, TtsPort } from '@sky-app/service-contracts';
import { AlertDialog } from '../AlertDialog';
import { ConfirmDialog } from '../ConfirmDialog';
import { AddFromHistoryPicker } from './AddFromHistoryPicker';
import { FloatingGenerateBox } from './FloatingGenerateBox';
import { SortableStoryItemCard } from './StoryItemCard';
import { Timeline } from './Timeline';
import { useStoryPlayback } from './useStoryPlayback';
import { useStoryPlaybackStore } from './storyPlaybackStore';

export interface StoryContentProps {
  storyId: string;
  storyPort: StoryPort;
  ttsPort: TtsPort;
  effectPresetPort?: EffectPresetPort;
}

const FLOATING_BOX_HEIGHT = 56; // ô sinh giọng nổi — chừa chỗ dưới đáy list, tránh đè lên item cuối

function isCurrentlyPlayingItem(item: StoryItem, isPlaying: boolean, currentTimeMs: number): boolean {
  if (!isPlaying) return false;
  const effectiveDuration = item.durationMs - item.trimStartMs - item.trimEndMs;
  return currentTimeMs >= item.startTimeMs && currentTimeMs < item.startTimeMs + effectiveDuration;
}

/**
 * Nội dung chính bên phải (khác `StoryList` bên trái) — mirror voicebox's tách
 * `StoryContent`/`StoryTrackEditor`: list dọc sortable (đọc/thêm/xoá/regenerate nhanh) làm nội
 * dung chính, `Timeline` (editor waveform+zoom+kéo-thả pixel) docked ở đáy khi Story có item.
 * `useStoryPlayback` gọi Ở ĐÂY (1 lần) rồi truyền `playback` xuống cả `Timeline` lẫn từng
 * `StoryItemCard` ("Phát từ đây") — tránh 2 AudioContext cùng tồn tại nếu mỗi nơi tự gọi hook.
 */
export function StoryContent({ storyId, storyPort, ttsPort, effectPresetPort }: StoryContentProps) {
  const [story, setStory] = useState<StoryWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pendingDeleteItemId, setPendingDeleteItemId] = useState<string | null>(null);
  const [regeneratingItemId, setRegeneratingItemId] = useState<string | null>(null);

  const isPlaying = useStoryPlaybackStore((s) => s.isPlaying);
  const currentTimeMs = useStoryPlaybackStore((s) => s.currentTimeMs);
  const trackEditorHeight = useStoryPlaybackStore((s) => s.trackEditorHeight);

  const items = story?.items ?? [];
  const playback = useStoryPlayback(storyId, items, storyPort);

  const refresh = useCallback(async () => {
    try {
      const fresh = await storyPort.get(storyId);
      setStory(fresh);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [storyPort, storyId]);

  useEffect(() => {
    setLoading(true);
    playback.stop();
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ load lại khi ĐỔI Story, refresh() tự đọc storyId mới nhất qua closure
  }, [storyId]);

  const sortedItems = useMemo(() => [...items].sort((a, b) => a.startTimeMs - b.startTimeMs), [items]);

  const trackCount = Math.max(1, ...items.map((i) => i.track + 1)) + 1;

  const handleAddFromHistory = async (historyEntryId: string) => {
    try {
      await storyPort.addItemFromHistory(storyId, historyEntryId, trackCount - 1);
      setShowPicker(false);
      await refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDeleteItemId) return;
    const itemId = pendingDeleteItemId;
    setPendingDeleteItemId(null);
    try {
      await storyPort.deleteItem(storyId, itemId);
      await refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRegenerate = async (itemId: string) => {
    setRegeneratingItemId(itemId);
    try {
      await storyPort.regenerateItem(storyId, itemId);
      await refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setRegeneratingItemId(null);
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeItem = items.find((i) => i.id === active.id);
    const overItem = items.find((i) => i.id === over.id);
    // Chỉ sắp lại khi 2 item CÙNG track — kéo xuyên track vẫn phải qua canvas (editor docked),
    // xem `reorderItems`'s docstring phía service-contracts.
    if (!activeItem || !overItem || activeItem.track !== overItem.track) return;

    const sameTrack = sortedItems.filter((i) => i.track === activeItem.track);
    const oldIndex = sameTrack.findIndex((i) => i.id === active.id);
    const newIndex = sameTrack.findIndex((i) => i.id === over.id);
    const newOrder = arrayMove(sameTrack, oldIndex, newIndex).map((i) => i.id);

    void storyPort.reorderItems(storyId, activeItem.track, newOrder)
      .then(() => refresh())
      .catch((err) => setErrorMessage(err instanceof Error ? err.message : String(err)));
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 size={16} className="mr-2 animate-spin" /> Đang tải...
      </div>
    );
  }

  if (!story) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Không tìm thấy Story.
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div className="flex flex-none items-center justify-between gap-2 border-b border-border p-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{story.name}</h3>
          {story.description && <p className="truncate text-2xs text-muted-foreground">{story.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-2xs hover:bg-muted/50"
          >
            <Plus size={13} /> Thêm đoạn
          </button>
          <button
            type="button"
            onClick={() => (isPlaying ? playback.pause() : void playback.play())}
            disabled={items.length === 0}
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-2xs hover:bg-muted/50 disabled:opacity-40"
          >
            {isPlaying ? <Pause size={13} /> : <Play size={13} />}
            {isPlaying ? 'Tạm dừng' : 'Nghe toàn bộ'}
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

      <div
        className="min-h-0 flex-1 overflow-y-auto p-2"
        style={{ paddingBottom: (items.length > 0 ? trackEditorHeight : 0) + FLOATING_BOX_HEIGHT + 16 }}
      >
        {items.length === 0 ? (
          <p className="p-4 text-center text-2xs text-muted-foreground">
            Chưa có đoạn nào — bấm &quot;Thêm đoạn&quot; để chọn từ lịch sử đã sinh.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sortedItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1">
                {sortedItems.map((item) => (
                  <SortableStoryItemCard
                    key={item.id}
                    id={item.id}
                    item={item}
                    isCurrentlyPlaying={isCurrentlyPlayingItem(item, isPlaying, currentTimeMs)}
                    regenerating={regeneratingItemId === item.id}
                    onPlayFromHere={() => void playback.play(item.startTimeMs)}
                    onRegenerate={() => void handleRegenerate(item.id)}
                    onDelete={() => setPendingDeleteItemId(item.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {items.length > 0 && (
        <Timeline
          storyId={storyId}
          story={story}
          storyPort={storyPort}
          onRefresh={refresh}
          onError={setErrorMessage}
          playback={playback}
        />
      )}

      <FloatingGenerateBox
        storyId={storyId}
        storyPort={storyPort}
        ttsPort={ttsPort}
        effectPresetPort={effectPresetPort}
        track={trackCount - 1}
        onAdded={() => void refresh()}
        bottomOffset={items.length > 0 ? trackEditorHeight : 0}
      />

      {showPicker && (
        <AddFromHistoryPicker
          ttsPort={ttsPort}
          onPick={(id) => void handleAddFromHistory(id)}
          onClose={() => setShowPicker(false)}
        />
      )}

      <ConfirmDialog
        open={pendingDeleteItemId !== null}
        title="Xoá đoạn này khỏi Story?"
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setPendingDeleteItemId(null)}
      />
      <AlertDialog
        open={errorMessage !== null}
        message={errorMessage ?? ''}
        onClose={() => setErrorMessage(null)}
      />
    </div>
  );
}
