import { useEffect, useRef, useState } from 'react';
import { Search, Trash2, CheckCircle2, XCircle, Loader2, CloudUpload, Image as ImageIcon } from 'lucide-react';
import type { Asset, AssetPort, AssetType } from '@sky-app/service-contracts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogFooter, Tabs, TabsList, TabsTrigger, TabsContent, cn } from '@sky-app/ui';

export interface MediaLibraryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetPort?: AssetPort;
  onSelect: (relativePath: string) => void;
  usedAssetPaths?: string[];
  initialTab?: 'current' | 'library' | 'upload' | 'url';
}

interface UploadItem {
  id: string;
  file: Blob;
  filename: string;
  preview: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  relativePath?: string;
}

export function MediaLibraryModal({ open, onOpenChange, assetPort, onSelect, usedAssetPaths, initialTab }: MediaLibraryModalProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'current' | 'library' | 'upload' | 'url'>('library');
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [isAddingUrl, setIsAddingUrl] = useState(false);
  const [urlError, setUrlError] = useState('');
  const [typeFilter, setTypeFilter] = useState<AssetType | 'all'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const usedAssetSet = new Set(usedAssetPaths ?? []);

  const filteredAssets = assets.filter((a) => {
    const matchesSearch = a.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'all' || a.type === typeFilter;
    return matchesSearch && matchesType;
  });

  useEffect(() => {
    if (!open || !assetPort) return;
    (assetPort.queryAssets?.({ type: 'image' }) || assetPort.listAssets?.().then(list => ({
      assets: (list || []).map(a => ({
        id: a.relativePath,
        type: 'image' as const,
        name: a.name,
        relativePath: a.relativePath,
        size: a.sizeBytes,
        uploadedAt: a.uploadedAt,
        source: 'local' as const,
      })),
      total: (list || []).length,
      page: 1,
      pageSize: (list || []).length,
    }))).then((result) => {
      if (result && 'assets' in result) {
        setAssets(result.assets);
      }
      setSelectedAsset(null);
      if (initialTab) setActiveTab(initialTab);
      else setActiveTab(result && 'assets' in result && result.assets.length > 0 ? 'library' : 'upload');
    });
  }, [open, assetPort, initialTab]);

  const handleAddUrl = async () => {
    if (!urlInput.trim() || !assetPort?.addAssetFromUrl) return;
    setIsAddingUrl(true);
    setUrlError('');
    try {
      const asset = await assetPort.addAssetFromUrl(urlInput);
      setAssets(prev => [asset, ...prev]);
      setUrlInput('');
      setActiveTab('library');
      setSelectedAsset(asset);
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : 'Failed to add image from URL');
    } finally {
      setIsAddingUrl(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      processFiles(Array.from(e.target.files));
    }
  };

  const processFiles = (files: File[]) => {
    const validFiles = files.filter((f) => f.type.startsWith('image/'));
    const newItems: UploadItem[] = validFiles.map((file) => {
      const reader = new FileReader();
      let preview = '';
      reader.onload = (e) => {
        if (typeof e.target?.result === 'string') {
          preview = e.target.result;
          setUploadItems((prev) => prev.map((item) => (item.id === newItems.find((n) => n.file === file)?.id ? { ...item, preview } : item)));
        }
      };
      reader.readAsDataURL(file);

      return {
        id: `${Date.now()}-${Math.random()}`,
        file: file as Blob,
        filename: file.name,
        preview: '',
        status: 'pending' as const,
      };
    });

    setUploadItems((prev) => [...prev, ...newItems]);
    startUpload([...uploadItems, ...newItems]);
  };

  const startUpload = async (items: UploadItem[]) => {
    if (!assetPort?.saveImageBlob) return;

    for (const item of items) {
      if (item.status !== 'pending') continue;

      setUploadItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'uploading' } : i)));

      try {
        const result = await assetPort.saveImageBlob(item.file, item.filename);
        setUploadItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'done', relativePath: result.relativePath } : i)));
      } catch (error) {
        setUploadItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: 'error' } : i)));
      }
    }

    setTimeout(() => {
      const allDone = items.every((i) => i.status === 'done' || i.status === 'error');
      if (allDone && items.some((i) => i.status === 'done')) {
        // Reload assets and switch to library tab
        assetPort.listAssets().then((list) => {
          setAssets(list.map((a) => ({
            id: a.relativePath,
            type: 'image' as const,
            name: a.name,
            relativePath: a.relativePath,
            size: a.sizeBytes,
            uploadedAt: a.uploadedAt,
            source: 'local' as const,
          })));
          setUploadItems([]);
          setActiveTab('library');
        });
      }
    }, 900);
  };

  const handleDeleteAsset = async (relativePath: string) => {
    if (!assetPort?.deleteAsset) return;
    try {
      await assetPort.deleteAsset(relativePath);
      setAssets((prev) => prev.filter((a) => a.relativePath !== relativePath));
      setSelectedAsset(null);
    } catch (error) {
      console.error('Failed to delete asset:', error);
    }
  };

  const handleConfirm = () => {
    if (selectedAsset) {
      onSelect(selectedAsset.relativePath);
      onOpenChange(false);
      setSelectedAsset(null);
    }
  };

  if (!assetPort) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[720px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Thư viện Media</DialogTitle>
          <DialogClose />
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="flex-1 flex flex-col">
          <TabsList>
            <TabsTrigger value="current">Trong layout{usedAssetPaths && usedAssetPaths.length > 0 ? ` (${usedAssetPaths.length})` : ''}</TabsTrigger>
            <TabsTrigger value="library">Toàn bộ</TabsTrigger>
            <TabsTrigger value="upload">Tải lên</TabsTrigger>
            <TabsTrigger value="url">URL</TabsTrigger>
          </TabsList>

          <TabsContent value="current" className="flex-1 flex flex-col overflow-y-auto">
            <div className="px-4 pb-2 text-[10px] text-[#9a9bab]">
              Xoá ảnh ở đây xoá khỏi TOÀN BỘ thư viện, có thể ảnh hưởng layout khác dùng chung ảnh này.
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {!usedAssetPaths || usedAssetPaths.length === 0 ? (
                <div className="text-center text-sm text-[#9a9bab] py-8">
                  Layout này chưa dùng ảnh nào
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {assets
                    .filter(a => usedAssetSet.has(a.relativePath))
                    .map((asset) => (
                      <div key={asset.id} className="relative group rounded-lg overflow-hidden border border-[#e6e6ee] hover:border-[#4b57e6] transition-colors">
                        <img src={asset.relativePath} alt={asset.name} className="w-full aspect-square object-cover" />
                        <button
                          onClick={() => handleDeleteAsset(asset.relativePath)}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={14} />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedAsset(asset);
                            onSelect(asset.relativePath);
                            onOpenChange(false);
                          }}
                          className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors"
                        />
                      </div>
                    ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="library" className="flex-1 flex flex-col overflow-y-auto">
            <div className="p-4 border-b border-[#f0f0f5] space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 size-4 text-[#9a9bab]" />
                <input
                  type="text"
                  placeholder="Tìm ảnh..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 rounded-[7px] border border-[#e6e6ee] bg-[#fcfcfd] text-sm"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                {(['all', 'image', 'video', 'font', 'file'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setTypeFilter(type)}
                    className={cn(
                      'text-xs font-medium px-3 py-1.5 rounded-[6px] transition-colors',
                      typeFilter === type
                        ? 'bg-[#4b57e6] text-white'
                        : 'bg-[#f0f0f5] text-[#5c5d6e] hover:bg-[#e6e6ee]'
                    )}
                  >
                    {type === 'all' ? 'Tất cả' : type === 'image' ? 'Ảnh' : type === 'video' ? 'Video' : type === 'font' ? 'Font' : 'File'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {filteredAssets.length === 0 ? (
                <div className="flex items-center justify-center h-full text-center text-[#9a9bab]">
                  Không có ảnh trong thư viện
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {filteredAssets.map((asset) => (
                    <div key={asset.relativePath} className="relative group">
                      <div
                        onClick={() => setSelectedAsset(asset)}
                        className={cn(
                          'w-full aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all',
                          selectedAsset?.relativePath === asset.relativePath
                            ? 'border-[#4b57e6] bg-[#4b57e6]/5'
                            : 'border-[#e6e6ee] hover:border-[#4b57e6]/50'
                        )}
                      >
                        <img
                          src={asset.relativePath}
                          alt={asset.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23e6e6ee"/%3E%3C/svg%3E';
                          }}
                        />
                      </div>
                      {selectedAsset?.relativePath === asset.relativePath && (
                        <div className="absolute top-2 right-2 w-5 h-5 bg-[#4b57e6] rounded-full flex items-center justify-center">
                          <CheckCircle2 size={16} className="text-white" />
                        </div>
                      )}
                      <button
                        onClick={() => handleDeleteAsset(asset.relativePath)}
                        className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-white rounded hover:bg-red-50"
                      >
                        <Trash2 size={14} className="text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="upload" className="flex-1 flex flex-col">
            <div className="flex-1 flex flex-col">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  'flex flex-col items-center justify-center p-8 rounded-lg border-2 border-dashed transition-colors m-4 mb-2',
                  isDragOver ? 'border-[#4b57e6] bg-[#4b57e6]/5' : 'border-[#cfd0da]'
                )}
              >
                <CloudUpload size={48} className="text-[#9a9bab] mb-2" />
                <p className="text-sm text-[#5c5d6e] mb-2">Kéo-thả ảnh vào đây, hoặc</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-sm font-semibold text-[#4b57e6] hover:text-[#3a42c9] underline"
                >
                  Chọn file
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </div>

              {uploadItems.length > 0 && (
                <div className="flex-1 overflow-y-auto px-4">
                  <div className="space-y-2">
                    {uploadItems.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg bg-[#f4f5f9]">
                        {item.preview && (
                          <img
                            src={item.preview}
                            alt={item.filename}
                            className="w-10 h-10 rounded object-cover flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#5c5d6e] truncate">{item.filename}</p>
                          {item.status === 'uploading' && (
                            <div className="h-1 bg-[#e6e6ee] rounded-full mt-1 overflow-hidden">
                              <div className="h-full bg-[#4b57e6] animate-pulse w-1/2" />
                            </div>
                          )}
                        </div>
                        <div className="flex-shrink-0">
                          {item.status === 'uploading' && <Loader2 size={16} className="text-[#4b57e6] animate-spin" />}
                          {item.status === 'done' && <CheckCircle2 size={16} className="text-green-500" />}
                          {item.status === 'error' && <XCircle size={16} className="text-red-500" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="url" className="flex-1 flex flex-col p-6">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold block mb-2">Dán URL ảnh</label>
                <input
                  type="url"
                  placeholder="https://example.com/image.jpg"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
                  className="w-full px-3 py-2 border border-[#e6e6ee] rounded-lg bg-[#fcfcfd] text-sm focus:outline-none focus:border-[#4b57e6]"
                />
              </div>
              <div className="text-xs text-[#9a9bab]">
                Hỗ trợ: JPEG, PNG, SVG, GIF, WebP. Ảnh sẽ được TẢI VỀ VÀ LƯU LOCAL ngay (cần mạng lúc thêm, không cần mạng lúc trình chiếu ceremony).
              </div>
              <button
                onClick={handleAddUrl}
                disabled={!urlInput.trim() || isAddingUrl}
                className="w-full px-4 py-2 bg-[#4b57e6] text-white rounded-lg hover:bg-[#3d47cc] disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
              >
                {isAddingUrl ? 'Đang tải về...' : 'Tải về & Thêm vào thư viện'}
              </button>
              {urlError && <div className="text-xs text-red-500">{urlError}</div>}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <div className="flex-1 text-sm text-[#9a9bab]">
            {activeTab === 'library' && (
              selectedAsset ? `Đã chọn: ${selectedAsset.name}` : 'Chưa chọn ảnh'
            )}
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 text-sm font-medium text-[#5c5d6e] hover:bg-[#f4f5f9] rounded-[7px]"
          >
            Huỷ
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedAsset}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-[7px] transition-colors',
              selectedAsset
                ? 'bg-[#4b57e6] text-white hover:bg-[#3a42c9]'
                : 'bg-[#e6e6ee] text-[#9a9bab] cursor-not-allowed'
            )}
          >
            Chọn
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
