import { useMemo, useState } from 'react';
import { Copy, Trash2, Pin, PinOff, ChevronUp, ChevronDown, Eye, EyeOff, Bold, Circle, Square, Triangle, Diamond, Frame, Minus, Edit2, Bookmark, Images, ImageIcon, Paintbrush, Link2 } from 'lucide-react';
import type { Box, LayoutItem, LayoutVariant } from '@sky-app/slide-shared';
import { collectUsedAssetPaths } from '@sky-app/slide-shared';
import { addItemCommand, batchCommand, patchItemCommand, removeItemCommand } from '@sky-app/layout-editor-core';
import type { Editor } from '@sky-app/layout-editor-core';
import { cn, IconToggleButton, ColorfulSwatchButton } from '@sky-app/ui';
import { MediaLibraryModal } from './MediaLibraryModal.js';
import { ImageFilterPicker } from './ImageFilterPicker.js';
import { ImageFramePanel } from './ImageFramePanel.js';
import { useResolvedAssetUrl } from '../hooks/useResolvedAssetUrl.js';

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
  assetPort?: any; // AssetPort — full asset port cho MediaLibraryModal
  /** Resolve LayoutItem.src → URL hiển thị được, dùng cho preview live trong ImageFilterPicker. */
  resolveAssetUrl?: (path: string) => Promise<string>;
  onEnterLoopEdit?: (id: string) => void;
  onOpenGalleryManager?: (id: string) => void;
  onSaveTemplate?: (items: LayoutItem[]) => void;
}

