import { Copy, Trash2, Pin, PinOff, ChevronUp, ChevronDown } from 'lucide-react';
import type { Box, LayoutItem, LayoutVariant } from '@sky-app/slide-shared';
import { addItemCommand, patchItemCommand, removeItemCommand } from '@sky-app/layout-editor-core';
import type { Editor } from '@sky-app/layout-editor-core';
import { cn } from '@sky-app/ui';

const TOOLBAR_HEIGHT = 34;
const TOOLBAR_GAP = 10;

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
  loopItemId?: string;
  originX: number;
  originY: number;
  pointerScaleX: number;
  pointerScaleY: number;
}

export function ItemToolbar({ item, editor, variant, loopItemId, originX, originY, pointerScaleX, pointerScaleY }: ItemToolbarProps) {
  const aabb = computeRotatedAABB(item.box);
  const screenLeft = originX + aabb.minX * pointerScaleX;
  const screenRight = originX + aabb.maxX * pointerScaleX;
  const screenTop = originY + aabb.minY * pointerScaleY;
  const screenBottom = originY + aabb.maxY * pointerScaleY;
  const centerX = (screenLeft + screenRight) / 2;

  const wantedTop = screenTop - TOOLBAR_HEIGHT - TOOLBAR_GAP;
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

  const btnClass = "flex items-center justify-center w6 h-6 border-none bg-transparent text-[#5c5d6e] hover:bg-[#f4f5f9] cursor-pointer rounded-md";

  return (
    <div
      data-testid="item-toolbar"
      className="absolute h-[34px] flex items-center gap-[2px] px-[6px] bg-white border border-[#e6e6ee] rounded-[9px] shadow-[0_6px_20px_-8px_rgba(20,10,50,0.35)] z-[1000] pointer-events-auto -translate-x-1/2"
      style={{
        left: centerX,
        top,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button onClick={handleDuplicate} aria-label="Nhân đôi (thanh công cụ)" title="Nhân đôi" className={btnClass}>
        <Copy size={14} />
      </button>
      <button onClick={handleZUp} aria-label="Lên 1 lớp (thanh công cụ)" title="Lên 1 lớp" className={btnClass}>
        <ChevronUp size={14} />
      </button>
      <button onClick={handleZDown} aria-label="Xuống 1 lớp (thanh công cụ)" title="Xuống 1 lớp" className={btnClass}>
        <ChevronDown size={14} />
      </button>
      <button
        onClick={handleToggleLock}
        aria-label={item.locked ? 'Mở khoá di chuyển (thanh công cụ)' : 'Khoá di chuyển (thanh công cụ)'}
        title={item.locked ? 'Mở khoá di chuyển' : 'Khoá di chuyển'}
        className={cn(btnClass, item.locked && 'text-[#4b57e6]')}
      >
        {item.locked ? <PinOff size={14} /> : <Pin size={14} />}
      </button>
      <button onClick={handleDelete} aria-label="Xoá (thanh công cụ)" title="Xoá" className={cn(btnClass, 'hover:text-red-500')}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}
