// Canvas — hiển thị + chọn + kéo item của variant active. Đặt tên phân biệt 2 vùng (chốt
// 2026-07-18): "Canvas" = TOÀN BỘ mặt phẳng làm việc (containerRef, vùng xám #eceef3 — viewport
// cuộn/zoom/pan, cho phép kéo item TỰ DO ra ngoài, kiểu bàn làm việc Figma); "Frame" (artEl) =
// khung XUẤT BẢN THẬT bên trong Canvas — CHỈ nội dung nằm trong Frame mới hiển thị trên slide
// lúc chạy thật (LayoutRenderer/backdrop). Frame KHÔNG còn overflow:hidden (bỏ 2026-07-18) — item
// bị lòi ra ngoài Frame (do copy-variant từ tỷ lệ khác, hoặc do user tự kéo ra) vẫn hiển thị +
// thao tác được trên Canvas, chỉ đơn giản KHÔNG xuất hiện trên slide thật vì nằm ngoài Frame.
//
// Khung hiển thị "logic" của Frame (trước fit-to-container/zoom) LUÔN đúng tỷ lệ variant.aspect.w:h
// (xem designSize() — cạnh dài nhất cố định 760px, cạnh còn lại tự co theo tỷ lệ; đổi 2026-07-18,
// TRƯỚC ĐÓ từng cố định 760×428 bất kể variant là tỷ lệ gì — bug đã sửa), tự fit-to-container qua
// ResizeObserver (giữ đúng cảm giác "khung thiết kế chuẩn, không đổi theo kích thước cửa sổ");
// TOẠ ĐỘ ITEM vẫn là px trên refW/refH thật của variant (không phải kích thước khung hiển thị) —
// canvas chỉ hiển thị scale-to-fit khung xem, khác với zoom/pan (viewport.ts, thao tác thủ công).
//
// Render ở đây KHÔNG dùng LayoutRenderer (đó là read-only cho runtime/preview) — canvas cần vẽ
// thêm handle chọn/kéo, nên có view riêng đơn giản hoá theo prototype (chưa đủ style như
// LayoutRenderer, xem TODO "hợp nhất render text/image/shape" khi làm Preview mode ở sub-bước sau).

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { MousePointer2, Hand, Undo2, Redo2, Minus, Plus, Maximize } from 'lucide-react';
import type { Box, LayoutItem, LayoutVariant } from '@sky-app/slide-shared';
import { computeSnap, moveItemCommand, zoomAt, MIN_ZOOM, MAX_ZOOM } from '@sky-app/layout-editor-core';
import type { Editor, Guide } from '@sky-app/layout-editor-core';
import { useEditorState } from './useEditor.js';
import { useResolvedAssetUrl } from './useResolvedAssetUrl.js';
import { useCanvasKeyboardShortcuts } from './useCanvasKeyboardShortcuts.js';
import { SyncBadge } from './SyncBadge.js';

/** Cạnh DÀI NHẤT của khung hiển thị "logic" (trước khi fit-to-container/zoom) — cạnh còn lại tự
 * tính theo đúng tỷ lệ `variant.aspect.w/h` (xem designSize()) — KHÔNG còn cố định 760×428 như
 * trước 2026-07-18 (bug: canvas luôn hiện khung ~16:9 bất kể variant là tỷ lệ gì, VD variant 4:3
 * hay 9:16 vẫn bị ép vào khung 760×428, khiến toạ độ item bị méo theo layoutScaleX≠layoutScaleY
 * SAI Ý ĐỊNH — layoutScaleX/Y lẽ ra chỉ nên khác nhau do refW/refH khác aspect, không phải do
 * khung hiển thị sai tỷ lệ). */
const DESIGN_LONG_EDGE = 760;
/** Ngưỡng snap tính theo px trên canvas CHUẨN (refW/refH), không phải px hiển thị. */
const SNAP_THRESHOLD = 8;
/** Hệ số zoom mỗi lần Ctrl+scroll 1 "nấc" hoặc bấm nút +/- (không phải scroll mượt liên tục). */
const ZOOM_STEP_FACTOR = 1.1;

