import type { LayoutVariant } from '@sky-app/slide-shared';
import type { AssetMeta, AssetPort, LayoutComponentPort } from '@sky-app/service-contracts';
import type { Editor } from '@sky-app/layout-editor-core';
import type { RailGroup } from '../Rail.js';
import { useSpawnDrag } from './useSpawnDrag.js';
import { GraphicsPanel } from './GraphicsPanel.js';
import { FramesPanel } from './FramesPanel.js';
import { GridPresetsPanel } from './GridPresetsPanel.js';
import { TextPresetsPanel } from './TextPresetsPanel.js';
import { PersonalTemplatesPanel } from './PersonalTemplatesPanel.js';
import { VariablesPanel } from './VariablesPanel.js';
import { ImagePanel } from './ImagePanel.js';
import { LayersPanel } from './LayersPanel.js';

export interface FlyoutProps {
  editor: Editor;
  variant: LayoutVariant;
  group: RailGroup;
  getArtEl: () => HTMLDivElement | null;
  /** Phần tử root của LayoutDesignerApp (position:relative) — containing block CỤC BỘ cho ghost
   * label. KHÔNG dùng position:fixed + clientX/clientY trực tiếp: @sonth87/device-layout's
   * Window.tsx bọc app trong 1 motion.div giữ `transform` inline THƯỜNG TRỰC (kể cả scale(1)
   * lúc nghỉ) — transform ≠ none trên ancestor biến nó thành containing block cho fixed, khiến
   * ghost hiện lệch xa khỏi con trỏ chuột thật (bug thật, xác nhận qua ảnh chụp 2026-07-17). */
  getRootEl: () => HTMLDivElement | null;
  /** Có giá trị khi đang ở chế độ sửa mẫu LoopItem (Bước 10 kế hoạch resize/rotate, 2026-07-18) —
   * spawn item MỚI vào itemTemplate của LoopItem này thay vì variant.items top-level.
   * `editingRefW/H` = kích thước "ô" (itemBox.w/h) dùng để quy đổi toạ độ thả thay cho
   * variant.refW/refH khi đang edit-mode (artEl hiển thị theo kích thước ô, không phải variant). */
  editingLoopId?: string;
  editingRefW?: number;
  editingRefH?: number;
  /** Media Library (Bước 11 kế hoạch resize/rotate, 2026-07-18) — bỏ trống = panel "Media" hiện
   * thông báo chưa khả dụng (hành vi cũ, VD preview độc lập không có AssetPort). */
  listAssets?: () => Promise<AssetMeta[]>;
  deleteAsset?: (relativePath: string) => Promise<void>;
  resolveAssetUrl?: (path: string) => Promise<string>;
  /** AssetPort đầy đủ, ƯU TIÊN HƠN 3 prop lẻ trên khi có — truyền THẲNG xuống ImagePanel để giữ
   * reference ỔN ĐỊNH (bugfix 2026-08-10: ImagePanel tự ráp lại object từ 3 callback lẻ mỗi
   * render khi thiếu assetPort, khiến MediaLibraryModal's effect refire liên tục → chuyển tab bị
   * nháy nháy, xem ImagePanel.tsx's comment). */
  assetPort?: AssetPort;
  /** Personal templates (GĐ18) — save/list/delete nhóm item tự tạo, hiện ở nhóm "Mẫu". Bỏ trống =
   * panel "Mẫu" hiện thông báo "Chưa khả dụng". */
  layoutComponentPort?: LayoutComponentPort;
}

export function Flyout({
  group,
  editor,
  variant,
  getArtEl,
  getRootEl,
  editingLoopId,
  editingRefW,
  editingRefH,
  listAssets,
  deleteAsset,
  resolveAssetUrl,
  layoutComponentPort,
  assetPort,
}: FlyoutProps) {
  const spawn = useSpawnDrag(editor, variant, getArtEl, getRootEl, editingLoopId, editingRefW, editingRefH);

  return (
    <div className="w-[242px] shrink-0 border-r border-[#e6e6ee] bg-white flex flex-col min-h-0">
      {group === 'template' && <PersonalTemplatesPanel layoutComponentPort={layoutComponentPort} onSpawnDown={spawn.onDown} />}
      {group === 'text' && <TextPresetsPanel onSpawnDown={spawn.onDown} />}
      {group === 'media' && (
        <ImagePanel
          editor={editor}
          variant={variant}
          loopItemId={editingLoopId}
          assetPort={assetPort}
          listAssets={listAssets}
          deleteAsset={deleteAsset}
          resolveAssetUrl={resolveAssetUrl}
        />
      )}
      {group === 'graphics' && <GraphicsPanel editor={editor} onSpawnDown={spawn.onDown} />}
      {group === 'frame' && <FramesPanel onSpawnDown={spawn.onDown} />}
      {group === 'grid' && <GridPresetsPanel onSpawnDown={spawn.onDown} />}
      {group === 'var' && <VariablesPanel variant={variant} onSpawnDown={spawn.onDown} />}
      {group === 'layers' && <LayersPanel editor={editor} variant={variant} />}
      {spawn.ghost && (
        <div
          className="absolute pointer-events-none z-[9999] bg-white border border-[#4b57e6] rounded-lg px-[11px] py-[6px] font-bold text-xs text-[#4b57e6] shadow-[0_10px_26px_rgba(20,20,40,0.25)]"
          style={{
            position: 'absolute',
            left: spawn.ghost.x + 10,
            top: spawn.ghost.y + 10,
            zIndex: 9999,
          }}
        >
          {spawn.ghost.label}
        </div>
      )}
    </div>
  );
}
