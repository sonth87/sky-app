import { useEffect, useRef, useState } from 'react';
import { Search, Trash2, CheckCircle2, XCircle, Loader2, CloudUpload, Ban, Palette, Sparkles, Image as ImageIcon } from 'lucide-react';
import type { AssetMeta } from '@sky-app/service-contracts';
import type { AssetPort } from '@sky-app/service-contracts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogFooter, Tabs, TabsList, TabsTrigger, TabsContent, cn } from '@sky-app/ui';

export interface MediaLibraryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetPort?: AssetPort;
  onSelect: (relativePath: string) => void;
}

interface UploadItem {
  id: string;
  file: Blob;
  filename: string;
  preview: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  relativePath?: string;
}

export function MediaLibraryModal({ open, onOpenChange, assetPort, onSelect }: MediaLibraryModalProps) {
  const [assets, setAssets] = useState<AssetMeta[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<AssetMeta | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('library');
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredAssets = assets.filter((a) => a.name.toLowerCase().includes(searchQuery.toLowerCase()));

  useEffect(() => {
    if (!open || !assetPort) return;
    assetPort.listAssets().then((list) => {
      setAssets(list);
      setSelectedAsset(null);
      setActiveTab(list.length > 0 ? 'library' : 'upload');
    });
  }, [open, assetPort]);

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
          setAssets(list);
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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList>
            <TabsTrigger value="library">Thư viện</TabsTrigger>
            <TabsTrigger value="upload">Tải lên</TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="flex-1 flex flex-col overflow-y-auto">
            <div className="p-4 border-b border-[#f0f0f5]">
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