/** Khung hiển thị "logic" (trước fit-to-container/zoom) đúng tỷ lệ aspect.w:aspect.h, cạnh dài
 * nhất = DESIGN_LONG_EDGE. VD 16:9 → 760×428 (như cũ); 4:3 → 760×570; 9:16 (dọc) → 240×428 (cạnh
 * DỌC là 760, cạnh ngang tự co) — chốt 2026-07-18: giữ cạnh dài=760, không giữ cố định 1 chiều. */
function designSize(aspect: { w: number; h: number }): { w: number; h: number } {
  if (aspect.w >= aspect.h) {
    return { w: DESIGN_LONG_EDGE, h: (DESIGN_LONG_EDGE * aspect.h) / aspect.w };
  }
  return { w: (DESIGN_LONG_EDGE * aspect.w) / aspect.h, h: DESIGN_LONG_EDGE };
}

/** Quy đổi 1 điểm màn hình (clientX/clientY) đang kéo-thả từ palette → toạ độ canvas chuẩn
 * (refW/refH thật của variant, gốc tại (0,0) = góc trên-trái FRAME). KHÔNG còn giới hạn trong
 * biên Frame (bỏ 2026-07-18, cho phép kéo tự do kiểu Figma — xem comment đầu file) — điểm thả
 * NGOÀI Frame vẫn trả toạ độ hợp lệ (âm hoặc vượt refW/refH), chỉ đơn giản item đó sẽ không hiện
 * trên slide thật vì nằm ngoài Frame. Đọc `artEl` TẠI THỜI ĐIỂM GỌI (không cache) — dùng ở
 * pointerup lúc thả item mới (xem LayoutDesignerApp). Luôn trả giá trị (không còn `| null`) trừ
 * khi `artEl` chưa layout xong (rect rỗng) — case biên gần như không xảy ra trong thực tế. */
export function screenPointToCanvas(artEl: HTMLElement, variant: LayoutVariant, clientX: number, clientY: number): { x: number; y: number } | null {
  const rect = artEl.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const scaleX = rect.width / variant.refW;
  const scaleY = rect.height / variant.refH;
  return { x: (clientX - rect.left) / scaleX, y: (clientY - rect.top) / scaleY };
}

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
}

