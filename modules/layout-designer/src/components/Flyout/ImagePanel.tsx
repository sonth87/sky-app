import { useState, useEffect } from 'react';
import type { LayoutItem, LayoutVariant } from '@sky-app/slide-shared';
import type { AssetMeta } from '@sky-app/service-contracts';
import { addItemCommand, patchItemCommand } from '@sky-app/layout-editor-core';
import type { Editor } from '@sky-app/layout-editor-core';
import { useEditorState } from '../../hooks/useEditor.js';
import { useResolvedAssetUrl } from '../../hooks/useResolvedAssetUrl.js';
import { nextSpawnId } from './useSpawnDrag.js';
import { Search, Trash2 } from 'lucide-react';

export interface ImagePanelProps {
  editor: Editor;
  variant: LayoutVariant;
  loopItemId?: string;
  listAssets?: () => Promise<AssetMeta[]>;
  resolveAssetUrl?: (path: string) => Promise<string>;
  deleteAsset?: (path: string) => Promise<void>;
}

export function ImagePanel({
  editor,
  variant,
  loopItemId,
  listAssets,
  resolveAssetUrl,
  deleteAsset,
}: ImagePanelProps) {
  const selection = useEditorState(editor, (s) => s.selection);
  const [assets, setAssets] = useState<AssetMeta[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');

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

  const filteredAssets = (assets ?? []).filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className="px-[15px] pt-[15px] pb-[10px] font-bold text-[13px]">Ảnh</div>
      <div className="px-[14px] pb-[8px] text-[11px] text-[#9a9bab] leading-[1.45]">Nhấp để gán vào ảnh đang chọn, hoặc thêm ảnh mới.</div>
      {assets && (
        <div className="px-[14px] pb-[8px] relative">
          <Search size={14} className="absolute left-[22px] top-[10px] text-[#9a9bab] pointer-events-none" />
          <input
            type="text"
            placeholder="Tìm ảnh..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-[32px] pr-2 py-[6px] border border-[#e6e6ee] rounded-[6px] text-[11px] placeholder:text-[#9a9bab]"
          />
        </div>
      )}
      {loadError && <div className="px-[14px] text-[11px] text-[#c0521e]">Không tải được danh sách ảnh.</div>}
      {assets && assets.length === 0 && !loadError && (
        <div className="px-[14px] text-[11px] text-[#9a9bab]">Chưa có ảnh nào — dùng nút &quot;Đổi ảnh&quot; ở panel thuộc tính để tải lên.</div>
      )}
      {assets && filteredAssets.length === 0 && assets.length > 0 && (
        <div className="px-[14px] text-[11px] text-[#9a9bab]">Không tìm thấy ảnh nào phù hợp &quot;{search}&quot;.</div>
      )}
      <div className="p-[4px_14px_14px] overflow-y-auto grid grid-cols-2 gap-2">
        {filteredAssets.map((asset) => (
          <AssetThumbnail
            key={asset.relativePath}
            asset={asset}
            resolveAssetUrl={resolveAssetUrl}
            onClick={() => handlePick(asset)}
            onDelete={deleteAsset}
          />
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

function AssetThumbnail({
  asset,
  resolveAssetUrl,
  onClick,
  onDelete,
}: {
  asset: AssetMeta;
  resolveAssetUrl?: (path: string) => Promise<string>;
  onClick: () => void;
  onDelete?: (path: string) => Promise<void>;
}) {
  const url = useResolvedAssetUrl(asset.relativePath, resolveAssetUrl);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete(asset.relativePath);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        title={asset.name}
        className="w-full aspect-square border border-[#e6e6ee] rounded-lg p-0 overflow-hidden cursor-pointer"
        style={{
          background: url ? `center/cover url(${url})` : 'repeating-linear-gradient(45deg,#c9c9d6 0 8px,#e4e4ee 8px 16px)',
        }}
      />
      {onDelete && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="absolute top-1 right-1 p-1 bg-[#c03333]/90 rounded opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 cursor-pointer"
          title="Xoá ảnh"
        >
          <Trash2 size={12} className="text-white" />
        </button>
      )}
    </div>
  );
}
