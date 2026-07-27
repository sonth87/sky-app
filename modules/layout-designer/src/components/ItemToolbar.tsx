// Toolbar nổi theo item-type — Bước 7 kế hoạch resize/rotate (2026-07-18). KHÁC FloatingToolbar
// (Canvas.tsx, cố định đỉnh canvas — select/hand-tool/undo/redo/zoom): ItemToolbar theo dõi VỊ
// TRÍ item đang chọn, chỉ hiện khi selection.length===1.
//
// QUYẾT ĐỊNH KỸ THUẬT (xem plan): toolbar PHẢI render NGOÀI artEl (Frame) — artEl tự
// transform:scale(totalScale), nếu render bên trong toolbar sẽ bị phóng to/nhỏ theo zoom (không
// mong muốn, toolbar phải giữ kích thước cố định bất kể zoom). Vị trí tính bằng AABB SAU XOAY
// (bounding box bao 4 góc đã xoay của box), KHÔNG theo "phía trên trục cục bộ đã xoay" — quá
// phức tạp, không cần thiết chỉ để đặt 1 toolbar nổi phía trên item.

import { Copy, Trash2, Pin, PinOff, ChevronUp, ChevronDown } from 'lucide-react';
import type { Box, LayoutItem, LayoutVariant } from '@sky-app/slide-shared';
import { addItemCommand, patchItemCommand, removeItemCommand } from '@sky-app/layout-editor-core';
import type { Editor } from '@sky-app/layout-editor-core';

const TOOLBAR_HEIGHT = 34;
const TOOLBAR_GAP = 10;

/** AABB (bounding box axis-aligned) bao trọn 4 góc của box SAU KHI đã xoay quanh tâm — dùng để
 * định vị toolbar phía trên item bất kể item có xoay hay không. Trả toạ độ trong hệ canvas-logic
 * (chưa quy đổi màn hình — caller tự nhân pointerScaleX/Y + originX/Y). */
export function computeRotatedAABB(box: Box): { minX: number; minY: number; maxX: number; maxY: number } {
  const rotation = box.rotation ?? 0;
  if (rotation === 0) {
    return { minX: box.x, minY: box.y, maxX: box.x + box.w, maxY: box.y + box.h };
  }
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x, y: box.y + box.h },
    { x: box.x + box.w, y: box.y + box.h },
  ].map(({ x, y }) => {
    const dx = x - cx;
    const dy = y - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  });
  return {
    minX: Math.min(...corners.map((c) => c.x)),
    minY: Math.min(...corners.map((c) => c.y)),
    maxX: Math.max(...corners.map((c) => c.x)),
    maxY: Math.max(...corners.map((c) => c.y)),
  };
}

let duplicateIdCounter = 0;
function nextDuplicateId(prefix: string): string {
  duplicateIdCounter += 1;
  return `${prefix}_dup_${duplicateIdCounter}`;
}

export interface ItemToolbarProps {
  item: LayoutItem;
  editor: Editor;
  variant: LayoutVariant;
  /** Có giá trị khi item nằm trong itemTemplate của 1 LoopItem (Bước 10 kế hoạch resize/rotate,
   * 2026-07-18 — chế độ sửa mẫu) — truyền xuống mọi command để thao tác đúng ngữ cảnh. */
  loopItemId?: string;
  /** Cùng công thức originX/Y đã dùng cho artEl (Canvas.tsx) — điểm màn hình của canvas-logic-(0,0). */
  originX: number;
  originY: number;
  /** = layoutScaleX/Y × totalScale (giống pointerScaleX/Y truyền cho CanvasItemView) — quy đổi
   * toạ độ canvas-logic → px màn hình thật, ĐÃ tính cả zoom (vì toolbar render NGOÀI artEl, không
   * được artEl's transform:scale() tự lo phần này như item con bên trong). */
  pointerScaleX: number;
  pointerScaleY: number;
}

/** Chỉ hiện khi selection.length===1 (không xử lý multi-select toolbar ở bước này — Canvas.tsx
 * tự kiểm tra điều kiện này trước khi render component). */
