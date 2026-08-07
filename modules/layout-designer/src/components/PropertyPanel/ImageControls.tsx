import { useState } from 'react';
import type { LayoutItem } from '@sky-app/slide-shared';
import type { AssetPort } from '@sky-app/service-contracts';
import { Square, Circle } from 'lucide-react';
import { useResolvedAssetUrl } from '../../hooks/useResolvedAssetUrl.js';
import { Section, CollapsibleSection } from './CommonControls.js';
import { IconToggleGroup, ColorfulSwatchButton } from '@sky-app/ui';
import { ShadowControl } from './ShadowControl.js';
import { MediaLibraryModal } from '../MediaLibraryModal.js';
import { cn } from '@sky-app/ui';

export interface ImageControlsProps {
  item: Extract<LayoutItem, { type: 'image' }>;
  patch: (p: Partial<LayoutItem>) => void;
  pickAndSaveImage?: () => Promise<{ relativePath: string } | null>;
  resolveAssetUrl?: (path: string) => Promise<string>;
  assetPort?: AssetPort;
  usedAssetPaths?: string[];
}

export function ImageControls({
  item,
  patch,
  pickAndSaveImage,
  resolveAssetUrl,
  assetPort,
  usedAssetPaths,
}: ImageControlsProps) {
  const previewUrl = useResolvedAssetUrl(item.src, resolveAssetUrl);
  const [picking, setPicking] = useState(false);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);

  async function handlePickImage() {
    if (!pickAndSaveImage) return;
    setPicking(true);
    try {
      const result = await pickAndSaveImage();
      if (result) patch({ src: result.relativePath });
    } finally {
      setPicking(false);
    }
  }

  return (
    <>
      <MediaLibraryModal
        open={mediaLibraryOpen}
        onOpenChange={setMediaLibraryOpen}
        assetPort={assetPort}
        usedAssetPaths={usedAssetPaths}
        initialTab="library"
        onSelect={(relativePath) => patch({ src: relativePath })}
      />
      {(pickAndSaveImage || assetPort) && (
        <Section title="Nguồn ảnh">
          <div className="flex gap-[10px] items-center">
            {previewUrl ? (
              <img src={previewUrl} alt="" className="w-[44px] h-[44px] rounded-lg object-cover border border-[#e6e6ee]" />
            ) : (
              <div className="w-[44px] h-[44px] rounded-lg border border-dashed border-[#cfd0da] flex items-center justify-center text-[9px] text-[#9a9bab]">
                ẢNH
              </div>
            )}
            <div className="flex-1 flex gap-2">
              {pickAndSaveImage && (
                <button
                  onClick={handlePickImage}
                  disabled={picking}
                  className={cn(
                    'flex-1 py-2 border-none rounded-lg font-bold text-[11.5px]',
                    picking ? 'bg-[#c9c9d3] text-white cursor-default' : 'bg-[#4b57e6] text-white cursor-pointer hover:bg-[#3b47d6]'
                  )}
                >
                  {picking ? 'Đang chọn…' : 'Tải ảnh mới'}
                </button>
              )}
              {assetPort && (
                <button
                  onClick={() => setMediaLibraryOpen(true)}
                  className="flex-1 py-2 border border-[#4b57e6] rounded-lg font-bold text-[11.5px] bg-white text-[#4b57e6] cursor-pointer hover:bg-[#4b57e6]/5"
                >
                  Thư viện
                </button>
              )}
            </div>
          </div>
        </Section>
      )}
      <Section title="Bind theo biến ảnh">
        <input
          type="text"
          value={item.varKey ?? ''}
          onChange={(e) => patch({ varKey: e.target.value || undefined })}
          placeholder="VD: anh_dai_dien (bỏ trống = dùng ảnh tĩnh trên)"
          className="w-full border border-[#e6e6ee] rounded-[7px] p-[6px_8px] text-[11.5px]"
        />
      </Section>
      <Section title="Chữ thay thế khi không có ảnh">
        <input
          type="text"
          value={item.fallbackText ?? ''}
          onChange={(e) => patch({ fallbackText: e.target.value || undefined })}
          placeholder="Mặc định: tên biến hoặc 'ẢNH'"
          className="w-full border border-[#e6e6ee] rounded-[7px] p-[6px_8px] text-[11.5px]"
        />
      </Section>
      <Section title="Cách lấp đầy khung">
        <div className="flex gap-[7px]">
          {(
            [
              { value: 'cover', label: 'Lấp đầy (cắt bớt)' },
              { value: 'contain', label: 'Vừa khung (giữ nguyên)' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              onClick={() => patch({ fit: opt.value })}
              className={cn(
                'flex-1 py-[6px] rounded-lg border text-[10px] font-semibold cursor-pointer transition-colors duration-100',
                (item.fit ?? 'cover') === opt.value
                  ? 'border-[#4b57e6] bg-[#4b57e6]/10 text-[#4b57e6]'
                  : 'border-[#e6e6ee] bg-[#fcfcfd] text-[#5c5d6e] hover:bg-neutral-50'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Hình dạng">
        <div className="flex gap-[7px]">
          {(
            [
              { value: 'rect' as const, icon: Square, title: 'Vuông', className: '' },
              {
                value: 'round' as const,
                icon: Square,
                title: 'Vuông tròn',
                className: 'rounded-md',
              },
              { value: 'circle' as const, icon: Circle, title: 'Tròn', className: '' },
            ] as const
          ).map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                onClick={() => patch({ shape: opt.value })}
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-[7px] border cursor-pointer transition-colors',
                  item.shape === opt.value ? 'border-[#4b57e6] bg-[#4b57e6]/10 text-[#4b57e6]' : 'border-[#e6e6ee] bg-[#fcfcfd] text-[#5c5d6e] hover:bg-[#f4f5f9]'
                )}
                title={opt.title}
              >
                <Icon size={15} className={opt.className || undefined} />
              </button>
            );
          })}
        </div>
      </Section>
      <CollapsibleSection title="Viền" defaultOpen={true}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11.5px] flex-shrink-0">Độ dày</span>
          <input type="range" min={0} max={16} value={item.borderW ?? 0} onChange={(e) => patch({ borderW: Number(e.target.value) })} className="flex-1" />
        </div>
        {(item.borderW ?? 0) > 0 && (
          <ColorfulSwatchButton
            color={item.borderColor ?? '#000000'}
            onChange={(borderColor) => patch({ borderColor })}
            title="Màu viền"
          />
        )}
      </CollapsibleSection>
      <Section title="Bộ lọc">
        <div className="grid grid-cols-4 gap-2">
          {(
            [
              { value: 'none' as const, label: 'Gốc', filter: 'none' },
              { value: 'bright' as const, label: 'Sáng', filter: 'brightness(1.3)' },
              { value: 'gray' as const, label: 'Đen trắng', filter: 'grayscale(1)' },
              { value: 'warm' as const, label: 'Ấm', filter: 'sepia(0.4) saturate(1.3)' },
            ] as const
          ).map((f) => (
            <button
              key={f.value}
              onClick={() => patch({ filter: f.value })}
              className={cn(
                'flex flex-col items-center gap-1 p-1 rounded-[7px] border cursor-pointer transition-colors',
                item.filter === f.value ? 'border-[#4b57e6] bg-[#4b57e6]/10' : 'border-[#e6e6ee] bg-[#fcfcfd] hover:bg-[#f4f5f9]'
              )}
            >
              <div
                className="w-8 h-8 rounded border border-[#d4d4dd]"
                style={{
                  backgroundImage: previewUrl ? `url(${previewUrl})` : undefined,
                  backgroundColor: !previewUrl ? '#e6e6ee' : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  filter: f.filter === 'none' ? undefined : f.filter,
                }}
              />
              <span className={cn('text-[9px] font-medium', item.filter === f.value ? 'text-[#4b57e6]' : 'text-[#5c5d6e]')}>{f.label}</span>
            </button>
          ))}
        </div>
      </Section>
      {(item.fit ?? 'cover') === 'cover' && (
        <Section title="Neo điểm crop">
          <div className="space-y-2">
            <div className="flex items-center gap-[10px]">
              <label className="text-[11px] w-8">X</label>
              <input
                type="range"
                min={0}
                max={100}
                value={(item.focalX ?? 0.5) * 100}
                onChange={(e) => patch({ focalX: Number(e.target.value) / 100 })}
                className="flex-1"
              />
              <span className="text-[11px] w-[34px] text-right">{Math.round((item.focalX ?? 0.5) * 100)}%</span>
            </div>
            <div className="flex items-center gap-[10px]">
              <label className="text-[11px] w-8">Y</label>
              <input
                type="range"
                min={0}
                max={100}
                value={(item.focalY ?? 0.5) * 100}
                onChange={(e) => patch({ focalY: Number(e.target.value) / 100 })}
                className="flex-1"
              />
              <span className="text-[11px] w-[34px] text-right">{Math.round((item.focalY ?? 0.5) * 100)}%</span>
            </div>
          </div>
        </Section>
      )}
      <ShadowControl value={item.shadow} onChange={(shadow) => patch({ shadow })} />
    </>
  );
}
