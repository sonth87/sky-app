import type { LayoutVariant } from '@sky-app/slide-shared';
import type { AssetMeta } from '@sky-app/service-contracts';
import type { Editor } from '@sky-app/layout-editor-core';
import type { RailGroup } from '../Rail.js';
import { useSpawnDrag } from './useSpawnDrag.js';
import { ComponentsPanel } from './ComponentsPanel.js';
import { TemplatesPanel } from './TemplatesPanel.js';
import { CollectionsPanel } from './CollectionsPanel.js';
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
  /** Media Library (Bước 11 kế hoạch resize/rotate, 2026-07-18) — bỏ trống = panel "Ảnh" hiện
   * thông báo chưa khả dụng (hành vi cũ, VD preview độc lập không có AssetPort). */
  listAssets?: () => Promise<AssetMeta[]>;
  resolveAssetUrl?: (path: string) => Promise<string>;
}

export function Flyout({
  editor,
  variant,
  group,
  getArtEl,
  getRootEl,
  editingLoopId,
  editingRefW,
  editingRefH,
  listAssets,
  resolveAssetUrl,
}: FlyoutProps) {
  const spawn = useSpawnDrag(editor, variant, getArtEl, getRootEl, editingLoopId, editingRefW, editingRefH);

  return (
    <div style={{ width: 242, flex: 'none', borderRight: '1px solid #e6e6ee', background: '#fff', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {group === 'comp' && <ComponentsPanel editor={editor} onSpawnDown={spawn.onDown} />}
      {group === 'tpl' && <TemplatesPanel />}
      {group === 'coll' && <CollectionsPanel />}
      {group === 'var' && <VariablesPanel variant={variant} onSpawnDown={spawn.onDown} />}
      {group === 'img' && (
        <ImagePanel
          editor={editor}
          variant={variant}
          loopItemId={editingLoopId}
          listAssets={listAssets}
          resolveAssetUrl={resolveAssetUrl}
        />
      )}
      {group === 'layers' && <LayersPanel editor={editor} variant={variant} />}
      {spawn.ghost && (
        <div
          style={{
            position: 'absolute',
            left: spawn.ghost.x + 10,
            top: spawn.ghost.y + 10,
            pointerEvents: 'none',
            zIndex: 9999,
            background: '#fff',
            border: '1px solid var(--accent-color, #4b57e6)',
            borderRadius: 8,
            padding: '6px 11px',
            fontWeight: 700,
            fontSize: 12,
            color: 'var(--accent-color, #4b57e6)',
            boxShadow: '0 10px 26px rgba(20,20,40,.25)',
          }}
        >
          {spawn.ghost.label}
        </div>
      )}
    </div>
  );
}