export function ItemToolbar({ item, editor, variant, loopItemId, originX, originY, pointerScaleX, pointerScaleY }: ItemToolbarProps) {
  const aabb = computeRotatedAABB(item.box);
  const screenLeft = originX + aabb.minX * pointerScaleX;
  const screenRight = originX + aabb.maxX * pointerScaleX;
  const screenTop = originY + aabb.minY * pointerScaleY;
  const screenBottom = originY + aabb.maxY * pointerScaleY;
  const centerX = (screenLeft + screenRight) / 2;

  const wantedTop = screenTop - TOOLBAR_HEIGHT - TOOLBAR_GAP;
  // Lật xuống dưới item khi không đủ chỗ phía trên (item sát mép trên/ngoài Frame).
  const top = wantedTop < 0 ? screenBottom + TOOLBAR_GAP : wantedTop;

  const dispatch = editor.store.getState().dispatch;

  const handleDuplicate = () => {
    const duplicated: LayoutItem = { ...item, id: nextDuplicateId(item.type), box: { ...item.box, x: item.box.x + 20, y: item.box.y + 20 } };
    dispatch(addItemCommand(variant.aspect.id, duplicated, loopItemId));
  };
  const handleDelete = () => dispatch(removeItemCommand(variant.aspect.id, item.id, loopItemId));
  const handleToggleLock = () => dispatch(patchItemCommand<LayoutItem>(variant.aspect.id, item.id, item, { locked: !item.locked }, loopItemId));
  const handleZUp = () => dispatch(patchItemCommand<LayoutItem>(variant.aspect.id, item.id, item, { box: { ...item.box, z: (item.box.z ?? 0) + 1 } }, loopItemId));
  const handleZDown = () => dispatch(patchItemCommand<LayoutItem>(variant.aspect.id, item.id, item, { box: { ...item.box, z: (item.box.z ?? 0) - 1 } }, loopItemId));

  const btnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    border: 'none',
    background: 'transparent',
    color: '#5c5d6e',
    cursor: 'pointer',
    borderRadius: 6,
  };

  return (
    <div
      data-testid="item-toolbar"
      style={{
        position: 'absolute',
        left: centerX,
        top,
        transform: 'translateX(-50%)',
        height: TOOLBAR_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '0 6px',
        background: '#fff',
        border: '1px solid #e6e6ee',
        borderRadius: 9,
        boxShadow: '0 6px 20px -8px rgba(20,10,50,.35)',
        zIndex: 1000,
        pointerEvents: 'auto',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* aria-label có hậu tố "(thanh công cụ)" — PHÂN BIỆT tường minh với nút cùng hành động ở
         PropertyPanel's PanelHeader (Bước 2), tránh trùng label khi cả 2 CÙNG hiện lúc 1 item
         được chọn (test getByLabelText sẽ báo lỗi "multiple elements found" nếu trùng). */}
      <button onClick={handleDuplicate} aria-label="Nhân đôi (thanh công cụ)" title="Nhân đôi" style={btnStyle}>
        <Copy size={14} />
      </button>
      <button onClick={handleZUp} aria-label="Lên 1 lớp (thanh công cụ)" title="Lên 1 lớp" style={btnStyle}>
        <ChevronUp size={14} />
      </button>
      <button onClick={handleZDown} aria-label="Xuống 1 lớp (thanh công cụ)" title="Xuống 1 lớp" style={btnStyle}>
        <ChevronDown size={14} />
      </button>
      <button
        onClick={handleToggleLock}
        aria-label={item.locked ? 'Mở khoá di chuyển (thanh công cụ)' : 'Khoá di chuyển (thanh công cụ)'}
        title={item.locked ? 'Mở khoá di chuyển' : 'Khoá di chuyển'}
        style={{ ...btnStyle, color: item.locked ? 'var(--accent-color, #4b57e6)' : '#5c5d6e' }}
      >
        {item.locked ? <PinOff size={14} /> : <Pin size={14} />}
      </button>
      <button onClick={handleDelete} aria-label="Xoá (thanh công cụ)" title="Xoá" style={btnStyle}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}
