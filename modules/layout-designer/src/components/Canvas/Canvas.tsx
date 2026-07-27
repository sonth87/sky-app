import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import type { LayoutItem, LayoutVariant } from '@sky-app/slide-shared';
import { zoomAt, resolveEditingItems, patchItemCommand } from '@sky-app/layout-editor-core';
import type { Editor, Guide } from '@sky-app/layout-editor-core';
import { useEditorState } from '../../hooks/useEditor.js';
import { useResolvedAssetUrl } from '../../hooks/useResolvedAssetUrl.js';
import { useCanvasKeyboardShortcuts } from '../../hooks/useCanvasKeyboardShortcuts.js';
import { ItemToolbar } from '../ItemToolbar.js';
import { Minimap, shouldShowMinimap } from '../Minimap.js';
import { TiptapTextEditor } from '../TiptapTextEditor.js';
import { collectUsedTokenKeys } from '../Flyout/helpers.js';
import { designSize } from './helpers.js';
import { FrameSurface, LoopEditFrameSurface } from './FrameSurface.js';
import { LoopEditBreadcrumb } from './LoopEditBreadcrumb.js';
import { FloatingToolbar, ZOOM_STEP_FACTOR } from './FloatingToolbar.js';
import { GuideLine } from './GuideLine.js';
import { CanvasItemView } from './CanvasItemView.js';
import { cn } from '../../lib/cn.js';

export interface CanvasProps {
  editor: Editor;
  variant: LayoutVariant;
  /** Callback ref tới phần tử DOM khung nghệ thuật (kích thước theo designSize(variant.aspect),
   * chứa items) — dùng bởi screenPointToCanvas() lúc thả item mới từ palette (xem LayoutDesignerApp). */
  artRef?: (el: HTMLDivElement | null) => void;
  /** Resolve LayoutItem.src (relativePath, có thể là "key blob" WASM) → URL hiển thị được. */
  resolveAssetUrl?: (path: string) => Promise<string>;
  /** Ctrl/Cmd+\ — ẩn/hiện panel trái+phải (xử lý ở LayoutDesignerApp vì ngoài phạm vi Canvas). */
  onTogglePanels?: () => void;
  /** Undo/redo hiện ở CẢ toolbar trên cùng LẪN toolbar nổi đáy canvas (ảnh mẫu 2026-07-17) —
   * dùng chung 1 nguồn history từ LayoutDesignerApp, tránh 2 nơi tự tính historySnapshot(). */
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Overlay nổi góc trên-trái container (VD VariantTabs — thanh tab tỷ lệ, xem 12-thu-vien-
   * layout.md) — đặt trong Canvas thay vì LayoutDesignerApp vì cần cùng containing block
   * (position:relative) với FloatingToolbar, tránh lệch vị trí. */
  topLeftOverlay?: React.ReactNode;
  /** Gọi khi user CHỌN 1 token từ dropdown mention-suggestion trong TiptapTextEditor (Bước 12) —
   * chuyển tiếp lên LayoutDesignerAppModule để ghi nhận variable_registry, giống PropertyPanel. */
  onTokenInserted?: (key: string) => void;
}

