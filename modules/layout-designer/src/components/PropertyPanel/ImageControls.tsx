import { useState } from 'react';
import type { LayoutItem } from '@sky-app/slide-shared';
import { useResolvedAssetUrl } from '../../hooks/useResolvedAssetUrl.js';
import { Section } from './CommonControls.js';
import { ShadowControl } from './ShadowControl.js';
import { cn } from '@sky-app/ui';

export interface ImageControlsProps {
  item: Extract<LayoutItem, { type: 'image' }>;
  patch: (p: Partial<LayoutItem>) => void;
  pickAndSaveImage?: () => Promise<{ relativePath: string } | null>;
  resolveAssetUrl?: (path: string) => Promise<string>;
}

export function ImageControls({
  item,
  patch,
  pickAndSaveImage,
  resolveAssetUrl,
}: ImageControlsProps) {
  const previewUrl = useResolvedAssetUrl(item.src, resolveAssetUrl);
  const [picking, setPicking] = useState(false);

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

  const btnClass = (active: boolean) =>
    cn(
      'flex-1 py-[6px] rounded-lg border text-[10px] font-semibold cursor-pointer transition-colors duration-100',
      active ? 'border-[#4b57e6] bg-[#4b57e6]/10 text-[#4b57e6]' : 'border-[#e6e6ee] bg-[#fcfcfd] text-[#5c5d6e] hover:bg-neutral-50'
    );

  return (
    <>
      {pickAndSaveImage && (
        <Section title="Nguồn ảnh">
          <div className="flex gap-[10px] items-center">
            {previewUrl ? (
              <img src={previewUrl} alt="" className="w-[44px] h-[44px] rounded-lg object-cover border border-[#e6e6ee]" />
            ) : (
              <div className="w-[44px] h-[44px] rounded-lg border border-dashed border-[#cfd0da] flex items-center justify-center text-[9px] text-[#9a9bab]">
                ẢNH
              </div>
            )}
            <button
              onClick={handlePickImage}
              disabled={picking}
              className={cn(
                'flex-1 py-2 border-none rounded-lg font-bold text-[11.5px]',
                picking ? 'bg-[#c9c9d3] text-white cursor-default' : 'bg-[#4b57e6] text-white cursor-pointer hover:bg-[#3b47d6]'
              )}
            >
              {picking ? 'Đang chọn…' : 'Đổi ảnh'}
            </button>
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
            <button key={opt.value} onClick={() => patch({ fit: opt.value })} className={btnClass((item.fit ?? 'cover') === opt.value)}>
              {opt.label}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Hình dạng & viền">
        <div className="flex gap-2 items-center mb-2">
          {(['rect', 'round', 'circle'] as const).map((s) => (
            <button
              key={s}
              onClick={() => patch({ shape: s })}
              className={cn(
                'w-[30px] h-[30px] rounded-[7px] border flex items-center justify-center cursor-pointer',
                item.shape === s ? 'border-[#4b57e6] bg-[#4b57e6]/10 text-[#4b57e6]' : 'border-[#e6e6ee] bg-[#fcfcfd] text-[#5c5d6e]'
              )}
            >
              {s === 'circle' ? '●' : '▢'}
            </button>
          ))}
          <span className="text-[11.5px] ml-1.5">Viền</span>
          <input type="range" min={0} max={16} value={item.borderW ?? 0} onChange={(e) => patch({ borderW: Number(e.target.value) })} className="flex-1" />
        </div>
        {(item.borderW ?? 0) > 0 && <input type="color" value={item.borderColor ?? '#000000'} onChange={(e) => patch({ borderColor: e.target.value })} className="w-10 h-8 p-0 border-none rounded cursor-pointer" />}
      </Section>
      <Section title="Bộ lọc">
        <div className="flex gap-2">
          {(['none', 'bright', 'gray', 'warm'] as const).map((f) => (
            <button
              key={f}
              onClick={() => patch({ filter: f })}
              className={cn(
                'text-[10.5px] p-[4px_8px] rounded-md border cursor-pointer',
                item.filter === f ? 'border-[#4b57e6] bg-[#4b57e6]/10 text-[#4b57e6]' : 'border-[#e6e6ee] bg-[#fcfcfd] text-[#5c5d6e]'
              )}
            >
              {f}
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
