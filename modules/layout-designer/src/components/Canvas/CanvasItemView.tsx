import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react';
import type { Box, LayoutItem, LayoutVariant } from '@sky-app/slide-shared';
import { moveItemCommand, computeSnap } from '@sky-app/layout-editor-core';
import type { Editor, Guide } from '@sky-app/layout-editor-core';
import { SyncBadge } from '../SyncBadge.js';
import { SelectionHandles, SelectionHandlesStatic, SNAP_THRESHOLD } from './SelectionHandles.js';
import { ItemContent } from './ItemContent.js';

export interface CanvasItemViewProps {
  item: LayoutItem;
  editor: Editor;
  variant: LayoutVariant;
  /** Danh sách item ĐANG THAO TÁC — variant.items (bình thường) hoặc itemTemplate của 1 LoopItem
   * (đang edit-mode, Bước 10) — dùng để tính otherBoxes cho snap. KHÁC variant.items khi
   * loopItemId có giá trị. */
  items: LayoutItem[];
  /** refW/refH ĐANG THAO TÁC — variant.refW/refH (bình thường) hoặc itemBox.w/h (edit-mode). */
  refW: number;
  refH: number;
  /** Có giá trị khi đang ở chế độ sửa mẫu LoopItem (Bước 10) — mọi command dispatch (move/resize/
   * rotate/patch) PHẢI truyền tham số này để thao tác đúng vào itemTemplate thay vì variant.items. */
  loopItemId?: string;
  selected: boolean;
  /** Quy đổi refW×refH → khung 760×428 "logic" — dùng cho CSS (left/top/width/height/fontSize),
   * KHÔNG nhân totalScale vì artEl cha đã tự transform:scale(totalScale) cho toàn bộ nội dung con. */
  scaleX: number;
  scaleY: number;
  /** = scaleX/Y × totalScale — dùng RIÊNG để quy đổi delta CHUỘT (px màn hình thật, đã bị artEl's
   * transform phóng to totalScale lần) sang đơn vị canvas-logic khi kéo item (onPointerMove). */
  pointerScaleX: number;
  pointerScaleY: number;
  onGuidesChange: (guides: Guide[]) => void;
  resolveAssetUrl?: (path: string) => Promise<string>;
  /** true nếu item này đang LÀ CHA của ít nhất 1 item khác (tính sẵn ở Canvas — xem parentSyncKeys). */
  isSyncParent: boolean;
  /** Gọi khi double-click vào item type='loop' — undefined khi ĐANG Ở edit-mode rồi (chặn nested
   * loop, quyết định phạm vi "chỉ hỗ trợ edit-mode 1 CẤP" của Bước 10). */
  onEnterLoopEdit?: (loopId: string) => void;
  /** Gọi khi double-click vào item type='text' — mở TiptapTextEditor overlay (Bước 12). */
  onEnterTextEdit?: (textItemId: string) => void;
  /** true khi TiptapTextEditor overlay đang mở CHO ĐÚNG item này — ẩn (visibility:hidden, giữ
   * nguyên layout box, KHÔNG display:none) item gốc để tránh 2 lớp text chồng nhau lúc sửa
   * (pattern my-builder's InlineTextEditor, khảo sát 2026-07-19). */
  hiddenWhileEditing?: boolean;
}