export function Canvas({ editor, variant, artRef, resolveAssetUrl, onTogglePanels, canUndo, canRedo, onUndo, onRedo, topLeftOverlay }: CanvasProps) {
  const selection = useEditorState(editor, (s) => s.selection);
  const viewport = useEditorState(editor, (s) => s.viewport);
  const doc = useEditorState(editor, (s) => s.doc);
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
  const { w: designW, h: designH } = designSize(variant.aspect);
  const containerRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  const [guides, setGuides] = useState<Guide[]>([]);
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
  const layoutScaleX = designW / variant.refW;
  const layoutScaleY = designH / variant.refH;

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

  // Space bật/tắt hand-tool tạm thời — chỉ khi canvas có focus (đồng nhất scope shortcut khác).
  // Không preventDefault mặc định (Space có thể đang gõ trong ô khác) — nhưng ở đây onKeyDown
  // chỉ nhận khi target là chính canvas (đã focus), nên an toàn giữ nguyên hành vi.
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
      // zoomAt() thao tác trong hệ toạ độ NỘI BỘ screenPoint = u*zoom + pan (không có baseOffset)
      // — anchor phải trừ baseOffsetX/Y trước khi truyền vào, nếu không điểm neo sẽ lệch đúng
      // bằng baseOffset (tái diễn bug lệch khi zoom, xem comment "QUAN TRỌNG" ở phần originX/Y).
      const anchor = { x: e.clientX - rect.left - baseOffsetX, y: e.clientY - rect.top - baseOffsetY };
      // deltaY < 0 (cuộn lên/pinch ra) = phóng to; deltaY > 0 = thu nhỏ.
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
        // Cho phép canvas nhận focus lúc click (kể cả click vào nền, không chỉ item) để shortcut
        // hoạt động ngay sau khi thao tác chuột — không cần Tab thủ công trước.
        containerRef.current?.focus();
        // Chuột giữa / hand-tool(cố định hoặc Space tạm thời)+trái → PAN, không deselect (không
        // phải thao tác chọn). Còn lại (click trái thường vào nền, đang ở select-tool) → deselect.
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
        handleSpaceKeyDown(e);
        handleKeyDown(e);
      }}
      onKeyUp={handleSpaceKeyUp}
      style={{
        flex: 1,
        background: '#eceef3',
        // Nền lưới chấm "." của CANVAS (vùng làm việc NGOÀI Frame, đổi 2026-07-18 — TRƯỚC ĐÓ lưới
        // chấm nằm TRONG Frame/artEl, sai vì lưới là trang trí công cụ thiết kế, không phải nội
        // dung Frame). Lưới LUÔN hiện trên toàn Canvas bất kể variant có background hay không —
        // khác với nền Frame (FrameSurface) vốn chỉ hiện lưới khi variant CHƯA có background.
        backgroundImage: 'radial-gradient(circle, #00000014 1px, transparent 1px)',
        backgroundSize: '16px 16px',
        position: 'relative',
        minWidth: 0,
        // overflow:hidden Ở ĐÂY là của CANVAS (cắt theo viewport màn hình khi pan/zoom xa) —
        // KHÁC với Frame (artEl bên dưới), đã bỏ overflow:hidden riêng để item lòi ra ngoài Frame
        // vẫn hiển thị/thao tác được trên Canvas (xem comment đầu file "Canvas — hiển thị...").
        overflow: 'hidden',
        outline: 'none',
        // Con trỏ báo hiệu hand-tool: "grab" khi sẵn sàng pan, "grabbing" khi đang kéo.
        cursor: isPanning ? 'grabbing' : isHandActive ? 'grab' : 'default',
      }}
    >
      {/* KHÔNG còn div bọc trung gian — artEl đặt trực tiếp tại (originX, originY) rồi tự
         scale(totalScale) quanh transformOrigin top-left. left/top dùng px tuyệt đối (không
         phải %+translate) để khớp CHÍNH XÁC 1 phép biến đổi tuyến tính screenPoint =
         canvasPoint*totalScale + origin, đúng mô hình zoomAt()/canvasToScreen() giả định. */}
      <div
        ref={artRef}
        data-testid="canvas-frame"
        style={{
          position: 'absolute',
          left: originX,
          top: originY,
          width: designW,
          height: designH,
          // KHÔNG borderRadius/overflow/background/boxShadow ở CHÍNH artEl nữa (chuyển hết sang
          // lớp <FrameSurface> con bên dưới, position:absolute inset:0) — vì artEl giờ là container
          // CHỨA ITEMS, không được overflow:hidden (bỏ 2026-07-18, xem comment đầu file) để item
          // lòi ra ngoài Frame vẫn hiển thị/thao tác được. FrameSurface là 1 SIBLING tách riêng
          // (không phải ancestor của items) nên overflow:hidden của NÓ không cắt items của artEl.
          transform: `scale(${totalScale})`,
          transformOrigin: 'top left',
        }}
      >
        <FrameSurface variant={variant} resolvedBackgroundUrl={resolvedBackgroundUrl} />
        {variant.items.map((item) => (
          <CanvasItemView
            key={item.id}
            item={item}
            editor={editor}
            variant={variant}
            selected={selection.includes(item.id)}
            isSyncParent={Boolean(item.syncKey && parentSyncKeys.has(item.syncKey))}
            scaleX={layoutScaleX}
            scaleY={layoutScaleY}
            pointerScaleX={layoutScaleX * totalScale}
            pointerScaleY={layoutScaleY * totalScale}
            onGuidesChange={setGuides}
            resolveAssetUrl={resolveAssetUrl}
          />
        ))}
        {guides.map((g, i) => (
          <GuideLine key={i} guide={g} scaleX={layoutScaleX} scaleY={layoutScaleY} />
        ))}
      </div>
      {topLeftOverlay}
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
    </div>
  );
}

