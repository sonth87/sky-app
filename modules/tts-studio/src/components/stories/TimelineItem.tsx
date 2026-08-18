import { useEffect, useRef, useState } from 'react';
import { Copy, Scissors, Trash2 } from 'lucide-react';
import type { StoryItem } from '@sky-app/service-contracts';
import { DRAG_THRESHOLD_PX, MIN_EFFECTIVE_MS, PX_PER_MS, TRACK_HEIGHT } from './timelineConstants';

export interface ItemChange {
  startTimeMs?: number;
  track?: number;
  trimStartMs?: number;
  trimEndMs?: number;
}

export interface TimelineItemProps {
  item: StoryItem;
  selected: boolean;
  onSelect: (itemId: string) => void;
  /** Gọi lúc THẢ chuột (kéo xong), không phải mỗi pixel di chuyển — Timeline quyết định gọi
   *  `moveItem`/`trimItem` (có thể cả 2) tuỳ field nào đổi. */
  onCommitChange: (itemId: string, changes: ItemChange) => void;
  onDelete: (itemId: string) => void;
  onDuplicate: (itemId: string) => void;
  onSplit: (itemId: string, splitTimeMs: number) => void;
  onVolumeChange: (itemId: string, volume: number) => void;
}

type DragKind = 'move' | 'trim-left' | 'trim-right';
interface DragState {
  kind: DragKind;
  startX: number;
  startY: number;
  moved: boolean;
  orig: { startTimeMs: number; track: number; trimStartMs: number; trimEndMs: number };
}

/**
 * 1 đoạn audio trên timeline — box `absolute`, kéo thân để đổi vị trí (2D: thời gian + track),
 * kéo 2 dải mỏng ở mép để trim. Tự code bằng Pointer Events (không dùng dnd-kit — kéo tự do
 * 2D không khớp mô hình sortable-list của thư viện đó, xem kế hoạch Phase 4).
 *
 * Trim mép TRÁI giữ mép PHẢI cố định (kéo phải → trimStartMs tăng VÀ startTimeMs tăng cùng
 * lượng, điểm kết thúc không đổi) — quy ước chuẩn của editor audio. Trim mép PHẢI giữ mép
 * TRÁI cố định (chỉ trimEndMs đổi, startTimeMs không đổi).
 */
export function TimelineItem({
  item, selected, onSelect, onCommitChange, onDelete, onDuplicate, onSplit, onVolumeChange,
}: TimelineItemProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [draft, setDraft] = useState<ItemChange | null>(null);
  const draftRef = useRef<ItemChange | null>(null);
  const movedRef = useRef(false);

  const effective = {
    startTimeMs: draft?.startTimeMs ?? item.startTimeMs,
    track: draft?.track ?? item.track,
    trimStartMs: draft?.trimStartMs ?? item.trimStartMs,
    trimEndMs: draft?.trimEndMs ?? item.trimEndMs,
  };
  const effectiveDurationMs = Math.max(0, item.durationMs - effective.trimStartMs - effective.trimEndMs);
  const left = effective.startTimeMs * PX_PER_MS;
  const width = Math.max(6, effectiveDurationMs * PX_PER_MS);
  const top = effective.track * TRACK_HEIGHT;

  function beginDrag(kind: DragKind) {
    return (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      movedRef.current = false;
      setDrag({
        kind, startX: e.clientX, startY: e.clientY, moved: false,
        orig: { startTimeMs: item.startTimeMs, track: item.track, trimStartMs: item.trimStartMs, trimEndMs: item.trimEndMs },
      });
    };
  }

  useEffect(() => {
    if (!drag) return;

    function onMove(e: PointerEvent) {
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) movedRef.current = true;
      const dMs = dx / PX_PER_MS;

      let next: ItemChange;
      if (drag.kind === 'move') {
        const dTrack = Math.round(dy / TRACK_HEIGHT);
        next = {
          startTimeMs: Math.max(0, Math.round(drag.orig.startTimeMs + dMs)),
          track: Math.max(0, drag.orig.track + dTrack),
        };
      } else if (drag.kind === 'trim-left') {
        const maxTrimStart = item.durationMs - drag.orig.trimEndMs - MIN_EFFECTIVE_MS;
        const trimStartMs = Math.min(maxTrimStart, Math.max(0, Math.round(drag.orig.trimStartMs + dMs)));
        const delta = trimStartMs - drag.orig.trimStartMs;
        next = { trimStartMs, startTimeMs: Math.max(0, drag.orig.startTimeMs + delta) };
      } else {
        const maxTrimEnd = item.durationMs - drag.orig.trimStartMs - MIN_EFFECTIVE_MS;
        const trimEndMs = Math.min(maxTrimEnd, Math.max(0, Math.round(drag.orig.trimEndMs - dMs)));
        next = { trimEndMs };
      }
      draftRef.current = next;
      setDraft(next);
    }

    function onUp() {
      setDrag(null);
      if (movedRef.current && draftRef.current) {
        onCommitChange(item.id, draftRef.current);
      } else {
        // Không di chuyển đủ ngưỡng — coi là click, không phải kéo. Chọn item thay vì commit.
        onSelect(item.id);
      }
      draftRef.current = null;
      setDraft(null);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `drag`/`item` chỉ đọc lúc bắt đầu kéo, đổi giữa chừng không cần re-attach
  }, [drag]);

  return (
    <div
      className={
        selected
          ? 'group absolute flex h-14 flex-col justify-center rounded-lg border-2 border-primary bg-primary/15 px-2 shadow-sm'
          : 'group absolute flex h-14 flex-col justify-center rounded-lg border border-border bg-card px-2 shadow-sm hover:border-primary/50'
      }
      style={{ left, width, top: top + (TRACK_HEIGHT - 56) / 2 }}
      onPointerDown={beginDrag('move')}
    >
      <div className="pointer-events-none truncate text-2xs font-medium text-foreground">
        {item.sourceText || '(không có văn bản)'}
      </div>
      {item.voiceLabel && (
        <div className="pointer-events-none truncate text-2xs text-muted-foreground">{item.voiceLabel}</div>
      )}

      {/* Handle trim 2 mép — dải mỏng, stopPropagation để không kích hoạt kéo-di-chuyển của
          box cha (xem kế hoạch's rủi ro "Resize handle đè lên vùng kéo-di-chuyển"). */}
      <div
        className="absolute inset-y-0 left-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100"
        onPointerDown={beginDrag('trim-left')}
      >
        <div className="mx-auto h-full w-0.5 bg-primary" />
      </div>
      <div
        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100"
        onPointerDown={beginDrag('trim-right')}
      >
        <div className="mx-auto h-full w-0.5 bg-primary" />
      </div>

      {selected && (
        <div
          className="absolute -top-9 left-0 flex items-center gap-1 rounded-lg border border-border bg-popover px-1.5 py-1 shadow-md"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={item.volume}
            onChange={(e) => onVolumeChange(item.id, Number(e.target.value))}
            className="w-16"
            title={`Âm lượng: ${item.volume.toFixed(2)}x`}
          />
          <button
            type="button"
            title="Tách tại giữa"
            onClick={() => onSplit(item.id, Math.floor(effectiveDurationMs / 2))}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Scissors size={13} />
          </button>
          <button
            type="button"
            title="Nhân bản"
            onClick={() => onDuplicate(item.id)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Copy size={13} />
          </button>
          <button
            type="button"
            title="Xoá"
            onClick={() => onDelete(item.id)}
            className="rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
