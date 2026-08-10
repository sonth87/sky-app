import { useState, useEffect, useMemo } from 'react';
import type { LayoutItem, LayoutVariant } from '@sky-app/slide-shared';
import { collectUsedAssetPaths } from '@sky-app/slide-shared';
import type { AssetPort, AssetMeta } from '@sky-app/service-contracts';
import { addItemCommand, patchItemCommand } from '@sky-app/layout-editor-core';
import type { Editor } from '@sky-app/layout-editor-core';
import { useEditorState } from '../../hooks/useEditor.js';
import { useResolvedAssetUrl } from '../../hooks/useResolvedAssetUrl.js';
import { nextSpawnId } from './useSpawnDrag.js';
import { Plus, Trash2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@sky-app/ui';
import { MediaLibraryModal } from '../MediaLibraryModal.js';

export interface ImagePanelProps {
  editor: Editor;
  variant: LayoutVariant;
  loopItemId?: string;
  assetPort?: AssetPort;
  listAssets?: () => Promise<AssetMeta[]>;
  deleteAsset?: (path: string) => Promise<void>;
  resolveAssetUrl?: (path: string) => Promise<string>;
}

export function ImagePanel({ editor, variant, loopItemId, assetPort, listAssets, deleteAsset, resolveAssetUrl }: ImagePanelProps) {
  // Support both assetPort (preferred) and individual callbacks (backward compat). useMemo BẮT
  // BUỘC ở nhánh fallback — object literal trần tạo MỚI mỗi render sẽ làm MediaLibraryModal's
  // useEffect (dep [open, assetPort, initialTab]) refire liên tục mỗi khi ImagePanel re-render vì
  // BẤT KỲ lý do gì (doc/selection đổi...), gọi lại setActiveTab GHI ĐÈ tab user vừa bấm tay —
  // bug thật "chuyển tab bị nháy nháy" (2026-08-10), vì assetPort mới mỗi lần khiến effect coi
  // đó là "asset port đổi" dù bản chất vẫn cùng listAssets/deleteAsset/resolveAssetUrl.
  const finalAssetPort = useMemo(
    () => assetPort || (listAssets ? ({ listAssets, deleteAsset, resolveAssetUrl } as AssetPort) : undefined),
    [assetPort, listAssets, deleteAsset, resolveAssetUrl],
  );
  const doc = useEditorState(editor, (s) => s.doc);
  const selection = useEditorState(editor, (s) => s.selection);
  const usedPaths = useMemo(() => new Set(collectUsedAssetPaths(doc)), [doc]);

  const [activeTab, setActiveTab] = useState<'current' | 'all'>('all');
  const [assets, setAssets] = useState<AssetMeta[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [modalOpen, setModalOpen] = useState<'library' | 'upload' | false>(false);

  useEffect(() => {
    if (!finalAssetPort) return;
    let cancelled = false;
    finalAssetPort
      .listAssets?.()
      .then((list) => {
        if (!cancelled) setAssets(list);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [finalAssetPort]);

  if (!finalAssetPort) {
    return (
      <>
        <div className="px-[15px] pt-[15px] pb-[10px] font-bold text-[13px]">Media</div>
        <div className="px-[14px] text-[11px] text-[#9a9bab] leading-[1.45]">
          Nối AssetPort để sử dụng thư viện ảnh.
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

  const handleDelete = async (path: string) => {
    if (!assetPort?.deleteAsset) return;
    await assetPort.deleteAsset(path);
    setAssets((prev) => prev?.filter((a) => a.relativePath !== path) ?? null);
  };

  const currentAssets = (assets ?? []).filter((a) => usedPaths.has(a.relativePath));
  const allAssets = (assets ?? []).slice(0, 20);

  return (
    <>
      <div className="px-[15px] pt-[15px] pb-[10px] flex items-center justify-between">
        <span className="font-bold text-[13px]">Media</span>
        {finalAssetPort && (
          <button
            onClick={() => setModalOpen('upload')}
            title="Thêm ảnh"
            className="w-6 h-6 flex items-center justify-center rounded-[7px] hover:bg-[#f4f5f9] text-[#5c5d6e]"
          >
            <Plus size={16} />
          </button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="px-[15px] mt-2">
          <TabsTrigger value="current">Trong layout{currentAssets.length > 0 ? ` (${currentAssets.length})` : ''}</TabsTrigger>
          <TabsTrigger value="all">Toàn bộ</TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="flex-1 overflow-hidden flex flex-col m-0">
          {currentAssets.length === 0 ? (
            <div className="px-[14px] text-[11px] text-[#9a9bab] text-center py-6">
              Layout này chưa dùng ảnh nào — bấm <strong>+</strong> hoặc chuyển tab "Toàn bộ" để chọn ảnh có sẵn.
            </div>
          ) : (
            <div className="p-[8px_14px] grid grid-cols-2 gap-2 overflow-y-auto flex-1">
              {currentAssets.map((asset) => (
                <AssetThumbnail
                  key={asset.relativePath}
                  asset={asset}
                  resolveAssetUrl={finalAssetPort?.resolveAssetUrl}
                  onClick={() => handlePick(asset)}
                  onDelete={() => handleDelete(asset.relativePath)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all" className="flex-1 overflow-hidden flex flex-col m-0">
          {!finalAssetPort ? (
            <div className="px-[14px] text-[11px] text-[#9a9bab]">Chưa nối AssetPort.</div>
          ) : loadError ? (
            <div className="px-[14px] text-[11px] text-[#c0521e]">Không tải được danh sách ảnh.</div>
          ) : !assets ? (
            <div className="px-[14px] text-[11px] text-[#9a9bab] text-center py-6">Đang tải...</div>
          ) : allAssets.length === 0 ? (
            <div className="px-[14px] text-[11px] text-[#9a9bab] text-center py-6">Chưa có ảnh nào.</div>
          ) : (
            <>
              <div className="p-[8px_14px] grid grid-cols-2 gap-2 overflow-y-auto flex-1">
                {allAssets.map((asset) => (
                  <AssetThumbnail
                    key={asset.relativePath}
                    asset={asset}
                    resolveAssetUrl={finalAssetPort?.resolveAssetUrl}
                    onClick={() => handlePick(asset)}
                    onDelete={() => handleDelete(asset.relativePath)}
                  />
                ))}
              </div>
              {(assets?.length ?? 0) > 20 && (
                <div className="p-[8px_14px]">
                  <button
                    onClick={() => setModalOpen('library')}
                    className="w-full py-2 text-[11.5px] font-semibold rounded-lg border border-[#e6e6ee] hover:bg-[#f4f5f9] text-[#5c5d6e]"
                  >
                    Xem thêm ({assets!.length - 20} ảnh nữa)
                  </button>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      <MediaLibraryModal
        open={modalOpen !== false}
        onOpenChange={(o) => !o && setModalOpen(false)}
        assetPort={finalAssetPort}
        usedAssetPaths={Array.from(usedPaths)}
        initialTab={modalOpen === 'library' ? 'library' : modalOpen === 'upload' ? 'upload' : undefined}
        onSelect={(path) => {
          handlePick({ relativePath: path, name: path.split('/').pop() ?? 'image', sizeBytes: 0, uploadedAt: new Date().toISOString() });
        }}
      />
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
  onDelete?: () => Promise<void>;
}) {
  const url = useResolvedAssetUrl(asset.relativePath, resolveAssetUrl);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete();
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
          className="absolute top-1 left-1 bg-red-500 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}