/**
 * Nền + viền + bóng của Frame — tách RIÊNG khỏi artEl (containing items) thành 1 sibling
 * `position:absolute inset:0` phủ đúng vùng Frame, để `overflow:hidden`/`borderRadius` CỦA NÓ
 * không cắt items nằm trong artEl (bỏ overflow:hidden trên artEl 2026-07-18 — xem comment đầu
 * file). `pointerEvents:'none'` để không chặn thao tác chuột lên item nằm ĐÈ lên vị trí này.
 * KHÔNG có lưới chấm ở đây (đổi 2026-07-18 — lưới là trang trí của CANVAS/vùng làm việc, không
 * phải nội dung Frame, xem style của containerRef trong Canvas()) — Frame LUÔN có nền đặc (màu
 * tuỳ chỉnh hoặc trắng mặc định), không lộ lưới bên dưới dù variant chưa có background riêng.
 */
function FrameSurface({ variant, resolvedBackgroundUrl }: { variant: LayoutVariant; resolvedBackgroundUrl: string | undefined }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 10,
        overflow: 'hidden',
        pointerEvents: 'none',
        // Viền rõ đánh dấu biên Frame — "trong = hiện trên slide thật, ngoài = vùng nháp/
        // backstage chỉ dùng để thao tác, không xuất bản" (xem comment đầu file).
        border: '1.5px solid rgba(20,10,50,.18)',
        // Mặc định TRẮNG khi không có background tuỳ chỉnh (đổi 2026-07-18, TRƯỚC ĐÓ mặc định
        // tím #201748 — đúng ý "nền canvas mặc định màu trắng"). Xử lý đủ 3 loại nền (color/
        // gradient/image) — trước đó CHỈ xử lý color, gradient/image bị bỏ sót (bug thật, dùng
        // FrameBackgroundControls chọn gradient/ảnh sẽ không thấy gì trên canvas).
        background:
          variant.background?.kind === 'color'
            ? variant.background.color
            : variant.background?.kind === 'gradient'
              ? variant.background.gradient
              : variant.background?.kind === 'image' && resolvedBackgroundUrl
                ? `center/cover url(${resolvedBackgroundUrl})`
                : '#fff',
        boxShadow: '0 20px 60px -20px rgba(20,10,50,.6)',
      }}
    />
  );
}

/**
 * Toolbar nổi Ở PHÍA TRÊN canvas (đổi từ đáy → đỉnh theo yêu cầu 2026-07-17) — rút gọn theo ảnh
 * mẫu (đã bỏ: nút AI/sparkle, chọn desktop/mobile view, 2 nút grid/column, logo Figma — những
 * cái đó không cần cho editor này). Giữ lại: select-tool, hand-tool (cố định, khác Space tạm
 * thời), undo/redo, zoom out/%/in, fullscreen — toàn bộ icon dùng lucide-react (đồng bộ với
 * modules/tts-studio, modules/ceremony), KHÔNG dùng emoji/ký tự Unicode tự chọn như trước. KHÔNG
 * phải "toolbar chung" đầy đủ theo plan (chưa có minimap) — chỉ đủ nhóm điều khiển canvas cơ bản.
 */