export function Canvas({
  editor,
  variant,
  artRef,
  resolveAssetUrl,
  onTogglePanels,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  topLeftOverlay,
  onTokenInserted,
}: CanvasProps) {
  const selection = useEditorState(editor, (s) => s.selection);
  const viewport = useEditorState(editor, (s) => s.viewport);
  const doc = useEditorState(editor, (s) => s.doc);
  // Bước 10 kế hoạch resize/rotate (2026-07-18) — chế độ "sửa mẫu" LoopItem, vào qua double-click.
  // CHỈ 1 CẤP (chặn tường minh double-click vào LoopItem lồng trong LoopItem khác khi đang edit).
  const editingLoopId = useEditorState(editor, (s) => s.editingLoopId);
  const editingLoopItem = editingLoopId ? variant.items.find((i) => i.id === editingLoopId) : undefined;
  const isEditingLoop = Boolean(editingLoopItem && editingLoopItem.type === 'loop');
  const effectiveItems = resolveEditingItems(variant, isEditingLoop ? editingLoopId : undefined);
  // Ảnh nền Frame (nếu background.kind === 'image') — resolve qua AssetPort giống ảnh của item,
  // xem PropertyPanel.tsx's FrameBackgroundControls (review 2026-07-18, thêm thuộc tính Frame).
  const backgroundImageSrc = variant.background?.kind === 'image' ? variant.background.src : undefined;
  const resolvedBackgroundUrl = useResolvedAssetUrl(backgroundImageSrc, resolveAssetUrl);
  // Tập syncKey nào ĐANG LÀ CHA của ít nhất 1 item khác (xuyên MỌI variant, vì copy có thể copy
  // sang variant khác) — tính 1 LẦN cho cả canvas thay vì lặp lại per-item, dùng cho SyncBadge
  // (12-thu-vien-layout.md mở rộng — hiện icon "linked" ngay cả ở item GỐC, không chỉ item copy).
  const parentSyncKeys = new Set<string>();
  for (const v of doc.variants) {
    for (const it of v.items) {
      if (it.syncRef) parentSyncKeys.add(it.syncRef);
    }
  }
  // Khung hiển thị "logic" đúng tỷ lệ variant.aspect (KHÔNG còn cố định 760×428 — xem
  // designSize()) — đổi theo variant.aspect.w/h mỗi khi chuyển tab sang variant tỷ lệ khác.
  // Khi đang edit-mode (Bước 10): đổi sang tỷ lệ itemBox (kích thước 1 "ô" của LoopItem) — item
  // trong itemTemplate có toạ độ TƯƠNG ĐỐI trong itemBox, không phải refW/refH của variant.
  const effectiveItemBox = isEditingLoop && editingLoopItem?.type === 'loop' ? editingLoopItem.itemBox : undefined;
  const { w: designW, h: designH } = designSize(effectiveItemBox ?? variant.aspect);
  const effectiveRefW = effectiveItemBox?.w ?? variant.refW;
  const effectiveRefH = effectiveItemBox?.h ?? variant.refH;
  const containerRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  const [guides, setGuides] = useState<Guide[]>([]);
  // editingTextItemId (Bước 12 kế hoạch resize/rotate, 2026-07-18) — id TextItem đang mở
  // TiptapTextEditor overlay qua double-click. State CỤC BỘ (KHÔNG đưa vào editor store như
  // editingLoopId) — đây là UI overlay tạm thời, undo/redo chỉ áp dụng cho patch THẬT lúc gõ
  // (patchItemCommand mỗi lần onUpdate), không cần track "đang mở editor" qua history.
  const [editingTextItemId, setEditingTextItemId] = useState<string | undefined>(undefined);
  // Giữ Space (kiểu Figma) → hand-tool TẠM THỜI, con trỏ đổi thành "grab" báo hiệu có thể kéo để
  // pan bằng chuột trái. Chỉ active khi canvas có focus (đồng nhất scope với các shortcut khác).
  const [spaceHeld, setSpaceHeld] = useState(false);
  // toolMode = nút hand-tool CỐ ĐỊNH trên toolbar nổi (khác spaceHeld, vốn chỉ tạm thời) — chọn
  // 'hand' thì chuột trái LUÔN pan cho tới khi bấm lại 'select', không cần giữ Space liên tục.
  const [toolMode, setToolMode] = useState<'select' | 'hand'>('select');
  const isHandActive = toolMode === 'hand' || spaceHeld;
  // Đang kéo để pan (giữ Space+chuột trái HOẶC chuột giữa, không phân biệt) — lưu điểm bắt đầu
  // (client) + viewport lúc bắt đầu để tính panX/panY mới theo delta, không cộng dồn per-event.
  const panDragRef = useRef<{ startX: number; startY: number; fromPanX: number; fromPanY: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  // Shortcut CHỈ active khi canvas (hoặc con của nó) có focus (tabIndex+onKeyDown trực tiếp,
  // KHÔNG window listener toàn cục) — để không xung đột với input/textarea trong property panel
  // hay modal tương lai đang gõ dở (VD Backspace trong textarea không bị hiểu nhầm "xoá item").
  const handleKeyDown = useCanvasKeyboardShortcuts(editor, variant, onTogglePanels);

  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const fit = () => {
      const availW = el.clientWidth - 48;
      const availH = el.clientHeight - 48;
      const sc = Math.max(0.1, Math.min(1, availW / designW, availH / designH));
      setFitScale(sc);
      setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
    // designW/designH đổi khi chuyển tab sang variant tỷ lệ khác — PHẢI tính lại fitScale ngay,
    // không đợi resize container (nếu không canvas sẽ giữ fitScale CŨ tính theo tỷ lệ variant
    // TRƯỚC đó, sai kích thước hiển thị cho tới khi user tự resize cửa sổ).
  }, [designW, designH]);

  // Scale hiển thị THẬT = fitScale (tự động vừa khung) × viewport.zoom (điều chỉnh thủ công của
  // user, mặc định 1 — xem viewport.ts). totalScale áp dụng qua CSS transform:scale() TRÊN
  // CHÍNH artEl (xem JSX bên dưới) — nên KHÔNG được nhân thêm totalScale vào vị trí/kích thước
  // CSS của item con nữa, nếu không item bị "phóng to 2 lần chồng nhau" (bug ảnh chụp 2026-07-17
  // lần 3: zoom canvas lên thì item to lên NHANH HƠN canvas rất nhiều — vì trước đây layoutScale
  // từng nhân cả totalScale trong khi artEl cha đã tự scale() rồi). layoutScaleX/Y CHỈ quy đổi
  // đơn vị refW×refH thật của variant → khung 760×428 hiển thị "logic" (trước khi artEl tự scale
  // toàn bộ nội dung con của nó), dùng cho MỌI style CSS (left/top/width/height/fontSize/guide).
  const totalScale = fitScale * viewport.zoom;
  const layoutScaleX = designW / effectiveRefW;
  const layoutScaleY = designH / effectiveRefH;

  // QUAN TRỌNG — mô hình toạ độ PHẢI khớp chính xác công thức zoomAt()/canvasToScreen()
  // (packages/layout-editor-core/viewport.ts) giả định: screenPoint = u*viewport.zoom +
  // viewport.panX/Y, với u = canvasPoint*fitScale (đơn vị "canvas đã fit", KHÔNG đổi khi zoom —
  // fitScale chỉ đổi lúc resize container). baseOffset (điểm màn hình của canvas-logic-(0,0) lúc
  // zoom=1,pan=0, tức đúng giữa container) là HẰNG SỐ cộng thêm NGOÀI công thức zoomAt — trước
  // đây dùng "left:50%+translate(-50%)" để căn giữa TÁCH RỜI khỏi pan, khiến hằng số này lẫn vào
  // phần lẽ ra phải scale theo zoom → artEl bị neo sai, "phồng" lệch dần khi zoom (bug ảnh chụp
  // 2026-07-17: canvas+item trôi khỏi vị trí đúng ở zoom 133%). Fix: cộng baseOffset SAU khi đã
  // tính đúng theo viewport, và mọi anchor truyền vào zoomAt() phải trừ baseOffset trước (xem
  // handleWheel) để về đúng hệ toạ độ nội bộ mà zoomAt/canvasToScreen thao tác.
  const baseOffsetX = containerSize.w / 2 - (designW * fitScale) / 2;
  const baseOffsetY = containerSize.h / 2 - (designH * fitScale) / 2;
  const originX = baseOffsetX + viewport.panX;
  const originY = baseOffsetY + viewport.panY;

  const handleDeselect = useCallback(() => {
    editor.store.getState().setSelection([]);
  }, [editor]);

  // Pan bằng chuột giữa (mọi lúc) HOẶC chuột trái khi đang ở hand-tool (bấm nút cố định trên
  // toolbar HOẶC giữ Space tạm thời — kiểu Figma). Middle-click luôn preventDefault để tránh
  // trình duyệt tự động cuộn (auto-scroll icon).
  const handlePanPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const isMiddleClick = e.button === 1;
      const isHandLeftClick = e.button === 0 && isHandActive;
      if (!isMiddleClick && !isHandLeftClick) return;
      e.preventDefault();
      panDragRef.current = { startX: e.clientX, startY: e.clientY, fromPanX: viewport.panX, fromPanY: viewport.panY };
      setIsPanning(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [viewport.panX, viewport.panY, isHandActive],
  );

  const handlePanPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = panDragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      editor.store.getState().setViewport({ ...viewport, panX: drag.fromPanX + dx, panY: drag.fromPanY + dy });
    },
    [editor, viewport],
  );

  const handlePanPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!panDragRef.current) return;
    panDragRef.current = null;
    setIsPanning(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  // Space bật/tắt hand-tool tạm thời — chỉ khi canvas (hoặc con của nó) có focus (tabIndex+onKeyDown trực tiếp,
  // KHÔNG window listener toàn cục) — để không xung đột với input/textarea trong property panel
  // hay modal tương lai đang gõ dở.
  const handleSpaceKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === ' ' && !e.repeat) {
      e.preventDefault();
      setSpaceHeld(true);
    }
  }, []);
  const handleSpaceKeyUp = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === ' ') setSpaceHeld(false);
  }, []);

  // Ctrl/Cmd + scroll → zoom quanh vị trí con trỏ (không phải tâm canvas) — hành vi chuẩn của
  // các công cụ thiết kế (Figma/Photoshop). Scroll THƯỜNG (không giữ Ctrl/Cmd) vẫn cuộn trang
  // bình thường (không preventDefault), tránh mất khả năng cuộn khi canvas tràn khung.
  const handleWheel = useCallback(
    (e: ReactWheelEvent<HTMLDivElement>) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const anchor = { x: e.clientX - rect.left - baseOffsetX, y: e.clientY - rect.top - baseOffsetY };
      const factor = e.deltaY < 0 ? ZOOM_STEP_FACTOR : 1 / ZOOM_STEP_FACTOR;
      const next = zoomAt(viewport, anchor, factor);
      editor.store.getState().setViewport(next);
    },
    [editor, viewport, baseOffsetX, baseOffsetY],
  );

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onPointerDown={(e) => {
        containerRef.current?.focus();
        if (e.button === 1 || (e.button === 0 && isHandActive)) {
          handlePanPointerDown(e);
        } else {
          handleDeselect();
        }
      }}
      onPointerMove={handlePanPointerMove}
      onPointerUp={handlePanPointerUp}
      onWheel={handleWheel}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && isEditingLoop) {
          e.preventDefault();
          editor.store.getState().setEditingLoop(undefined);
          return;
        }
        handleSpaceKeyDown(e);
        handleKeyDown(e);
      }}
      onKeyUp={handleSpaceKeyUp}
      className={cn(
        'flex-1 bg-[#eceef3] bg-[radial-gradient(circle,#00000014_1px,transparent_1px)] bg-[length:16px_16px] relative min-w-0 overflow-hidden outline-none',
        isPanning ? 'cursor-grabbing' : isHandActive ? 'cursor-grab' : 'cursor-default'
      )}
      style={{ background: '#eceef3' }}
    >
      <div
        ref={artRef}
        data-testid="canvas-frame"
        className="absolute origin-top-left"
        style={{
          left: originX,
          top: originY,
          width: designW,
          height: designH,
          transform: `scale(${totalScale})`,
        }}
      >
        {isEditingLoop ? <LoopEditFrameSurface /> : <FrameSurface variant={variant} resolvedBackgroundUrl={resolvedBackgroundUrl} />}
        {effectiveItems.map((item) => (
          <CanvasItemView
            key={item.id}
            item={item}
            editor={editor}
            variant={variant}
            items={effectiveItems}
            refW={effectiveRefW}
            refH={effectiveRefH}
            loopItemId={isEditingLoop ? editingLoopId : undefined}
            selected={selection.includes(item.id)}
            isSyncParent={!isEditingLoop && Boolean(item.syncKey && parentSyncKeys.has(item.syncKey))}
            scaleX={layoutScaleX}
            scaleY={layoutScaleY}
            pointerScaleX={layoutScaleX * totalScale}
            pointerScaleY={layoutScaleY * totalScale}
            onGuidesChange={setGuides}
            resolveAssetUrl={resolveAssetUrl}
            onEnterLoopEdit={isEditingLoop ? undefined : (loopId) => editor.store.getState().setEditingLoop(loopId)}
            onEnterTextEdit={(textItemId) => setEditingTextItemId(textItemId)}
            hiddenWhileEditing={item.id === editingTextItemId}
          />
        ))}
        {guides.map((g, i) => (
          <GuideLine key={i} guide={g} scaleX={layoutScaleX} scaleY={layoutScaleY} />
        ))}
      </div>
      {topLeftOverlay}
      {isEditingLoop && editingLoopItem && (
        <LoopEditBreadcrumb label={editingLoopItem.name ?? 'Khung lặp'} onDone={() => editor.store.getState().setEditingLoop(undefined)} />
      )}
      {editingTextItemId &&
        (() => {
          const textItem = effectiveItems.find((i) => i.id === editingTextItemId);
          if (!textItem || textItem.type !== 'text') return null;
          const screenBox = {
            left: originX + textItem.box.x * layoutScaleX * totalScale,
            top: originY + textItem.box.y * layoutScaleY * totalScale,
            width: textItem.box.w * layoutScaleX,
            height: textItem.box.h * layoutScaleY,
          };
          const targetLoopItemId = isEditingLoop ? editingLoopId : undefined;
          return (
            <TiptapTextEditor
              item={textItem}
              screenBox={screenBox}
              fScale={Math.min(layoutScaleX, layoutScaleY)}
              zoomScale={totalScale}
              tokenSuggestions={[...collectUsedTokenKeys(variant)]}
              onTokenInserted={onTokenInserted}
              onSave={(content) =>
                editor.store.getState().dispatch(patchItemCommand<typeof textItem>(variant.aspect.id, textItem.id, textItem, { content }, targetLoopItemId))
              }
              onClose={() => setEditingTextItemId(undefined)}
            />
          );
        })()}
      {selection.length === 1 &&
        (() => {
          const selectedItem = effectiveItems.find((i) => i.id === selection[0]);
          if (!selectedItem) return null;
          return (
            <ItemToolbar
              item={selectedItem}
              editor={editor}
              variant={variant}
              loopItemId={isEditingLoop ? editingLoopId : undefined}
              originX={originX}
              originY={originY}
              pointerScaleX={layoutScaleX * totalScale}
              pointerScaleY={layoutScaleY * totalScale}
            />
          );
        })()}
      <FloatingToolbar
        toolMode={toolMode}
        onToolModeChange={setToolMode}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={onUndo}
        onRedo={onRedo}
        zoom={viewport.zoom}
        onZoomChange={(zoom) => editor.store.getState().setViewport({ ...viewport, zoom })}
        containerEl={containerRef.current}
      />
      {!isEditingLoop && shouldShowMinimap(designW, designH, originX, originY, totalScale, containerSize) && (
        <Minimap
          variant={variant}
          designW={designW}
          designH={designH}
          originX={originX}
          originY={originY}
          totalScale={totalScale}
          containerSize={containerSize}
          onPan={(newOriginX, newOriginY) => editor.store.getState().setViewport({ ...viewport, panX: newOriginX - baseOffsetX, panY: newOriginY - baseOffsetY })}
        />
      )}
    </div>
  );
}