export function CanvasItemView({
  item,
  editor,
  variant,
  items,
  refW,
  refH,
  loopItemId,
  selected,
  scaleX,
  scaleY,
  pointerScaleX,
  pointerScaleY,
  onGuidesChange,
  resolveAssetUrl,
  isSyncParent,
  onEnterLoopEdit,
  onEnterTextEdit,
  hiddenWhileEditing,
}: CanvasItemViewProps) {
  const dragRef = useRef<{ startX: number; startY: number; from: Box; lastTo: Box } | null>(null);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      // stopPropagation() chặn luôn onPointerDown của container (nơi gọi containerRef.focus())
      // — phải tự focus lại đây, nếu không thì chọn item bằng chuột sẽ không kích hoạt được
      // shortcut (Delete/mũi tên...) cho tới khi người dùng bấm thêm vào nền canvas.
      (e.currentTarget.closest('[tabindex]') as HTMLElement | null)?.focus();
      // item.locked (Bước 2 kế hoạch resize/rotate, 2026-07-18) — KHÁC syncLocked (khoá đồng bộ
      // giữa variant). setSelection() PHẢI VẪN CHẠY dù locked — nếu khoá cả việc CHỌN, PropertyPanel
      // sẽ không bao giờ hiện được nút mở khoá cho item đó nữa (deadlock UX). Chỉ chặn phần KÉO
      // (không khởi tạo dragRef) — onPointerMove tự no-op vì dragRef.current vẫn null.
      editor.store.getState().setSelection([item.id]);
      if (item.locked) return;
      dragRef.current = { startX: e.clientX, startY: e.clientY, from: item.box, lastTo: item.box };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [editor, item.id, item.box, item.locked],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = (e.clientX - drag.startX) / pointerScaleX;
      const dy = (e.clientY - drag.startY) / pointerScaleY;
      const rawTo: Box = { ...drag.from, x: drag.from.x + dx, y: drag.from.y + dy };

      const otherBoxes = items.filter((i) => i.id !== item.id).map((i) => i.box);
      const { snappedBox, guides } = computeSnap(rawTo, otherBoxes, { w: refW, h: refH }, SNAP_THRESHOLD);
      onGuidesChange(guides);

      editor.store.getState().dispatch(moveItemCommand(variant.aspect.id, item.id, drag.lastTo, snappedBox, loopItemId));
      drag.lastTo = snappedBox;
    },
    [editor, item.id, variant.aspect.id, items, refW, refH, loopItemId, pointerScaleX, pointerScaleY, onGuidesChange],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      dragRef.current = null;
      onGuidesChange([]);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    },
    [onGuidesChange],
  );

  const wrapStyle = {
    position: 'absolute' as const,
    left: item.box.x * scaleX,
    top: item.box.y * scaleY,
    width: item.box.w * scaleX,
    height: item.box.h * scaleY,
    // locked (Bước 2) — cursor 'default' báo hiệu không kéo được, khác 'move' bình thường.
    cursor: item.locked ? 'default' : 'move',
    opacity: item.opacity != null ? item.opacity / 100 : 1,
    outline: selected ? '2px solid var(--accent-color, #4b57e6)' : 'none',
    outlineOffset: 2,
    userSelect: 'none' as const,
    // Xoay quanh TÂM box (transformOrigin mặc định 50% 50% đúng ý muốn) — SelectionHandles là
    // con TRỰC TIẾP của div này nên tự động xoay theo, không cần xử lý riêng (review 2026-07-18,
    // Bước 1/12 kế hoạch resize/rotate). Snap (computeSnap, dùng cho move/resize) vẫn tính theo
    // AABB chưa xoay — item đã xoay kéo/resize có thể lệch trực quan so với đường guide, CHẤP
    // NHẬN ĐƯỢC ở giai đoạn này (xử lý snap-theo-trục-đã-xoay là việc riêng, phức tạp hơn).
    transform: item.box.rotation ? `rotate(${item.box.rotation}deg)` : undefined,
    // z-index tuỳ chỉnh (Bước 2, Box.z) — khi bằng nhau (mặc định mọi item z=undefined→0), DOM
    // order (thứ tự variant.items[]) vẫn là tie-breaker tự nhiên, giữ nguyên hành vi cũ.
    zIndex: item.box.z,
    visibility: hiddenWhileEditing ? ('hidden' as const) : undefined,
  };

  // Double-click dispatch theo item.type (Bước 10 kế hoạch resize/rotate, 2026-07-18) — CHỈ
  // 'loop' xử lý ở bước này ('text' để dành Bước 12 Rich-text, DÙNG CHUNG cơ chế dispatch này,
  // không viết double-click logic riêng lần 2). onEnterLoopEdit undefined khi ĐANG edit-mode rồi
  // → double-click vào LoopItem lồng trong LoopItem khác KHÔNG có tác dụng (chặn nested loop).
  const onDoubleClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      if (item.type === 'loop' && onEnterLoopEdit) onEnterLoopEdit(item.id);
      if (item.type === 'text' && onEnterTextEdit) onEnterTextEdit(item.id);
    },
    [item.type, item.id, onEnterLoopEdit, onEnterTextEdit],
  );

  return (
    <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onDoubleClick={onDoubleClick} style={wrapStyle}>
      <ItemContent item={item} scaleX={scaleX} scaleY={scaleY} resolveAssetUrl={resolveAssetUrl} />
      {selected && !item.locked && (
        <SelectionHandles
          box={item.box}
          editor={editor}
          variant={variant}
          itemId={item.id}
          loopItemId={loopItemId}
          items={items}
          refW={refW}
          refH={refH}
          pointerScaleX={pointerScaleX}
          pointerScaleY={pointerScaleY}
          onGuidesChange={onGuidesChange}
        />
      )}
      {selected && item.locked && <SelectionHandlesStatic />}
      <div className="absolute -top-[3px] -right-[3px] bg-white rounded-full p-[1px] leading-none pointer-events-none">
        <SyncBadge item={item} isParent={isSyncParent} size={10} />
      </div>
    </div>
  );
}