function FloatingToolbar({
  toolMode,
  onToolModeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  zoom,
  onZoomChange,
  containerEl,
}: {
  toolMode: 'select' | 'hand';
  onToolModeChange: (mode: 'select' | 'hand') => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  containerEl: HTMLDivElement | null;
}) {
  const zoomIn = () => onZoomChange(Math.min(MAX_ZOOM, zoom * ZOOM_STEP_FACTOR));
  const zoomOut = () => onZoomChange(Math.max(MIN_ZOOM, zoom / ZOOM_STEP_FACTOR));
  const reset = () => onZoomChange(1);
  const toggleFullscreen = () => {
    if (!containerEl) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void containerEl.requestFullscreen();
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 2,
        alignItems: 'center',
        background: '#fff',
        border: '1px solid #e6e6ee',
        borderRadius: 10,
        padding: '4px 6px',
        boxShadow: '0 4px 14px rgba(0,0,0,.08)',
        zIndex: 5,
      }}
    >
      <button onClick={() => onToolModeChange('select')} aria-label="Công cụ chọn" aria-pressed={toolMode === 'select'} style={toolBtnStyle(toolMode === 'select')}>
        <MousePointer2 size={15} />
      </button>
      <button onClick={() => onToolModeChange('hand')} aria-label="Công cụ tay (pan)" aria-pressed={toolMode === 'hand'} style={toolBtnStyle(toolMode === 'hand')}>
        <Hand size={15} />
      </button>
      <Divider />
      <button onClick={onUndo} disabled={!canUndo} aria-label="Hoàn tác" style={toolBtnStyle(false, canUndo)}>
        <Undo2 size={15} />
      </button>
      <button onClick={onRedo} disabled={!canRedo} aria-label="Làm lại" style={toolBtnStyle(false, canRedo)}>
        <Redo2 size={15} />
      </button>
      <Divider />
      <button onClick={zoomOut} aria-label="Thu nhỏ" style={toolBtnStyle(false)}>
        <Minus size={15} />
      </button>
      <button onClick={reset} aria-label="Đặt lại zoom 100%" style={{ ...toolBtnStyle(false), width: 48, fontSize: 11.5 }}>
        {Math.round(zoom * 100)}%
      </button>
      <button onClick={zoomIn} aria-label="Phóng to" style={toolBtnStyle(false)}>
        <Plus size={15} />
      </button>
      <Divider />
      <button onClick={toggleFullscreen} aria-label="Toàn màn hình" style={toolBtnStyle(false)}>
        <Maximize size={15} />
      </button>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 20, background: '#e6e6ee', margin: '0 2px' }} />;
}

function toolBtnStyle(active: boolean, enabled = true): React.CSSProperties {
  return {
    width: 26,
    height: 26,
    borderRadius: 7,
    border: 'none',
    // var(--accent-color) — màu accent hệ thống (device-layout's ThemeProvider set động lên
    // <html> theo Settings > Appearance), KHÔNG hard-code để khớp app khác khi user đổi màu.
    background: active ? 'color-mix(in srgb, var(--accent-color, #4b57e6) 12%, transparent)' : 'transparent',
    color: !enabled ? '#d3d4de' : active ? 'var(--accent-color, #4b57e6)' : '#5c5d6e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: enabled ? 'pointer' : 'default',
  };
}

function GuideLine({ guide, scaleX, scaleY }: { guide: Guide; scaleX: number; scaleY: number }) {
  const style =
    guide.axis === 'x'
      ? { position: 'absolute' as const, left: guide.position * scaleX, top: 0, bottom: 0, width: 1, background: 'var(--accent-color, #4b57e6)', pointerEvents: 'none' as const }
      : { position: 'absolute' as const, top: guide.position * scaleY, left: 0, right: 0, height: 1, background: 'var(--accent-color, #4b57e6)', pointerEvents: 'none' as const };
  return <div style={style} />;
}

interface CanvasItemViewProps {
  item: LayoutItem;
  editor: Editor;
  variant: LayoutVariant;
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
}

