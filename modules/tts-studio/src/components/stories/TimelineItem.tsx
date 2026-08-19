import { useEffect, useRef, useState } from 'react';
import { Check, Copy, RotateCcw, Scissors, Trash2 } from 'lucide-react';
import type { StoryItem, StoryItemVersion, StoryPort } from '@sky-app/service-contracts';
import { DRAG_THRESHOLD_PX, MIN_EFFECTIVE_MS, TRACK_HEIGHT } from './timelineConstants';
import { ClipWaveform } from './ClipWaveform';
import { DropdownMenu } from '../DropdownMenu';

export interface ItemChange {
  startTimeMs?: number;
  track?: number;
  trimStartMs?: number;
  trimEndMs?: number;
}

export interface TimelineItemProps {
  item: StoryItem;
  storyId: string;
  storyPort: StoryPort;
  pxPerMs: number;
  /** Danh sách SỐ track đang hiện trên canvas, đã sắp XẾP TĂNG DẦN — vị trí hiển thị (hàng
   *  thứ mấy) của 1 item là `tracks.indexOf(item.track)`, KHÔNG phải `item.track` trực tiếp
   *  (khác trước — cho phép track âm/thưa sau khi thêm nút +/- track thủ công ở Timeline.tsx,
   *  xem file đó's `handleAddTrackAbove/Below`). */
  tracks: number[];
  selected: boolean;
  onSelect: (itemId: string) => void;
  /** Gọi lúc THẢ chuột (kéo xong), không phải mỗi pixel di chuyển — Timeline quyết định gọi
   *  `moveItem`/`trimItem` (có thể cả 2) tuỳ field nào đổi. */
  onCommitChange: (itemId: string, changes: ItemChange) => void;
  onDelete: (itemId: string) => void;
  onDuplicate: (itemId: string) => void;
  onSplit: (itemId: string, splitTimeMs: number) => void;
  onVolumeChange: (itemId: string, volume: number) => void;
  onRegenerate: (itemId: string) => void;
  /** Gọi sau khi đổi version thành công (`VersionPicker`) — Timeline tự `refresh()`, khác
   *  `onRegenerate` (kích hoạt sinh MỚI, không chỉ đọc lại). */
  onVersionChanged: () => void;
  regenerating: boolean;
}

type DragKind = 'move' | 'trim-left' | 'trim-right';
interface DragState {
  kind: DragKind;
  startX: number;
  startY: number;
  moved: boolean;
  orig: { startTimeMs: number; track: number; trimStartMs: number; trimEndMs: number };
}

/** Dropdown chọn lại 1 bản đã lưu (version) — lazy-load khi mở, đúng cách tránh N+1 query mọi
 *  item cùng lúc (`can_regenerate` gọn đủ để biết CÓ version hay không, danh sách chỉ cần khi
 *  người dùng thật sự mở dropdown). */