export function ItemToolbar({ item, editor, variant, loopItemId, originX, originY, pointerScaleX, pointerScaleY, pickAndSaveImage, assetPort, resolveAssetUrl, onEnterLoopEdit, onOpenGalleryManager, onSaveTemplate }: ItemToolbarProps) {
  const [shapeOpen, setShapeOpen] = useState(false);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [frameOpen, setFrameOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const resolvedImageUrl = useResolvedAssetUrl(item.type === 'image' ? item.src : undefined, resolveAssetUrl);
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
  const usedAssetPaths = useMemo(() => collectUsedAssetPaths(state.doc), [state.doc]);

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

  const btnClass = "flex items-center justify-center w-7 h-7 border-none bg-transparent text-[#5c5d6e] hover:bg-[#f4f5f9] active:bg-[#eceefa] cursor-pointer rounded-[8px] transition-colors duration-100";
  const dividerClass = "w-px h-5 bg-[#e6e6ee] mx-[2px] shrink-0";

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

    if (item.type === 'image') {
      return (
        <>
          <div className="flex items-center gap-[3px]">
            {/* Change Image from Library */}
            {assetPort && (
              <button onClick={() => {
                setFilterOpen(false);
                setFrameOpen(false);
                setLinkOpen(false);
                setMediaLibraryOpen(true);
              }} title="Thư viện" className={cn(btnClass, 'hover:bg-blue-50 hover:text-blue-600')}>
                <ImageIcon size={14} />
              </button>
            )}

            {/* Filter — 39+ preset đầy đủ, port từ my-builder (ImageFilterPicker.tsx) */}
            <div className="relative">
              <button onClick={() => {
                setMediaLibraryOpen(false);
                setFrameOpen(false);
                setLinkOpen(false);
                setFilterOpen(!filterOpen);
              }} title="Bộ lọc" className={cn(btnClass, filterOpen && 'bg-[#4b57e6]/10 text-[#4b57e6]')}>
                <Paintbrush size={14} />
              </button>
              {filterOpen && (
                <>
                  <div className="fixed inset-0 z-[999]" onClick={() => setFilterOpen(false)} />
                  <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 z-[1001] rounded-[11px] bg-white p-[10px] shadow-[0_14px_34px_rgba(20,20,40,0.18)] w-[220px]">
                    <ImageFilterPicker
                      previewSrc={resolvedImageUrl}
                      value={item.filter}
                      onChange={(filter) => dispatch(patchItemCommand<LayoutItem>(variant.aspect.id, item.id, item, { filter }, loopItemId))}
                      columns={4}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Frame Design — 5 tab đầy đủ (Khung/Bóng/Dạng/Viền/Đặc biệt), port từ my-builder
                (ImageFramePanel.tsx) */}
            <div className="relative">
              <button onClick={() => {
                setMediaLibraryOpen(false);
                setFilterOpen(false);
                setLinkOpen(false);
                setFrameOpen(!frameOpen);
              }} title="Khung" className={cn(btnClass, frameOpen && 'bg-[#4b57e6]/10 text-[#4b57e6]')}>
                <Frame size={14} />
              </button>
              {frameOpen && (
                <>
                  <div className="fixed inset-0 z-[999]" onClick={() => setFrameOpen(false)} />
                  <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 z-[1001] rounded-[11px] bg-white p-[10px] shadow-[0_14px_34px_rgba(20,20,40,0.18)]">
                    <ImageFramePanel
                      item={item}
                      patch={(p) => dispatch(patchItemCommand<LayoutItem>(variant.aspect.id, item.id, item, p, loopItemId))}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Set Link */}
            <div className="relative">
              <button onClick={() => {
                setMediaLibraryOpen(false);
                setFilterOpen(false);
                setFrameOpen(false);
                setLinkOpen(!linkOpen);
              }} title="Liên kết" className={cn(btnClass, linkOpen && 'bg-[#4b57e6]/10 text-[#4b57e6]', item.linkUrl && 'text-blue-600')}>
                <Link2 size={14} />
              </button>
              {linkOpen && (
                <>
                  <div className="fixed inset-0 z-[999]" onClick={() => setLinkOpen(false)} />
                  <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 z-[1001] rounded-[11px] bg-white p-[12px] shadow-[0_14px_34px_rgba(20,20,40,0.18)] flex flex-col gap-[10px] w-[260px]">
                    <div className="text-[10px] font-bold text-[#9a9bab] uppercase">Liên kết</div>
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] font-semibold text-[#5c5d6e] block mb-2">URL</label>
                        <input type="url" placeholder="https://example.com" value={item.linkUrl ?? ''} onChange={(e) => dispatch(patchItemCommand<LayoutItem>(variant.aspect.id, item.id, item, { linkUrl: e.target.value }, loopItemId))} className="w-full px-2 py-2 border border-[#e6e6ee] rounded-[6px] text-[11px] focus:border-[#4b57e6] focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-[#5c5d6e] block mb-2">Mở trong</label>
                        <select value={item.linkTarget ?? '_blank'} onChange={(e) => dispatch(patchItemCommand<LayoutItem>(variant.aspect.id, item.id, item, { linkTarget: e.target.value as '_blank' | '_self' }, loopItemId))} className="w-full px-2 py-2 border border-[#e6e6ee] rounded-[6px] text-[11px] focus:border-[#4b57e6] focus:outline-none">
                          <option value="_blank">Tab mới</option>
                          <option value="_self">Tab hiện tại</option>
                        </select>
                      </div>
                      {item.linkUrl && (
                        <button onClick={() => dispatch(patchItemCommand<LayoutItem>(variant.aspect.id, item.id, item, { linkUrl: undefined, linkTarget: undefined }, loopItemId))} className="w-full px-3 py-2 text-[11px] font-medium rounded-[6px] bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                          Xoá liên kết
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
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

  const extraButtons = renderExtraButtons();

  return (
    <>
      {/* onPointerDown stopPropagation ở ĐÂY (không chỉ ở div toolbar bên dưới) — MediaLibraryModal
          portal nội dung ra document.body (DOM-wise NẰM NGOÀI div toolbar), nhưng React bubble sự
          kiện SYNTHETIC theo CÂY REACT (ItemToolbar → Canvas), KHÔNG theo cây DOM (xem React docs
          về createPortal's event bubbling). Thiếu bọc này, click bất kỳ đâu trong modal (dù đã
          portal ra ngoài) vẫn bubble lên tới Canvas's handleMarqueePointerDown → setSelection([])
          → ItemToolbar (+modal bên trong) unmount ngay lập tức — TRÔNG GIỐNG HỆT "modal tự đóng
          khi click vào bất cứ đâu" (bug thật 2026-08-07, module TRƯỚC ĐÓ không có do
          MediaLibraryModal chỉ tồn tại ở ImageControls/PropertyPanel — KHÔNG nằm trong cây React
          của Canvas nên không bị ảnh hưởng). */}
      <div onPointerDown={(e) => e.stopPropagation()}>
        <MediaLibraryModal
          open={mediaLibraryOpen && item.type === 'image'}
          onOpenChange={setMediaLibraryOpen}
          assetPort={assetPort}
          resolveAssetUrl={resolveAssetUrl}
          usedAssetPaths={usedAssetPaths}
          onSelect={(relativePath) => {
            if (item.type === 'image') {
              dispatch(patchItemCommand<LayoutItem>(variant.aspect.id, item.id, item, { src: relativePath }, loopItemId));
            }
            setMediaLibraryOpen(false);
          }}
          initialTab="library"
        />
      </div>
      <div
        data-testid="item-toolbar"
        className="absolute h-[38px] flex items-center gap-[3px] px-[7px] bg-white border border-[#e6e6ee] rounded-[10px] shadow-[0_10px_28px_-8px_rgba(20,10,50,0.30),0_2px_6px_rgba(20,10,50,0.06)] z-[1000] pointer-events-auto -translate-x-1/2"
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
        {extraButtons && (
          <>
            <div className={dividerClass} />
            {extraButtons}
          </>
        )}
        <div className={dividerClass} />
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
          className={cn(btnClass, item.locked && 'bg-[#4b57e6]/10 text-[#4b57e6]')}
        >
          {item.locked ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
        <button
          onClick={handleToggleHidden}
          aria-label={item.hidden ? 'Hiển thị (thanh công cụ)' : 'Ẩn (thanh công cụ)'}
          title={item.hidden ? 'Hiển thị' : 'Ẩn'}
          className={cn(btnClass, item.hidden && 'bg-[#f4f5f9] text-[#9a9bab]')}
        >
          {item.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <div className={dividerClass} />
        <button onClick={handleDelete} aria-label="Xoá (thanh công cụ)" title="Xoá" className={cn(btnClass, 'hover:bg-red-50 hover:text-red-600')}>
          <Trash2 size={14} />
        </button>
      </div>
    </>
  );
}
