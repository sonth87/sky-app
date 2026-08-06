// LayoutDesignerApp — xương sống editor: toolbar tối thiểu (undo/redo) + canvas + property
// panel. Rail/flyout (component/mẫu/bộ sưu tập/biến/ảnh/lớp) và versioning UI thuộc sub-bước
// 2.3 lượt sau + 2.4/2.5 (xem docs/roadmap/plans/layout-designer/23-editor-core-architecture.md).

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import type { AspectRatio, LayoutContent, LayoutVariant, LayoutVersion } from '@sky-app/slide-shared';
import type { AssetMeta, AssetPort, LayoutComponentPort, LayoutPort } from '@sky-app/service-contracts';
import {
  addVariantCommand,
  changeVariantAspectCommand,
  copyVariantAddMissingCommand,
  copyVariantOverwriteAllCommand,
  copyVariantOverwriteExistingCommand,
  removeVariantCommand,
} from '@sky-app/layout-editor-core';
import { ArrowLeft } from 'lucide-react';
import { useCreateEditor, useEditorState } from '../hooks/useEditor.js';
import { Canvas } from './Canvas/Canvas.js';
import { PropertyPanel } from './PropertyPanel/PropertyPanel.js';
import { Rail, type RailGroup } from './Rail.js';
import { Flyout } from './Flyout/Flyout.js';
import { VersioningPanel } from './VersioningPanel.js';
import { VariantTabs } from './VariantTabs.js';
import type { CopyVariantMode } from './CopyVariantPopover.js';
import { usePersistedState } from '../hooks/usePersistedState.js';
import { cn, ColorSwatchPicker } from '@sky-app/ui';

/** Giới hạn kéo resize property panel — quá hẹp thì input/nút không đủ chỗ, quá rộng thì canvas
 * bị bóp nhỏ. Rộng mặc định TĂNG từ 302 → 340 theo yêu cầu 2026-07-18 "cho to thêm 1 chút". */
const DEFAULT_RIGHT_PANEL_WIDTH = 340;
const MIN_RIGHT_PANEL_WIDTH = 280;
const MAX_RIGHT_PANEL_WIDTH = 560;

/** refW/refH mặc định khi tạo variant TRỐNG mới (12-thu-vien-layout.md "Tạo trống") — cạnh DÀI
 * NHẤT cố định 3840 (4K), cạnh còn lại tự tính theo đúng tỷ lệ (cùng nguyên tắc designSize() ở
 * Canvas.tsx). Đổi 2026-07-18 từ REF_UNIT=120 nhân trực tiếp aspect.w/h (VD 4:3 → 480×360, 1:1 →
 * 120×120 — QUÁ THẤP, không đủ độ chính xác px khi thiết kế chi tiết) — vì render LUÔN scale-to-
 * fit theo khung LED/màn hình thật lúc chạy (refW/refH không ảnh hưởng chất lượng hiển thị cuối,
 * chỉ là "lưới thiết kế"), nên cứ đặt to hẳn, không có chi phí gì, chỉ giúp thiết kế chính xác
 * hơn. Sau khi tạo, `changeVariantAspectCommand` (đổi tỷ lệ tại chỗ) GIỮ NGUYÊN refW này khi đổi
 * sang tỷ lệ khác — không cần sửa gì thêm ở đó. */
const DESIGN_LONG_EDGE_REF = 3840;
function defaultRefSize(aspect: AspectRatio): { refW: number; refH: number } {
  if (aspect.w >= aspect.h) {
    return { refW: DESIGN_LONG_EDGE_REF, refH: Math.round((DESIGN_LONG_EDGE_REF * aspect.h) / aspect.w) };
  }
  return { refW: Math.round((DESIGN_LONG_EDGE_REF * aspect.w) / aspect.h), refH: DESIGN_LONG_EDGE_REF };
}

