import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { Box, LayoutItem, LayoutVariant } from '@sky-app/slide-shared';
import { resizeItemCommand, rotateItemCommand, computeSnap, accumulateRotation, angleFromCenter } from '@sky-app/layout-editor-core';
import type { Editor, Guide } from '@sky-app/layout-editor-core';

export const MIN_ITEM_SIZE = 20;
export const SNAP_THRESHOLD = 8;

/** Item khoá (item.locked) — chỉ hiện chấm trang trí, không bắt sự kiện gì (khác SelectionHandles
 * bên dưới, dùng cho item bình thường). */
export function SelectionHandlesStatic() {
  const dot = { position: 'absolute' as const, width: 8, height: 8, background: '#fff', border: '1.5px solid var(--accent-color, #4b57e6)', borderRadius: 2 };
  return (
    <>
      <div style={{ ...dot, left: -4, top: -4 }} />
      <div style={{ ...dot, right: -4, top: -4 }} />
      <div style={{ ...dot, left: -4, bottom: -4 }} />
      <div style={{ ...dot, right: -4, bottom: -4 }} />
    </>
  );
}

/** 8 hướng resize — mỗi hướng khai rõ trục nào bị ảnh hưởng (x/w theo ngang, y/h theo dọc) để
 * tính box mới từ 1 công thức chung, tránh 8 nhánh if/else copy-paste dễ sai dấu +/-. */
export type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const HANDLE_POS: Record<HandleDir, { top?: number; bottom?: number; left?: number; right?: number; cursor: string }> = {
  nw: { top: -4, left: -4, cursor: 'nwse-resize' },
  n: { top: -4, left: 0, cursor: 'ns-resize' },
  ne: { top: -4, right: -4, cursor: 'nesw-resize' },
  e: { top: 0, right: -4, cursor: 'ew-resize' },
  se: { bottom: -4, right: -4, cursor: 'nwse-resize' },
  s: { bottom: -4, left: 0, cursor: 'ns-resize' },
  sw: { bottom: -4, left: -4, cursor: 'nesw-resize' },
  w: { top: 0, left: -4, cursor: 'ew-resize' },
};

/** Áp dụng delta (đơn vị canvas-logic, đã quy đổi qua pointerScaleX/Y) vào box theo hướng handle
 * — mỗi hướng chỉ đụng đúng field liên quan (VD 'e' chỉ đổi w, không đụng x/y/h). */
export function applyResizeDelta(from: Box, dir: HandleDir, dx: number, dy: number): Box {
  let { x, y, w, h } = from;
  if (dir.includes('w')) {
    x = from.x + dx;
    w = from.w - dx;
  }
  if (dir.includes('e')) {
    w = from.w + dx;
  }
  if (dir.includes('n')) {
    y = from.y + dy;
    h = from.h - dy;
  }
  if (dir.includes('s')) {
    h = from.h + dy;
  }
  // Min-size clamp — nếu w/h dưới ngưỡng, giữ cạnh ĐỐI DIỆN cố định (không cho x/y "vượt qua"
  // cạnh kia, tránh box lật ngược dấu w/h âm).
  if (w < MIN_ITEM_SIZE) {
    if (dir.includes('w')) x = from.x + from.w - MIN_ITEM_SIZE;
    w = MIN_ITEM_SIZE;
  }
  if (h < MIN_ITEM_SIZE) {
    if (dir.includes('n')) y = from.y + from.h - MIN_ITEM_SIZE;
    h = MIN_ITEM_SIZE;
  }
  return { ...from, x, y, w, h };
}

export interface SelectionHandlesProps {
  box: Box;
  editor: Editor;
  variant: LayoutVariant;
  itemId: string;
  /** Có giá trị khi item nằm trong itemTemplate của 1 LoopItem (Bước 10) — truyền xuống
   * resizeItemCommand/rotateItemCommand để thao tác đúng ngữ cảnh. */
  loopItemId?: string;
  items: LayoutItem[];
  refW: number;
  refH: number;
  pointerScaleX: number;
  pointerScaleY: number;
  onGuidesChange: (guides: Guide[]) => void;
}

/** v0.3.0 — resize CHỈ đúng khi rotation===0 (kéo theo trục world, không theo trục cục bộ đã
 * xoay). Item đã xoay vẫn kéo được nhưng có thể lệch trực quan — chấp nhận được ở bước này, xem
 * comment tương tự ở wrapStyle (snap cũng theo AABB chưa xoay). */
