import { useState } from 'react';
import { Copy, Trash2, Pin, PinOff, ChevronUp, ChevronDown, Eye, EyeOff, Bold, Circle, Square, Triangle, Diamond, Frame, Minus, Edit2, Bookmark, Images } from 'lucide-react';
import type { Box, LayoutItem, LayoutVariant } from '@sky-app/slide-shared';
import { addItemCommand, batchCommand, patchItemCommand, removeItemCommand } from '@sky-app/layout-editor-core';
import type { Editor } from '@sky-app/layout-editor-core';
import { cn, IconToggleButton, ColorfulSwatchButton } from '@sky-app/ui';

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
  pickAndSaveImage?: () => Promise<{ relativePath: string } | null>;
  onEnterLoopEdit?: (id: string) => void;
  onOpenGalleryManager?: (id: string) => void;
  onSaveTemplate?: (items: LayoutItem[]) => void;
}

export function ItemToolbar({ item, editor, variant, loopItemId, originX, originY, pointerScaleX, pointerScaleY, pickAndSaveImage, onEnterLoopEdit, onOpenGalleryManager, onSaveTemplate }: ItemToolbarProps) {
  const [shapeOpen, setShapeOpen] = useState(false);
  const aabb = computeRotatedAABB(item.box);
  const screenLeft = originX + aabb.minX * pointerScaleX;
  const screenRight = originX + aabb.maxX * pointerScaleX;
  const screenTop = originY + aabb.minY * pointerScaleY;
  const screenBottom = originY + aabb.maxY * pointerScaleY;
  const centerX = (screenLeft + screenRight) / 2;

  const wantedTop = screenTop - TOOLBAR_HEIGHT - TOOLBAR_GAP;
  const top = wantedTop < 0 ? screenBottom + TOOLBAR_GAP : wantedTop;

  const state = editor.store.getState();
  const dispatch = state.dispatch;
  const isMultiSelect = item.id === 'multi-select-box';
  const selectedIds = isMultiSelect ? state.selection : [item.id];

  const handleDuplicate = () => {
    if (isMultiSelect) return; // Duplicate không support multi-select
    const duplicated: LayoutItem = { ...item, id: nextDuplicateId(item.type), box: { ...item.box, x: item.box.x + 20, y: item.box.y + 20 } };
    dispatch(addItemCommand(variant.aspect.id, duplicated, loopItemId));
  };

  const handleDelete = () => {
    if (isMultiSelect) {
      const commands = selectedIds.map((id) => removeItemCommand(variant.aspect.id, id, loopItemId));
      dispatch(commands.length === 1 ? commands[0]! : batchCommand(commands));
    } else {
      dispatch(removeItemCommand(variant.aspect.id, item.id, loopItemId));
    }
  };

  const handleToggleLock = () => {
    if (isMultiSelect) {
      // Toàn bộ selected items lock/unlock cùng lúc (check nếu tất cả locked hay không)
      const allLocked = selectedIds.every((id) => {
        const itm = variant.items.find((i) => i.id === id);
        return itm?.locked === true;
      });
      const commands = selectedIds.map((id) => {
        const itm = variant.items.find((i) => i.id === id);
        return patchItemCommand<LayoutItem>(variant.aspect.id, id, itm ?? item, { locked: !allLocked }, loopItemId);
      });
      dispatch(commands.length === 1 ? commands[0]! : batchCommand(commands));
    } else {
      dispatch(patchItemCommand<LayoutItem>(variant.aspect.id, item.id, item, { locked: !item.locked }, loopItemId));
    }
  };

  const handleToggleHidden = () => {
    if (isMultiSelect) {
      const allHidden = selectedIds.every((id) => {
        const itm = variant.items.find((i) => i.id === id);
        return itm?.hidden === true;
      });
      const commands = selectedIds.map((id) => {
        const itm = variant.items.find((i) => i.id === id);
        return patchItemCommand<LayoutItem>(variant.aspect.id, id, itm ?? item, { hidden: !allHidden }, loopItemId);
      });
      dispatch(commands.length === 1 ? commands[0]! : batchCommand(commands));
    } else {
      dispatch(patchItemCommand<LayoutItem>(variant.aspect.id, item.id, item, { hidden: !item.hidden }, loopItemId));
    }
  };

  const handleZUp = () => {
    if (isMultiSelect) {
      const commands = selectedIds.map((id) => {
        const itm = variant.items.find((i) => i.id === id);
        if (!itm) return null;
        return patchItemCommand<LayoutItem>(variant.aspect.id, id, itm, { box: { ...itm.box, z: (itm.box.z ?? 0) + 1 } }, loopItemId);
      }).filter((c): c is any => c !== null);
      if (commands.length > 0) dispatch(commands.length === 1 ? commands[0]! : batchCommand(commands));
    } else {
      dispatch(patchItemCommand<LayoutItem>(variant.aspect.id, item.id, item, { box: { ...item.box, z: (item.box.z ?? 0) + 1 } }, loopItemId));
    }
  };

  const handleZDown = () => {
    if (isMultiSelect) {
      const commands = selectedIds.map((id) => {
        const itm = variant.items.find((i) => i.id === id);
        if (!itm) return null;
        return patchItemCommand<LayoutItem>(variant.aspect.id, id, itm, { box: { ...itm.box, z: (itm.box.z ?? 0) - 1 } }, loopItemId);
      }).filter((c): c is any => c !== null);
      if (commands.length > 0) dispatch(commands.length === 1 ? commands[0]! : batchCommand(commands));
    } else {
      dispatch(patchItemCommand<LayoutItem>(variant.aspect.id, item.id, item, { box: { ...item.box, z: (item.box.z ?? 0) - 1 } }, loopItemId));
    }
  };

  const btnClass = "flex items-center justify-center w6 h-6 border-none bg-transparent text-[#5c5d6e] hover:bg-[#f4f5f9] cursor-pointer rounded-md";

  const handleSaveTemplate = () => {
    if (!onSaveTemplate || !isMultiSelect) return;
    // Get selected items and compute bounding box
    const selectedItems = selectedIds.map((id) => variant.items.find((i) => i.id === id)).filter((i): i is LayoutItem => i !== undefined);
    if (selectedItems.length === 0) return;

    // Compute bounding box
    let minX = Infinity, minY = Infinity;
    selectedItems.forEach((itm) => {
      minX = Math.min(minX, itm.box.x ?? 0);
      minY = Math.min(minY, itm.box.y ?? 0);
    });

    // Deep clone and adjust coordinates relative to bounding box top-left
    const templateItems = selectedItems.map((itm) => ({
      ...itm,
      id: itm.id, // Keep original IDs temporarily (will be replaced on spawn)
      box: { ...itm.box, x: (itm.box.x ?? 0) - minX, y: (itm.box.y ?? 0) - minY },
      // Strip sync fields
      syncKey: undefined,
      syncRef: undefined,
      syncOverrides: undefined,
    })) as LayoutItem[];

    onSaveTemplate(templateItems);
  };

  const renderExtraButtons = () => {
    if (isMultiSelect) return null;

    if (item.type === 'text') {
      const boldActive = (item.fontWeight ?? 400) >= 700;
      return (
        <IconToggleButton
          icon={Bold}
          title="Đậm"
          active={boldActive}
          onClick={() => dispatch(patchItemCommand<LayoutItem>(variant.aspect.id, item.id, item, { fontWeight: boldActive ? 400 : 700 }, loopItemId))}
        />
      );
    }

    if (item.type === 'image' && pickAndSaveImage) {
      return (
        <button onClick={pickAndSaveImage} title="Đổi ảnh" className={btnClass}>
          <Edit2 size={14} />
        </button>
      );
    }

    if (item.type === 'shape') {
      const getShapeIcon = (shape: Extract<LayoutItem, { type: 'shape' }>['shape']) => {
        switch (shape) {
          case 'rect': return Square;
          case 'circle': return Circle;
          case 'triangle': return Triangle;
          case 'diamond': return Diamond;
          case 'frame': return Frame;
          case 'line': return Minus;
        }
      };
      const ShapeIcon = getShapeIcon(item.shape);
      return (
        <div className="relative">
          <button title="Đổi hình dạng" onClick={() => setShapeOpen(!shapeOpen)} className={btnClass}>
            <ShapeIcon size={14} />
          </button>
          {shapeOpen && (
            <>
              <div className="fixed inset-0 z-[999]" onClick={() => setShapeOpen(false)} />
              <div className="absolute top-full mt-1 left-0 z-[1001] rounded-[11px] bg-white p-[10px] shadow-[0_14px_34px_rgba(20,20,40,0.18)] flex gap-[7px]">
                {(['rect', 'circle', 'triangle', 'diamond', 'frame', 'line'] as const).map((shape) => {
                  const Icon = getShapeIcon(shape);
                  return (
                    <button
                      key={shape}
                      onClick={() => {
                        if (shape === 'frame' && !(item.strokeW ?? 0)) {
                          dispatch(patchItemCommand<LayoutItem>(variant.aspect.id, item.id, item, { shape, strokeW: 2, stroke: item.stroke ?? '#000000' }, loopItemId));
                        } else {
                          dispatch(patchItemCommand<LayoutItem>(variant.aspect.id, item.id, item, { shape }, loopItemId));
                        }
                        setShapeOpen(false);
                      }}
                      className={cn(btnClass, item.shape === shape && 'border-[#4b57e6] bg-[#4b57e6]/10 text-[#4b57e6]', 'border')}
                    >
                      <Icon size={14} />
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      );
    }

    if (item.type === 'ribbon') {
      return (
        <ColorfulSwatchButton
          color={typeof item.bg === 'string' ? item.bg : '#b9902f'}
          onChange={(bg) => dispatch(patchItemCommand<LayoutItem>(variant.aspect.id, item.id, item, { bg }, loopItemId))}
          title="Đổi màu nền"
        />
      );
    }

    if (item.type === 'loop' && onEnterLoopEdit) {
      return (
        <button onClick={() => onEnterLoopEdit(item.id)} title="Sửa mẫu" className={btnClass}>
          <Edit2 size={14} />
        </button>
      );
    }

    if (item.type === 'gallery' && onOpenGalleryManager) {
      return (
        <button onClick={() => onOpenGalleryManager(item.id)} title="Quản lý bộ ảnh" className={btnClass}>
          <Images size={14} />
        </button>
      );
    }

    return null;
  };

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
      {!isMultiSelect && (
        <button onClick={handleDuplicate} aria-label="Nhân đôi (thanh công cụ)" title="Nhân đôi" className={btnClass}>
          <Copy size={14} />
        </button>
      )}
      {isMultiSelect && onSaveTemplate && (
        <button onClick={handleSaveTemplate} aria-label="Lưu thành mẫu (thanh công cụ)" title="Lưu thành mẫu" className={btnClass}>
          <Bookmark size={14} />
        </button>
      )}
      {renderExtraButtons()}
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
      <button
        onClick={handleToggleHidden}
        aria-label={item.hidden ? 'Hiển thị (thanh công cụ)' : 'Ẩn (thanh công cụ)'}
        title={item.hidden ? 'Hiển thị' : 'Ẩn'}
        className={cn(btnClass, item.hidden && 'text-[#999]')}
      >
        {item.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
      <button onClick={handleDelete} aria-label="Xoá (thanh công cụ)" title="Xoá" className={cn(btnClass, 'hover:text-red-500')}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}
