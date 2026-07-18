// LayoutDesignerApp — xương sống editor: toolbar tối thiểu (undo/redo) + canvas + property
// panel. Rail/flyout (component/mẫu/bộ sưu tập/biến/ảnh/lớp) và versioning UI thuộc sub-bước
// 2.3 lượt sau + 2.4/2.5 (xem docs/roadmap/plans/layout-designer/23-editor-core-architecture.md).

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react';
import type { AspectRatio, LayoutContent, LayoutVersion } from '@sky-app/slide-shared';
import {
  addVariantCommand,
  changeVariantAspectCommand,
  copyVariantAddMissingCommand,
  copyVariantOverwriteAllCommand,
  copyVariantOverwriteExistingCommand,
  removeVariantCommand,
} from '@sky-app/layout-editor-core';
import { useCreateEditor, useEditorState } from './useEditor.js';
import { Canvas } from './Canvas.js';
import { PropertyPanel } from './PropertyPanel.js';
import { Rail, type RailGroup } from './Rail.js';
import { Flyout } from './Flyout.js';
import { VersioningPanel } from './VersioningPanel.js';
import { VariantTabs } from './VariantTabs.js';
import type { CopyVariantMode } from './CopyVariantPopover.js';
import { usePersistedState } from './usePersistedState.js';

/** Giới hạn kéo resize property panel — quá hẹp thì input/nút không đủ chỗ, quá rộng thì canvas
 * bị bóp nhỏ. Rộng mặc định TĂNG từ 302 → 340 theo yêu cầu 2026-07-18 "cho to thêm 1 chút". */
const DEFAULT_RIGHT_PANEL_WIDTH = 340;
const MIN_RIGHT_PANEL_WIDTH = 280;
const MAX_RIGHT_PANEL_WIDTH = 560;

/** refW/refH mặc định khi tạo variant TRỐNG mới (12-thu-vien-layout.md "Tạo trống") — nhân
 * aspect.w/h theo hệ số 120 (khớp mô tả file 04: "16:9 thành 1920×1080, 21:9 thành 2520×1080"). */
const REF_UNIT = 120;

export interface LayoutDesignerAppProps {
  content: LayoutContent;
  /** Gọi mỗi khi `doc` đổi (thêm/sửa/xoá item, KHÔNG gọi khi chỉ đổi selection/tool/viewport)
   * — dùng để debounce-save draft qua LayoutPort ở tầng gọi (LayoutDesignerAppModule). Không
   * gọi lúc mount lần đầu (content ban đầu không cần "save lại chính nó"). */
  onDocChange?: (doc: LayoutContent) => void;
  /** Nhãn trạng thái lưu hiện ở toolbar (VD "Đã lưu", "Đang lưu…") — hiển thị thuần, không tự suy luận. */
  saveStatusLabel?: string;
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
}