export function SelectionHandles({ box, editor, variant, itemId, loopItemId, items, refW, refH, pointerScaleX, pointerScaleY, onGuidesChange }: SelectionHandlesProps) {
  const dragRef = useRef<{ dir: HandleDir; startX: number; startY: number; from: Box; lastTo: Box } | null>(null);

  const onHandlePointerDown = useCallback(
    (dir: HandleDir) => (e: ReactPointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      dragRef.current = { dir, startX: e.clientX, startY: e.clientY, from: box, lastTo: box };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [box],
  );

  const onHandlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = (e.clientX - drag.startX) / pointerScaleX;
      const dy = (e.clientY - drag.startY) / pointerScaleY;
      const rawTo = applyResizeDelta(drag.from, drag.dir, dx, dy);

      const otherBoxes = items.filter((i) => i.id !== itemId).map((i) => i.box);
      const { snappedBox, guides } = computeSnap(rawTo, otherBoxes, { w: refW, h: refH }, SNAP_THRESHOLD);
      onGuidesChange(guides);

      editor.store.getState().dispatch(resizeItemCommand(variant.aspect.id, itemId, drag.lastTo, snappedBox, loopItemId));
      drag.lastTo = snappedBox;
    },
    [editor, itemId, variant.aspect.id, items, refW, refH, loopItemId, pointerScaleX, pointerScaleY, onGuidesChange],
  );

  const onHandlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      dragRef.current = null;
      onGuidesChange([]);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    },
    [onGuidesChange],
  );

  // Handle xoay — dragRef riêng (KHÁC dragRef ở trên, dùng cho 8 handle resize) vì cần lưu thêm
  // `lastAngle` (góc màn hình lần đo trước) để accumulateRotation() tính delta, không phải góc
  // tuyệt đối (tránh giật khi qua biên 180°/-180°, xem rotation.ts).
  const rotateDragRef = useRef<{ fromBox: Box; lastTo: Box; lastAngle: number } | null>(null);

  const onRotatePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      // Tâm HÌNH HỌC của bounding rect đã xoay TRÙNG tâm xoay thật (transformOrigin 50% 50% —
      // xoay đối xứng qua tâm không đổi vị trí tâm) — dùng cách này thay vì tự tính originX/Y +
      // pointerScaleX/Y từ Canvas cha, đơn giản hơn nhiều mà vẫn chính xác.
      const itemRect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
      const cx = itemRect.left + itemRect.width / 2;
      const cy = itemRect.top + itemRect.height / 2;
      const angle = angleFromCenter(cx, cy, e.clientX, e.clientY);
      rotateDragRef.current = { fromBox: box, lastTo: box, lastAngle: angle };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [box],
  );

  const onRotatePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = rotateDragRef.current;
      if (!drag) return;
      const itemRect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
      const cx = itemRect.left + itemRect.width / 2;
      const cy = itemRect.top + itemRect.height / 2;
      const angle = angleFromCenter(cx, cy, e.clientX, e.clientY);
      const newRotation = accumulateRotation(drag.lastTo.rotation ?? 0, drag.lastAngle, angle);
      const to: Box = { ...drag.lastTo, rotation: newRotation };

      editor.store.getState().dispatch(rotateItemCommand(variant.aspect.id, itemId, drag.lastTo, to, loopItemId));
      drag.lastTo = to;
      drag.lastAngle = angle;
    },
    [editor, itemId, variant.aspect.id, loopItemId],
  );

  const onRotatePointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    rotateDragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  return (
    <>
      {(Object.keys(HANDLE_POS) as HandleDir[]).map((dir) => {
        const pos = HANDLE_POS[dir];
        return (
          <div
            key={dir}
            aria-label={`Đổi kích thước — ${dir}`}
            onPointerDown={onHandlePointerDown(dir)}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            style={{
              position: 'absolute',
              width: 8,
              height: 8,
              background: '#fff',
              border: '1.5px solid var(--accent-color, #4b57e6)',
              borderRadius: 2,
              cursor: pos.cursor,
              top: pos.top,
              bottom: pos.bottom,
              left: pos.left === 0 ? '50%' : pos.left,
              right: pos.right,
              transform: pos.left === 0 ? 'translateX(-50%)' : undefined,
              touchAction: 'none',
            }}
          />
        );
      })}
      {/* Đường nối + handle xoay tròn — đặt phía TRÊN box (cách 20px), xoay theo item vì là con
          trực tiếp của div đã transform:rotate() (xem wrapStyle ở CanvasItemView). */}
      <div style={{ position: 'absolute', left: '50%', top: -20, width: 1, height: 20, background: 'var(--accent-color, #4b57e6)', transform: 'translateX(-50%)', pointerEvents: 'none' }} />
      <div
        aria-label="Xoay"
        onPointerDown={onRotatePointerDown}
        onPointerMove={onRotatePointerMove}
        onPointerUp={onRotatePointerUp}
        style={{
          position: 'absolute',
          left: '50%',
          top: -28,
          width: 10,
          height: 10,
          background: '#fff',
          border: '1.5px solid var(--accent-color, #4b57e6)',
          borderRadius: '50%',
          cursor: 'grab',
          transform: 'translateX(-50%)',
          touchAction: 'none',
        }}
      />
    </>
  );
}
