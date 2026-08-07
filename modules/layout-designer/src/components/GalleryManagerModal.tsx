import { useState, useRef } from 'react';
import { X, Trash2, Edit2 } from 'lucide-react';
import type { GalleryImageEntry } from '@sky-app/slide-shared';
import { Dialog, DialogContent, DialogTitle, Tabs, TabsList, TabsTrigger, TabsContent } from '@sky-app/ui';
import { cn } from '@sky-app/ui';

export interface GalleryManagerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: GalleryImageEntry[];
  onImagesChange: (images: GalleryImageEntry[]) => void;
  showCaption: boolean;
  onOpenMediaLibrary: (onSelect: (relativePath: string) => void) => void;
}

export function GalleryManagerModal({
  open,
  onOpenChange,
  images,
  onImagesChange,
  showCaption,
  onOpenMediaLibrary,
}: GalleryManagerModalProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const handleAddImage = () => {
    onOpenMediaLibrary((relativePath) => {
      const newEntry: GalleryImageEntry = {
        id: Math.random().toString(36).slice(2),
        src: relativePath,
      };
      onImagesChange([...images, newEntry]);
    });
  };

  const handleRemoveImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    onImagesChange(newImages);
    if (selectedIndex === index) {
      setSelectedIndex(index > 0 ? index - 1 : newImages.length > 0 ? 0 : null);
    } else if (selectedIndex !== null && selectedIndex > index) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const handleReplaceImage = () => {
    if (selectedIndex === null) return;
    onOpenMediaLibrary((relativePath) => {
      const newImages = [...images];
      newImages[selectedIndex] = { ...newImages[selectedIndex]!, src: relativePath };
      onImagesChange(newImages);
    });
  };

  const handleUpdateCaption = (text: string) => {
    if (selectedIndex === null) return;
    const newImages = [...images];
    newImages[selectedIndex] = { ...newImages[selectedIndex]!, caption: text };
    onImagesChange(newImages);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === dropZoneRef.current) {
      setHoveredIndex(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    const newImages = [...images];
    const [movedImage] = newImages.splice(draggedIndex, 1);
    newImages.splice(targetIndex, 0, movedImage!);
    onImagesChange(newImages);
    setDraggedIndex(null);
    setHoveredIndex(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[900px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-[#e6e6ee]">
          <DialogTitle className="font-bold text-sm">Quản lý bộ ảnh</DialogTitle>
          <button onClick={() => onOpenChange(false)} className="text-[#9a9bab] hover:text-[#5c5d6e]">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 flex gap-4 overflow-hidden p-4">
          {/* Left: Grid + Add button */}
          <div className="flex-1 flex flex-col min-w-0">
            <button
              onClick={handleAddImage}
              className="mb-3 px-4 py-2 text-sm bg-[#4b57e6] text-white rounded-[7px] hover:bg-[#3d47cc] font-medium"
            >
              Thêm ảnh
            </button>
            <div className="text-xs text-[#9a9bab] mb-2">Kéo để sắp xếp</div>
            <div
              ref={dropZoneRef}
              className="flex-1 overflow-y-auto border border-[#e6e6ee] rounded-lg p-3 bg-[#fcfcfd]"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <div className="grid grid-cols-4 gap-3">
                {images.map((img, idx) => (
                  <div
                    key={img.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setHoveredIndex(idx);
                    }}
                    onDragLeave={() => setHoveredIndex(null)}
                    onDrop={(e) => handleDrop(e, idx)}
                    onClick={() => setSelectedIndex(idx)}
                    className={cn(
                      'relative aspect-square rounded-lg cursor-move border-2 overflow-hidden',
                      selectedIndex === idx ? 'border-[#4b57e6] bg-[#4b57e6]/10' : 'border-[#e6e6ee] hover:border-[#9a9bab]',
                      draggedIndex === idx && 'opacity-50'
                    )}
                  >
                    {img.src ? (
                      <img
                        src={img.src}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-repeating-linear-gradient(45deg,#c9c9d6 0 8px,#e4e4ee 8px 16px) flex items-center justify-center text-xs text-[#9a9bab]">
                        No image
                      </div>
                    )}
                    <div className="absolute top-1 left-1 bg-[#000]/60 text-white text-xs rounded px-1.5 py-0.5">
                      {idx + 1}
                    </div>
                    {selectedIndex === idx && (
                      <div className="absolute top-1 right-1 bg-[#4b57e6] text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                        ✓
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Preview + controls */}
          <div className="w-56 flex flex-col gap-4 border-l border-[#e6e6ee] pl-4">
            {selectedIndex !== null && images[selectedIndex] ? (
              <>
                <div className="aspect-video rounded-lg overflow-hidden border border-[#e6e6ee] bg-[#f4f5f9]">
                  {images[selectedIndex]!.src ? (
                    <img src={images[selectedIndex]!.src} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-repeating-linear-gradient(45deg,#c9c9d6 0 8px,#e4e4ee 8px 16px) flex items-center justify-center text-xs text-[#9a9bab]">
                      No preview
                    </div>
                  )}
                </div>
                <button
                  onClick={handleReplaceImage}
                  className="w-full px-3 py-2 text-sm text-[#4b57e6] border border-[#4b57e6] rounded-[7px] hover:bg-[#4b57e6]/5 font-medium"
                >
                  Đổi ảnh
                </button>
                {showCaption && (
                  <div>
                    <label className="text-xs font-semibold block mb-2 text-[#5c5d6e]">Chú thích</label>
                    <input
                      type="text"
                      value={images[selectedIndex]!.caption ?? ''}
                      onChange={(e) => handleUpdateCaption(e.target.value)}
                      placeholder="Thêm chú thích…"
                      className="w-full px-3 py-2 text-xs border border-[#e6e6ee] rounded-lg focus:outline-none focus:border-[#4b57e6] bg-[#fcfcfd]"
                    />
                  </div>
                )}
                <button
                  onClick={() => handleRemoveImage(selectedIndex)}
                  className="w-full px-3 py-2 text-sm text-red-500 border border-red-200 rounded-[7px] hover:bg-red-50 font-medium mt-auto"
                >
                  Xoá ảnh
                </button>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-[#9a9bab] text-center">
                Chọn 1 ảnh để xem preview
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