export function LayoutDesignerApp({
  content,
  onDocChange,
  saveStatusLabel,
  versioning,
  globalSuggestions,
  onTokenInserted,
  pickAndSaveImage,
  resolveAssetUrl,
}: LayoutDesignerAppProps) {
  const editor = useCreateEditor({ doc: content });
  const activeVariantId = useEditorState(editor, (s) => s.activeVariantId);
  const doc = useEditorState(editor, (s) => s.doc);
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

  // Thêm/xoá tỷ lệ (variant) — 12-thu-vien-layout.md "Tạo trống". refW/refH mới nhân aspect.w/h
  // theo REF_UNIT. "Sao chép từ layout KHÁC" (không phải variant trong CÙNG layout) vẫn hoãn GĐ5
  // cùng Layout Library đầy đủ — xem handleCopyFromVariant bên dưới cho copy giữa variant CÙNG layout.
  function handleAddVariant(aspect: AspectRatio) {
    editor.store.getState().dispatch(
      addVariantCommand({ aspect, refW: aspect.w * REF_UNIT, refH: aspect.h * REF_UNIT, items: [] }, activeVariantId),
    );
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

  return (
    // position:relative — containing block CỤC BỘ cho ghost label (position:absolute, xem
    // Flyout.tsx). Ghost KHÔNG dùng position:fixed vì @sonth87/device-layout's Window.tsx bọc
    // app trong 1 motion.div giữ `transform` inline THƯỜNG TRỰC (kể cả scale(1) lúc nghỉ) — theo
    // spec CSS, transform ≠ none trên ancestor biến nó thành containing block cho fixed, khiến
    // fixed bên trong app KHÔNG fix theo viewport toàn màn hình mà fix theo khung cửa sổ app,
    // gây ghost hiện lệch xa so với vị trí chuột thật (đã xác nhận qua ảnh chụp thực tế).
    <div ref={rootElRef} style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f4f5f9', position: 'relative' }}>
      <Toolbar saveStatusLabel={saveStatusLabel} versioning={versioning} />
      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
        {variant ? (
          <>
            {leftPanelVisible ? (
              <>
                <Rail active={railGroup} onChange={setRailGroup} onToggleVisible={() => setLeftPanelVisible(false)} />
                <Flyout editor={editor} variant={variant} group={railGroup} getArtEl={() => artElRef.current} getRootEl={() => rootElRef.current} />
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
              topLeftOverlay={
                <VariantTabs
                  variants={doc.variants}
                  activeVariantId={activeVariantId}
                  onSelect={(id) => editor.store.getState().setActiveVariant(id)}
                  onAdd={handleAddVariant}
                  onRemove={handleRemoveVariant}
                  onCopyFromVariant={handleCopyFromVariant}
                  onChangeAspect={handleChangeAspect}
                />
              }
            />
            {rightPanelVisible ? (
              <div style={{ flex: 'none', display: 'flex', position: 'relative' }}>
                <div
                  onPointerDown={handleResizeHandlePointerDown}
                  onPointerMove={handleResizeHandlePointerMove}
                  onPointerUp={handleResizeHandlePointerUp}
                  style={{
                    width: 5,
                    marginLeft: -2.5,
                    marginRight: -2.5,
                    zIndex: 1,
                    cursor: 'col-resize',
                    background: isResizingPanel ? 'color-mix(in srgb, var(--accent-color, #4b57e6) 30%, transparent)' : 'transparent',
                  }}
                />
                <PropertyPanel
                  editor={editor}
                  variantId={activeVariantId}
                  globalSuggestions={globalSuggestions}
                  onTokenInserted={onTokenInserted}
                  pickAndSaveImage={pickAndSaveImage}
                  resolveAssetUrl={resolveAssetUrl}
                  width={rightPanelWidth}
                />
                <button
                  onClick={() => setRightPanelVisible(false)}
                  aria-label="Ẩn panel thuộc tính"
                  style={{ ...panelToggleBtnStyle, top: 10, right: 10 }}
                >
                  <PanelRightClose size={14} />
                </button>
              </div>
            ) : (
              <PanelEdgeToggle side="right" onClick={() => setRightPanelVisible(true)} />
            )}
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9a9bab' }}>Không có variant nào</div>
        )}
      </div>
    </div>
  );
}

/** Style dùng chung cho 2 nút toggle "ẩn panel" (nổi góc trên panel, absolute — panel cha luôn
 * có position:relative để làm containing block). */
const panelToggleBtnStyle: React.CSSProperties = {
  position: 'absolute',
  width: 26,
  height: 26,
  borderRadius: 7,
  border: '1px solid #e6e6ee',
  background: '#fff',
  color: '#9a9bab',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  zIndex: 2,
};

/** Dải mảnh dán sát cạnh Canvas khi 1 bên panel đang ẨN — bấm để mở lại (review 2026-07-18:
 * "palette trái cũng có nút để toggle" + panel phải "có nút để toggle"). Đặt NGOÀI panel (không
 * lồng trong panel đã ẩn) vì panel không render gì khi ẩn — đây là điểm neo duy nhất để mở lại. */
function PanelEdgeToggle({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={side === 'left' ? 'Hiện palette' : 'Hiện panel thuộc tính'}
      style={{
        flex: 'none',
        width: 18,
        alignSelf: 'stretch',
        border: 'none',
        borderRight: side === 'left' ? '1px solid #e6e6ee' : undefined,
        borderLeft: side === 'right' ? '1px solid #e6e6ee' : undefined,
        background: '#fff',
        color: '#c9c9d3',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {side === 'left' ? <PanelLeftOpen size={13} /> : <PanelRightOpen size={13} />}
    </button>
  );
}

// Undo/redo giờ CHỈ ở toolbar nổi đáy canvas (Canvas.tsx's FloatingToolbar) — bỏ khỏi đây theo
// yêu cầu rút gọn 2026-07-17 (ảnh mẫu), tránh 2 nơi cùng hiện 1 chức năng.
function Toolbar({ saveStatusLabel, versioning }: { saveStatusLabel?: string; versioning?: LayoutDesignerAppProps['versioning'] }) {
  return (
    <div style={{ height: 52, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', background: '#fff', borderBottom: '1px solid #e6e6ee' }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>Layout Designer</div>
      {saveStatusLabel && <div style={{ fontSize: 11, color: '#9a9bab', marginLeft: 4 }}>{saveStatusLabel}</div>}
      <div style={{ flex: 1 }} />
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
