import { useCallback, useMemo } from 'react';
import type { LayoutItem } from '@sky-app/slide-shared';
import { patchItemCommand, patchVariantBackgroundCommand, removeItemCommand, resolveEditingItems, toggleSyncLockCommand } from '@sky-app/layout-editor-core';
import type { Editor } from '@sky-app/layout-editor-core';
import { useEditorState } from '../../hooks/useEditor.js';
import { collectUsedTokenKeys } from '../Flyout/helpers.js';
import { useResolvedAssetUrl } from '../../hooks/useResolvedAssetUrl.js';
import { PanelHeader } from './PanelHeader.js';
import { FrameBackgroundControls } from './FrameBackgroundControls.js';
import { TextControls } from './TextControls.js';
import { RibbonControls } from './RibbonControls.js';
import { ImageControls } from './ImageControls.js';
import { ShapeControls } from './ShapeControls.js';
import { LoopControls } from './LoopControls.js';
import { RotationControl, OpacityControl } from './CommonControls.js';

export interface PropertyPanelProps {
  editor: Editor;
  variantId: string;
  /** Gợi ý toàn cục từ variable_registry (file 09 §2.6, sub-bước 2.5) — gộp với token đã dùng
   * trong layout hiện tại. Bỏ trống = chỉ gợi ý theo layout hiện tại (như trước 2.5). */
  globalSuggestions?: string[];
  /** Gọi khi user CHỌN 1 token từ dropdown autocomplete — chuyển tiếp lên LayoutDesignerAppModule
   * để ghi nhận vào variable_registry qua LayoutPort. */
  onTokenInserted?: (key: string) => void;
  /** Mở file picker + lưu ảnh qua AssetPort, trả `relativePath` để gán vào ImageItem.src.
   * Bỏ trống = ẩn nút "Đổi ảnh" (VD preview độc lập không có AssetPort). */
  pickAndSaveImage?: () => Promise<{ relativePath: string } | null>;
  resolveAssetUrl?: (path: string) => Promise<string>;
  /** Bỏ trống = rộng mặc định 302px (hành vi cũ). Truyền vào khi caller cho phép resize panel
   * (LayoutDesignerApp.tsx — review 2026-07-18 "panel property nên cho to thêm 1 chút, và có thể
   * drag để resize được"). */
  width?: number;
}

export function PropertyPanel({ editor, variantId, globalSuggestions, onTokenInserted, pickAndSaveImage, resolveAssetUrl, width = 302 }: PropertyPanelProps) {
  const selection = useEditorState(editor, (s) => s.selection);
  const doc = useEditorState(editor, (s) => s.doc);
  // editingLoopId (Bước 10 kế hoạch resize/rotate, 2026-07-18) — khi có giá trị, lookup item
  // trong itemTemplate của LoopItem đó thay vì variant.items top-level (resolveEditingItems).
  const editingLoopId = useEditorState(editor, (s) => s.editingLoopId);

  const variant = doc.variants.find((v) => v.aspect.id === variantId);
  const editingItems = variant ? resolveEditingItems(variant, editingLoopId) : [];
  const item = editingItems.find((i) => i.id === selection[0]);
  const tokenSuggestions = useMemo(() => {
    const local = variant ? [...collectUsedTokenKeys(variant)] : [];
    if (!globalSuggestions || globalSuggestions.length === 0) return local;
    // Gộp, khử trùng — token local (đã dùng trong layout này) đứng TRƯỚC (liên quan trực tiếp
    // hơn), rồi tới gợi ý toàn cục theo usage_count (đã sắp sẵn từ LayoutPort.listTopVariables).
    const seen = new Set(local);
    const merged = [...local];
    for (const key of globalSuggestions) {
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(key);
      }
    }
    return merged;
  }, [variant, globalSuggestions]);

  const patch = useCallback(
    (patchValue: Partial<LayoutItem>) => {
      if (!item) return;
      editor.store.getState().dispatch(patchItemCommand(variantId, item.id, item, patchValue, editingLoopId));
    },
    [editor, item, variantId, editingLoopId],
  );

  // Không có item nào đang chọn → hiện thuộc tính CỦA CHÍNH Frame/Canvas (nền màu/gradient/ảnh —
  // review 2026-07-18, trước đó chỉ hiện text hướng dẫn tĩnh "Chọn một thành phần"). KHÔNG hiện
  // khi đang edit-mode (Bước 10) — ngữ cảnh "ô mẫu" không có nền variant thật để chỉnh.
  if (!item) {
    if (!variant || editingLoopId) return null;
    return (
      <FrameBackgroundControls
        variant={variant}
        onChange={(background) => editor.store.getState().dispatch(patchVariantBackgroundCommand(variantId, variant.background, background))}
        pickAndSaveImage={pickAndSaveImage}
        resolveAssetUrl={resolveAssetUrl}
        width={width}
      />
    );
  }

  const isSyncParent = !editingLoopId && Boolean(item.syncKey && doc.variants.some((v) => v.items.some((i) => i.syncRef === item.syncKey)));

  return (
    <div className="shrink-0 border-l border-[#e6e6ee] bg-white flex flex-col overflow-y-auto" style={{ width }}>
      <PanelHeader
        item={item}
        isSyncParent={isSyncParent}
        patch={patch}
        onDelete={() => editor.store.getState().dispatch(removeItemCommand(variantId, item.id, editingLoopId))}
        onToggleLock={() => editor.store.getState().dispatch(toggleSyncLockCommand(variantId, item.id, !item.syncLocked, editingLoopId))}
      />
      {item.type === 'text' && <TextControls item={item} patch={patch} tokenSuggestions={tokenSuggestions} onTokenInserted={onTokenInserted} />}
      {item.type === 'ribbon' && <RibbonControls item={item} patch={patch} tokenSuggestions={tokenSuggestions} onTokenInserted={onTokenInserted} />}
      {item.type === 'image' && (
        <ImageControls item={item} patch={patch} pickAndSaveImage={pickAndSaveImage} resolveAssetUrl={resolveAssetUrl} />
      )}
      {item.type === 'shape' && <ShapeControls item={item} patch={patch} />}
      {item.type === 'loop' && <LoopControls item={item} patch={patch} />}
      <RotationControl value={item.box.rotation ?? 0} onChange={(v) => patch({ box: { ...item.box, rotation: v } })} />
      <OpacityControl value={item.opacity ?? 100} onChange={(v) => patch({ opacity: v })} />
    </div>
  );
}