export interface LayoutDesignerAppProps {
  content: LayoutContent;
  /** Gọi mỗi khi `doc` đổi (thêm/sửa/xoá item, KHÔNG gọi khi chỉ đổi selection/tool/viewport)
   * — dùng để debounce-save draft qua LayoutPort ở tầng gọi (LayoutDesignerAppModule). Không
   * gọi lúc mount lần đầu (content ban đầu không cần "save lại chính nó"). */
  onDocChange?: (doc: LayoutContent) => void;
  /** Nhãn trạng thái lưu hiện ở toolbar (VD "Đã lưu", "Đang lưu…") — hiển thị thuần, không tự suy luận. */
  saveStatusLabel?: string;
  layoutId?: string;
  layoutPort?: LayoutPort;
  /** Quay lại màn Thư viện Layout (Giai đoạn 5.1). Bỏ trống = ẩn nút "← Thư viện" (VD dùng
   * LayoutDesignerApp cho mục đích khác, không có khái niệm Library — xem VersioningPanel's
   * quy ước tương tự ở trên). */
  onBackToLibrary?: () => void;
  onRestoreVersion?: (version: any) => void;
  /**
   * Bỏ trống = ẩn VersioningPanel hoàn toàn (VD dùng LayoutDesignerApp cho mục đích khác không
   * cần publish). Truyền vào khi có LayoutPort thật ở tầng gọi (LayoutDesignerAppModule).
   * `onRestore` do caller tự remount component này (đổi `key`) SAU khi restore xong ở server —
   * editor không tự đồng bộ lại content khi restore, vì `useCreateEditor` chỉ khởi tạo 1 lần.
   */
  versioning?: {
    latestPublishedVersion: number | null;
    versions: LayoutVersion[];
    onPublish: (note?: string) => void;
    onRestore: (version: number) => void;
    isPublishing?: boolean;
  };
  /** Gợi ý toàn cục từ variable_registry (file 09 §2.6) — chuyển tiếp xuống PropertyPanel. */
  globalSuggestions?: string[];
  /** Gọi khi user chọn 1 token từ dropdown autocomplete — dùng ghi nhận variable_registry. */
  onTokenInserted?: (key: string) => void;
  /** AssetPort (docs/roadmap/plans/layout-designer/06-luu-tru-va-giao-tiep.md) — chọn ảnh +
   * resolve URL hiển thị. Bỏ trống = ẩn nút "Đổi ảnh", ảnh hiện có vẫn hiển thị nếu src là URL
   * dùng thẳng được (fail-soft, xem useResolvedAssetUrl). */
  pickAndSaveImage?: () => Promise<{ relativePath: string } | null>;
  resolveAssetUrl?: (path: string) => Promise<string>;
  /** Media Library (Bước 11 kế hoạch resize/rotate, 2026-07-18) — liệt kê ảnh đã lưu để hiện
   * lưới thumbnail trong Flyout's panel "Ảnh". Bỏ trống = panel hiện thông báo chưa khả dụng
   * (hành vi cũ). */
  listAssets?: () => Promise<AssetMeta[]>;
  /** Xoá 1 ảnh khỏi thư viện (optional, GĐ8a). Bỏ trống = không hiện nút xoá ảnh. */
  deleteAsset?: (relativePath: string) => Promise<void>;
  /** Personal templates (GĐ18) — save/list/delete nhóm item tự tạo. Bỏ trống = ẩn "Lưu thành
   * mẫu" trong ItemToolbar multi-select. */
  layoutComponentPort?: LayoutComponentPort;
  /** Màu tag layout (PHỤ LỤC "Event Hub", 2026-07-22) — hiện badge ở danh sách Event. Bỏ trống
   * (cả `documentColor` lẫn `onChangeColor`) = ẩn ColorSwatchPicker hoàn toàn. */
  documentColor?: string;
  onChangeColor?: (color: string | undefined) => void;
}