function CanvasItemView({ item, editor, variant, selected, scaleX, scaleY, pointerScaleX, pointerScaleY, onGuidesChange, resolveAssetUrl, isSyncParent }: CanvasItemViewProps) {
  const dragRef = useRef<{ startX: number; startY: number; from: Box; lastTo: Box } | null>(null);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      // stopPropagation() chặn luôn onPointerDown của container (nơi gọi containerRef.focus())
      // — phải tự focus lại đây, nếu không thì chọn item bằng chuột sẽ không kích hoạt được
      // shortcut (Delete/mũi tên...) cho tới khi người dùng bấm thêm vào nền canvas.
      (e.currentTarget.closest('[tabindex]') as HTMLElement | null)?.focus();
      editor.store.getState().setSelection([item.id]);
      dragRef.current = { startX: e.clientX, startY: e.clientY, from: item.box, lastTo: item.box };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [editor, item.id, item.box],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = (e.clientX - drag.startX) / pointerScaleX;
      const dy = (e.clientY - drag.startY) / pointerScaleY;
      const rawTo: Box = { ...drag.from, x: drag.from.x + dx, y: drag.from.y + dy };

      const otherBoxes = variant.items.filter((i) => i.id !== item.id).map((i) => i.box);
      const { snappedBox, guides } = computeSnap(rawTo, otherBoxes, { w: variant.refW, h: variant.refH }, SNAP_THRESHOLD);
      onGuidesChange(guides);

      editor.store.getState().dispatch(moveItemCommand(variant.aspect.id, item.id, drag.lastTo, snappedBox));
      drag.lastTo = snappedBox;
    },
    [editor, item.id, variant, pointerScaleX, pointerScaleY, onGuidesChange],
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
    cursor: 'move',
    opacity: item.opacity != null ? item.opacity / 100 : 1,
    outline: selected ? '2px solid var(--accent-color, #4b57e6)' : 'none',
    outlineOffset: 2,
    userSelect: 'none' as const,
  };

  return (
    <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} style={wrapStyle}>
      <ItemContent item={item} scaleX={scaleX} scaleY={scaleY} resolveAssetUrl={resolveAssetUrl} />
      {selected && <SelectionHandles />}
      <div style={{ position: 'absolute', top: -3, right: -3, background: '#fff', borderRadius: '50%', padding: 1, lineHeight: 0, pointerEvents: 'none' }}>
        <SyncBadge item={item} isParent={isSyncParent} size={10} />
      </div>
    </div>
  );
}

function ItemContent({
  item,
  scaleX,
  scaleY,
  resolveAssetUrl,
}: {
  item: LayoutItem;
  scaleX: number;
  scaleY: number;
  resolveAssetUrl?: (path: string) => Promise<string>;
}) {
  const fScale = Math.min(scaleX, scaleY);
  switch (item.type) {
    case 'text':
      return (
        <div
          style={{
            fontSize: item.fontSize * fScale,
            fontWeight: item.fontWeight,
            color: item.color,
            textAlign: item.align,
            lineHeight: 1.18,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {item.content}
        </div>
      );
    case 'ribbon':
      return (
        <div
          style={{
            fontSize: item.fontSize * fScale,
            fontWeight: item.fontWeight,
            color: item.color,
            background: item.bg,
            textAlign: 'center',
            padding: '6px 4px',
            width: '100%',
            height: '100%',
          }}
        >
          {item.content}
        </div>
      );
    case 'image':
      return <ImageItemContent item={item} fScale={fScale} resolveAssetUrl={resolveAssetUrl} />;
    case 'shape':
      return <div style={{ width: '100%', height: '100%', background: item.fill, borderRadius: item.shape === 'circle' ? '50%' : item.shape === 'rect' ? item.radius : undefined }} />;
    case 'loop':
      return (
        <div style={{ width: '100%', height: '100%', border: '1px dashed #9a9bab', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9a9bab', fontSize: 11 }}>
          Khung lặp (nhóm)
        </div>
      );
    default: {
      const _exhaustive: never = item;
      return _exhaustive;
    }
  }
}

function ImageItemContent({
  item,
  fScale,
  resolveAssetUrl,
}: {
  item: Extract<LayoutItem, { type: 'image' }>;
  fScale: number;
  resolveAssetUrl?: (path: string) => Promise<string>;
}) {
  const resolvedUrl = useResolvedAssetUrl(item.src, resolveAssetUrl);
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        borderRadius: item.shape === 'circle' ? '50%' : item.shape === 'round' ? 16 : 2,
        background: resolvedUrl ? `center/cover url(${resolvedUrl})` : 'repeating-linear-gradient(45deg,#c9c9d6 0 8px,#e4e4ee 8px 16px)',
        border: item.borderW ? `${item.borderW * fScale}px solid ${item.borderColor ?? '#000'}` : undefined,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#7c7c8c',
        fontWeight: 700,
        fontSize: 11,
      }}
    >
      {!resolvedUrl && (item.varKey ? `@${item.varKey}` : 'ẢNH')}
    </div>
  );
}

function SelectionHandles() {
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
