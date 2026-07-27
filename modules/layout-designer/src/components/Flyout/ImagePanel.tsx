import { useState, useEffect } from 'react';
import type { LayoutItem, LayoutVariant } from '@sky-app/slide-shared';
import type { AssetMeta } from '@sky-app/service-contracts';
import { addItemCommand, patchItemCommand } from '@sky-app/layout-editor-core';
import type { Editor } from '@sky-app/layout-editor-core';
import { useEditorState } from '../../hooks/useEditor.js';
import { useResolvedAssetUrl } from '../../hooks/useResolvedAssetUrl.js';
import { nextSpawnId } from './useSpawnDrag.js';

export interface ImagePanelProps {
  editor: Editor;
  variant: LayoutVariant;
  loopItemId?: string;
  listAssets?: () => Promise<AssetMeta[]>;
  resolveAssetUrl?: (path: string) => Promise<string>;
}

export function ImagePanel({
  editor,
  variant,
  loopItemId,
  listAssets,
  resolveAssetUrl,
}: ImagePanelProps) {
  const selection = useEditorState(editor, (s) => s.selection);
  const [assets, setAssets] = useState<AssetMeta[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!listAssets) return;
    let cancelled = false;
    listAssets()
      .then((list) => {
        if (!cancelled) setAssets(list);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [listAssets]);

  if (!listAssets) {
    return (
      <>
        <div className="px-[15px] pt-[15px] pb-[10px] font-bold text-[13px]">Ảnh</div>
        <div className="px-[14px] text-[11px] text-[#9a9bab] leading-[1.45]">
          Tải ảnh — nối tầng lưu trữ thật (Electron file / data-service upload / WASM blob) ở phần asset ảnh 3 tầng.
        </div>
      </>
    );
  }

  const handlePick = (asset: AssetMeta) => {
    const items = editingItemsOf(variant, loopItemId);
    const selected = items.find((i) => i.id === selection[0]);
    if (selected && selected.type === 'image') {
      editor.store.getState().dispatch(patchItemCommand(variant.aspect.id, selected.id, selected, { src: asset.relativePath }, loopItemId));
      return;
    }
    const newItem: LayoutItem = {
      id: nextSpawnId('img'),
      type: 'image',
      box: { x: 100, y: 100, w: 200, h: 200 },
      src: asset.relativePath,
    };
    editor.store.getState().dispatch(addItemCommand(variant.aspect.id, newItem, loopItemId));
  };

  return (
    <>
      <div className="px-[15px] pt-[15px] pb-[10px] font-bold text-[13px]">Ảnh</div>
      <div className="px-[14px] pb-[8px] text-[11px] text-[#9a9bab] leading-[1.45]">Nhấp để gán vào ảnh đang chọn, hoặc thêm ảnh mới.</div>
      {loadError && <div className="px-[14px] text-[11px] text-[#c0521e]">Không tải được danh sách ảnh.</div>}
      {assets && assets.length === 0 && !loadError && (
        <div className="px-[14px] text-[11px] text-[#9a9bab]">Chưa có ảnh nào — dùng nút &quot;Đổi ảnh&quot; ở panel thuộc tính để tải lên.</div>
      )}
      <div className="p-[4px_14px_14px] overflow-y-auto grid grid-cols-2 gap-2">
        {(assets ?? []).map((asset) => (
          <AssetThumbnail key={asset.relativePath} asset={asset} resolveAssetUrl={resolveAssetUrl} onClick={() => handlePick(asset)} />
        ))}
      </div>
    </>
  );
}

function editingItemsOf(variant: LayoutVariant, loopItemId?: string): LayoutItem[] {
  if (!loopItemId) return variant.items;
  const loop = variant.items.find((i) => i.id === loopItemId);
  return loop && loop.type === 'loop' ? loop.itemTemplate : [];
}

function AssetThumbnail({ asset, resolveAssetUrl, onClick }: { asset: AssetMeta; resolveAssetUrl?: (path: string) => Promise<string>; onClick: () => void }) {
  const url = useResolvedAssetUrl(asset.relativePath, resolveAssetUrl);
  return (
    <button
      onClick={onClick}
      title={asset.name}
      className="aspect-square border border-[#e6e6ee] rounded-lg p-0 overflow-hidden cursor-pointer"
      style={{
        background: url ? `center/cover url(${url})` : 'repeating-linear-gradient(45deg,#c9c9d6 0 8px,#e4e4ee 8px 16px)',
      }}
    />
  );
}