export function LayoutDesignerApp({
  content,
  onDocChange,
  saveStatusLabel,
  versioning,
  globalSuggestions,
  onTokenInserted,
  layoutPort,
  onBackToLibrary,
  pickAndSaveImage,
  resolveAssetUrl,
  listAssets,
  deleteAsset,
  layoutComponentPort,
  documentColor,
  onChangeColor,
}: LayoutDesignerAppProps) {
  const editor = useCreateEditor({ doc: content });
  const activeVariantId = useEditorState(editor, (s) => s.activeVariantId);
  const doc = useEditorState(editor, (s) => s.doc);
  // editingLoopId (Bước 10 kế hoạch resize/rotate, 2026-07-18) — chế độ sửa mẫu LoopItem.
  const editingLoopId = useEditorState(editor, (s) => s.editingLoopId);
  // historySnapshot() trả object MỚI mỗi lần gọi — không thể dùng trực tiếp làm selector
  // useStore (Object.is luôn "khác" → vòng lặp vô hạn). doc đổi tham chiếu mỗi khi
  // execute/undo/redo chạy, nên derive theo doc bằng useMemo là đủ để đồng bộ đúng lúc.
  const history = useMemo(() => editor.historySnapshot(), [editor, doc]);

  const isFirstDoc = useRef(true);
  useEffect(() => {
    if (isFirstDoc.current) {
      isFirstDoc.current = false;
      return;
    }
    onDocChange?.(doc);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy lại khi doc đổi, không
    // phải khi onDocChange đổi tham chiếu (caller có thể truyền closure mới mỗi render).
  }, [doc]);

  const variant = useMemo(() => doc.variants.find((v) => v.aspect.id === activeVariantId), [doc, activeVariantId]);
  const editingLoopItem = editingLoopId ? variant?.items.find((i) => i.id === editingLoopId) : undefined;
  const editingItemBox = editingLoopItem?.type === 'loop' ? editingLoopItem.itemBox : undefined;

  const [railGroup, setRailGroup] = useState<RailGroup>('comp');
  const artElRef = useRef<HTMLDivElement | null>(null);
  const rootElRef = useRef<HTMLDivElement | null>(null);

  // Ẩn/hiện TỪNG BÊN độc lập (review 2026-07-18: "palette trái cũng có nút để toggle" + panel
  // phải "có nút để toggle (nhớ lưu trạng thái)") — lưu localStorage (sở thích UI cá nhân trên
  // MÁY đó, KHÔNG phải dữ liệu layout, xem usePersistedState.ts). Khác `panelsVisible` (đã bỏ,
  // trước đó 1 state DUY NHẤT ẩn/hiện CẢ HAI bên cùng lúc, không phân biệt) — giờ Ctrl/Cmd+\ suy
  // ra từ 2 state này: nếu ÍT NHẤT 1 bên đang ẩn → hiện cả 2; nếu cả 2 đang hiện → ẩn cả 2 (xem
  // handleTogglePanels bên dưới) — vẫn giữ được hành vi "phím tắt ẩn/hiện toàn bộ để xem full canvas".
  const [leftPanelVisible, setLeftPanelVisible] = usePersistedState('layout-designer:leftPanelVisible', true);
  const [rightPanelVisible, setRightPanelVisible] = usePersistedState('layout-designer:rightPanelVisible', true);
  const [rightPanelWidth, setRightPanelWidth] = usePersistedState('layout-designer:rightPanelWidth', DEFAULT_RIGHT_PANEL_WIDTH);

  const handleTogglePanels = useCallback(() => {
    const bothVisible = leftPanelVisible && rightPanelVisible;
    setLeftPanelVisible(!bothVisible);
    setRightPanelVisible(!bothVisible);
  }, [leftPanelVisible, rightPanelVisible, setLeftPanelVisible, setRightPanelVisible]);

  // Kéo cạnh trái của PropertyPanel để resize (review 2026-07-18: "có thể drag để resize được").
  const resizeDragRef = useRef<{ startX: number; fromWidth: number } | null>(null);
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const handleResizeHandlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      resizeDragRef.current = { startX: e.clientX, fromWidth: rightPanelWidth };
      setIsResizingPanel(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [rightPanelWidth],
  );
  const handleResizeHandlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = resizeDragRef.current;
      if (!drag) return;
      // Kéo SANG TRÁI (dx âm) → panel RỘNG hơn (panel nằm bên PHẢI màn hình, cạnh resize ở mép trái nó).
      const dx = e.clientX - drag.startX;
      const next = Math.max(MIN_RIGHT_PANEL_WIDTH, Math.min(MAX_RIGHT_PANEL_WIDTH, drag.fromWidth - dx));
      setRightPanelWidth(next);
    },
    [setRightPanelWidth],
  );
  const handleResizeHandlePointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    resizeDragRef.current = null;
    setIsResizingPanel(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  // Thêm/xoá tỷ lệ (variant) — 12-thu-vien-layout.md "Tạo trống". refW/refH mới theo
  // defaultRefSize() (cạnh dài 3840). "Sao chép từ layout KHÁC" (không phải variant trong CÙNG
  // layout) xem handleAddClonedVariant bên dưới (Giai đoạn 5.1) — khác handleCopyFromVariant vốn
  // chỉ copy giữa variant CÙNG layout (có auto-sync).
  function handleAddVariant(aspect: AspectRatio) {
    editor.store.getState().dispatch(
      addVariantCommand({ aspect, ...defaultRefSize(aspect), items: [] }, activeVariantId),
    );
  }

  // "Sao chép từ layout khác" (Giai đoạn 5.1, 12-thu-vien-layout.md) — variant đã dựng SẴN xong
  // (đã clone qua cloneVariantAcrossLayouts, xem CrossLayoutVariantPickerModal), chỉ cần thêm vào
  // doc bằng đúng command addVariantCommand đã dùng cho "Tạo trống" ở trên.
  function handleAddClonedVariant(variant: LayoutVariant) {
    editor.store.getState().dispatch(addVariantCommand(variant, activeVariantId));
  }
  function handleRemoveVariant(variantId: string) {
    const remaining = doc.variants.filter((v) => v.aspect.id !== variantId);
    const nextActive = variantId === activeVariantId ? (remaining[0]?.aspect.id ?? variantId) : activeVariantId;
    editor.store.getState().dispatch(removeVariantCommand(variantId, nextActive));
  }

  // Đổi tỷ lệ CỦA CHÍNH 1 variant tại chỗ (không tạo bản sao, giữ nguyên liên kết sync — khác
  // handleAddVariant tạo variant MỚI) — review 2026-07-18, nút "Đổi tỷ lệ" khi hover tab.
  function handleChangeAspect(variantId: string, newAspect: AspectRatio) {
    editor.store.getState().dispatch(changeVariantAspectCommand(variantId, newAspect, variantId === activeVariantId));
  }

  // Copy nội dung từ 1 variant khác (Giai đoạn 2.6, 12-thu-vien-layout.md mở rộng 2026-07-18) —
  // 3 chế độ, mỗi chế độ dispatch đúng 1 command tương ứng đã có sẵn undo/redo (sync-commands.ts).
  function handleCopyFromVariant(sourceVariantId: string, targetVariantId: string, mode: CopyVariantMode, lockStrategy?: 'overwrite-locked' | 'skip-locked') {
    const state = editor.store.getState();
    if (mode === 'overwrite-all') {
      state.dispatch(copyVariantOverwriteAllCommand(sourceVariantId, targetVariantId, lockStrategy ?? 'skip-locked'));
    } else if (mode === 'add-missing') {
      state.dispatch(copyVariantAddMissingCommand(sourceVariantId, targetVariantId));
    } else {
      state.dispatch(copyVariantOverwriteExistingCommand(sourceVariantId, targetVariantId));
    }
  }

  const assetPort: AssetPort | undefined = useMemo(() => {
    if (!listAssets || !pickAndSaveImage || !resolveAssetUrl) return undefined;
    return {
      pickAndSaveImage,
      resolveAssetUrl,
      listAssets,
      deleteAsset,
    };
  }, [pickAndSaveImage, resolveAssetUrl, listAssets, deleteAsset]);

  return (
    // position:relative — containing block CỤC BỘ cho ghost label (position:absolute, xem
    // Flyout.tsx). Ghost KHÔNG dùng position:fixed vì @sonth87/device-layout's Window.tsx bọc
    // app trong 1 motion.div giữ `transform` inline THƯỜNG TRỰC (kể cả scale(1) lúc nghỉ) — theo
    // spec CSS, transform ≠ none trên ancestor biến nó thành containing block cho fixed, khiến
    // fixed bên trong app KHÔNG fix theo viewport toàn màn hình mà fix theo khung cửa sổ app,
    // gây ghost hiện lệch xa so với vị trí chuột thật (đã xác nhận qua ảnh chụp thực tế).
    <div ref={rootElRef} className="h-full flex flex-col overflow-hidden bg-[#f4f5f9] relative layout-designer-root">
      <Toolbar
        saveStatusLabel={saveStatusLabel}
        versioning={versioning}
        documentColor={documentColor}
        onChangeColor={onChangeColor}
        onBackToLibrary={onBackToLibrary}
      />
      <div className="flex-1 flex min-h-0 relative">
        {variant ? (
          <>
            {leftPanelVisible ? (
              <>
                <Rail active={railGroup} onChange={setRailGroup} onToggleVisible={() => setLeftPanelVisible(false)} />
                <Flyout
                  editor={editor}
                  variant={variant}
                  group={railGroup}
                  getArtEl={() => artElRef.current}
                  getRootEl={() => rootElRef.current}
                  editingLoopId={editingLoopItem?.type === 'loop' ? editingLoopId : undefined}
                  editingRefW={editingItemBox?.w}
                  editingRefH={editingItemBox?.h}
                  listAssets={listAssets}
                  deleteAsset={deleteAsset}
                  resolveAssetUrl={resolveAssetUrl}
                />
              </>
            ) : (
              <PanelEdgeToggle side="left" onClick={() => setLeftPanelVisible(true)} />
            )}
            <Canvas
              editor={editor}
              variant={variant}
              artRef={(el) => (artElRef.current = el)}
              resolveAssetUrl={resolveAssetUrl}
              onTogglePanels={handleTogglePanels}
              canUndo={history.canUndo}
              canRedo={history.canRedo}
              onUndo={() => editor.store.getState().undo()}
              onRedo={() => editor.store.getState().redo()}
              onTokenInserted={onTokenInserted}
              layoutComponentPort={layoutComponentPort}
              topLeftOverlay={
                <VariantTabs
                  variants={doc.variants}
                  activeVariantId={activeVariantId}
                  onSelect={(id) => editor.store.getState().setActiveVariant(id)}
                  onAdd={handleAddVariant}
                  onRemove={handleRemoveVariant}
                  onCopyFromVariant={handleCopyFromVariant}
                  onChangeAspect={handleChangeAspect}
                  onAddClonedVariant={handleAddClonedVariant}
                  layoutPort={layoutPort}
                  resolveAssetUrl={resolveAssetUrl}
                />
              }
            />
            {rightPanelVisible ? (
              <div className="shrink-0 flex relative">
                <div
                  onPointerDown={handleResizeHandlePointerDown}
                  onPointerMove={handleResizeHandlePointerMove}
                  onPointerUp={handleResizeHandlePointerUp}
                  className={cn(
                    'w-[5px] -ml-[2.5px] -mr-[2.5px] z-[1]',
                    isResizingPanel ? 'bg-[#4b57e6]/30' : 'bg-transparent'
                  )}
                  style={{ cursor: 'col-resize' }}
                />
                <PropertyPanel
                  editor={editor}
                  variantId={activeVariantId}
                  globalSuggestions={globalSuggestions}
                  onTokenInserted={onTokenInserted}
                  pickAndSaveImage={pickAndSaveImage}
                  resolveAssetUrl={resolveAssetUrl}
                  assetPort={assetPort}
                  width={rightPanelWidth}
                />
                <button
                  onClick={() => setRightPanelVisible(false)}
                  aria-label="Ẩn panel thuộc tính"
                  className="absolute top-[10px] right-[10px] w-[26px] h-[26px] rounded-[7px] border border-[#e6e6ee] bg-white text-[#9a9bab] hover:text-[#5c5d6e] flex items-center justify-center cursor-pointer z-[2]"
                >
                  <PanelRightClose size={14} />
                </button>
              </div>
            ) : (
              <PanelEdgeToggle side="right" onClick={() => setRightPanelVisible(true)} />
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[#9a9bab]">Không có variant nào</div>
        )}
      </div>
    </div>
  );
}

function PanelEdgeToggle({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={side === 'left' ? 'Hiện palette' : 'Hiện panel thuộc tính'}
      className={cn(
        'shrink-0 w-[18px] self-stretch border-none bg-white text-[#c9c9d3] hover:text-[#5c5d6e] cursor-pointer flex items-center justify-center',
        side === 'left' ? 'border-r border-[#e6e6ee]' : 'border-l border-[#e6e6ee]'
      )}
    >
      {side === 'left' ? <PanelLeftOpen size={13} /> : <PanelRightOpen size={13} />}
    </button>
  );
}

function Toolbar({
  saveStatusLabel,
  versioning,
  documentColor,
  onChangeColor,
  onBackToLibrary,
}: {
  saveStatusLabel?: string;
  versioning?: LayoutDesignerAppProps['versioning'];
  documentColor?: string;
  onChangeColor?: (color: string | undefined) => void;
  onBackToLibrary?: () => void;
}) {
  return (
    <div className="h-[52px] shrink-0 flex items-center gap-3 px-[14px] bg-white border-b border-[#e6e6ee]">
      {onBackToLibrary && (
        <button
          onClick={onBackToLibrary}
          className="flex items-center gap-1 -ml-1 px-2 py-1 rounded-[7px] border-none bg-transparent text-[#5c5d6e] font-semibold text-[12.5px] cursor-pointer hover:bg-[#f4f5f9]"
        >
          <ArrowLeft size={14} />
          Thư viện
        </button>
      )}
      <div className="font-semibold text-sm">Layout Designer</div>
      {saveStatusLabel && <div className="text-[11px] text-[#9a9bab] ml-1">{saveStatusLabel}</div>}
      <div className="flex-1" />
      {onChangeColor && (
        <ColorSwatchPicker color={documentColor} onChange={onChangeColor} title="Màu tag layout" clearLabel="Bỏ màu" />
      )}
      {versioning && (
        <VersioningPanel
          latestPublishedVersion={versioning.latestPublishedVersion}
          versions={versioning.versions}
          onPublish={versioning.onPublish}
          onRestore={versioning.onRestore}
          isPublishing={versioning.isPublishing}
        />
      )}
    </div>
  );
}