function VersionPicker({
  storyId, itemId, storyPort, onPicked,
}: { storyId: string; itemId: string; storyPort: StoryPort; onPicked: () => void }) {
  const [versions, setVersions] = useState<StoryItemVersion[] | null>(null);

  useEffect(() => {
    let alive = true;
    storyPort.listItemVersions(storyId, itemId).then((v) => { if (alive) setVersions(v); }).catch(() => { if (alive) setVersions([]); });
    return () => { alive = false; };
  }, [storyId, itemId, storyPort]);

  if (versions === null) return <div className="px-2.5 py-1.5 text-2xs text-muted-foreground">Đang tải...</div>;
  if (versions.length === 0) return <div className="px-2.5 py-1.5 text-2xs text-muted-foreground">Chưa có bản nào khác.</div>;

  return (
    <>
      {versions.map((v) => (
        <button
          key={v.id}
          type="button"
          onClick={() => { void storyPort.setItemVersion(storyId, itemId, v.id).then(onPicked); }}
          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-2xs text-foreground hover:bg-muted/60"
        >
          <Check size={11} className="opacity-0" />
          {v.label}
        </button>
      ))}
    </>
  );
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
  item, storyId, storyPort, pxPerMs, tracks, selected, onSelect, onCommitChange, onDelete, onDuplicate,
  onSplit, onVolumeChange, onRegenerate, onVersionChanged, regenerating,
}: TimelineItemProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [draft, setDraft] = useState<ItemChange | null>(null);
  const draftRef = useRef<ItemChange | null>(null);
  const movedRef = useRef(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    storyPort.itemAudioUrl(storyId, item.id).then((url) => { if (alive) setAudioUrl(url); }).catch(() => {});
    return () => { alive = false; };
    // Chỉ tải lại URL khi audioFile đổi thật (regenerate/set-version) — không phải mỗi lần
    // trim/move re-render item.
  }, [storyId, item.id, item.audioFile, storyPort]);

  const effective = {
    startTimeMs: draft?.startTimeMs ?? item.startTimeMs,
    track: draft?.track ?? item.track,
    trimStartMs: draft?.trimStartMs ?? item.trimStartMs,
    trimEndMs: draft?.trimEndMs ?? item.trimEndMs,
  };
  const effectiveDurationMs = Math.max(0, item.durationMs - effective.trimStartMs - effective.trimEndMs);
  const left = effective.startTimeMs * pxPerMs;
  const width = Math.max(6, effectiveDurationMs * pxPerMs);
  const trackIndex = Math.max(0, tracks.indexOf(effective.track));
  const top = trackIndex * TRACK_HEIGHT;

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
      const dMs = dx / pxPerMs;

      let next: ItemChange;
      if (drag.kind === 'move') {
        // Kéo theo INDEX hàng hiển thị rồi map ngược ra SỐ track thật qua `tracks` — track có
        // thể âm/thưa (sau khi thêm bằng nút +/- ở Timeline.tsx), không còn phép cộng số
        // nguyên trực tiếp như trước (`orig.track + dTrack`) được nữa.
        const origIndex = Math.max(0, tracks.indexOf(drag.orig.track));
        const dIndex = Math.round(dy / TRACK_HEIGHT);
        const newIndex = Math.max(0, Math.min(tracks.length - 1, origIndex + dIndex));
        next = {
          startTimeMs: Math.max(0, Math.round(drag.orig.startTimeMs + dMs)),
          track: tracks[newIndex] ?? drag.orig.track,
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
  }, [drag, pxPerMs, tracks]);

  return (
    <div
      className={
        selected
          ? 'group absolute flex h-14 flex-col justify-center overflow-hidden rounded-lg border-2 border-primary bg-primary/15 px-2 shadow-sm'
          : 'group absolute flex h-14 flex-col justify-center overflow-hidden rounded-lg border border-border bg-card px-2 shadow-sm hover:border-primary/50'
      }
      style={{ left, width, top: top + (TRACK_HEIGHT - 56) / 2 }}
      onPointerDown={beginDrag('move')}
      // `click` KHÔNG bị chặn bởi stopPropagation() trên pointerdown (2 loại event tách biệt)
      // — không chặn riêng thì bấm chọn item cũng nổi bọt lên container, kích hoạt luôn
      // handleTimelineClick (tua + BỎ chọn ngay sau khi vừa chọn).
      onClick={(e) => e.stopPropagation()}
    >
      <div className="pointer-events-none absolute inset-0 top-5">
        {audioUrl && (
          <ClipWaveform
            audioUrl={audioUrl}
            width={width}
            trimStartMs={effective.trimStartMs}
            trimEndMs={effective.trimEndMs}
            durationMs={item.durationMs}
          />
        )}
      </div>

      <div className="pointer-events-none relative truncate text-2xs font-medium text-foreground">
        {item.sourceText || '(không có văn bản)'}
      </div>
      {item.voiceLabel && (
        <div className="pointer-events-none relative truncate text-2xs text-muted-foreground">{item.voiceLabel}</div>
      )}

      {/* Handle trim 2 mép — dải mỏng, stopPropagation để không kích hoạt kéo-di-chuyển của
          box cha (xem kế hoạch's rủi ro "Resize handle đè lên vùng kéo-di-chuyển"). */}
      <div
        className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100"
        onPointerDown={beginDrag('trim-left')}
      >
        <div className="mx-auto h-full w-0.5 bg-primary" />
      </div>
      <div
        className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100"
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
          {item.canRegenerate && (
            <button
              type="button"
              title="Sinh lại"
              disabled={regenerating}
              onClick={() => onRegenerate(item.id)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
            >
              <RotateCcw size={13} className={regenerating ? 'animate-spin' : undefined} />
            </button>
          )}
          {item.activeVersionId && (
            <DropdownMenu
              triggerLabel="Chọn lại bản đã sinh"
              triggerClassName="rounded px-1.5 py-1 text-2xs text-muted-foreground hover:bg-muted hover:text-foreground"
              trigger={<span>Bản khác</span>}
            >
              <VersionPicker
                storyId={storyId}
                itemId={item.id}
                storyPort={storyPort}
                onPicked={onVersionChanged}
              />
            </DropdownMenu>
          )}
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
