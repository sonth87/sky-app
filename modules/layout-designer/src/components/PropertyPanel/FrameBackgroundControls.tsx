import { useState } from 'react';
import type { Background, LayoutVariant } from '@sky-app/slide-shared';
import { useResolvedAssetUrl } from '../../hooks/useResolvedAssetUrl.js';
import { Section } from './CommonControls.js';
import { GradientEditor } from '../GradientEditor/GradientEditor.js';
import { cn } from '../../lib/cn.js';

export interface FrameBackgroundControlsProps {
  variant: LayoutVariant;
  onChange: (background: Background | undefined) => void;
  pickAndSaveImage?: () => Promise<{ relativePath: string } | null>;
  resolveAssetUrl?: (path: string) => Promise<string>;
  width?: number;
}

export function FrameBackgroundControls({
  variant,
  onChange,
  pickAndSaveImage,
  resolveAssetUrl,
  width = 302,
}: FrameBackgroundControlsProps) {
  const background = variant.background;
  const kind = background?.kind ?? 'none';
  const previewUrl = useResolvedAssetUrl(background?.kind === 'image' ? background.src : undefined, resolveAssetUrl);
  const [picking, setPicking] = useState(false);

  async function handlePickImage() {
    if (!pickAndSaveImage) return;
    setPicking(true);
    try {
      const result = await pickAndSaveImage();
      if (result) onChange({ kind: 'image', src: result.relativePath });
    } finally {
      setPicking(false);
    }
  }

  return (
    <div className="shrink-0 border-l border-[#e6e6ee] bg-white flex flex-col overflow-y-auto" style={{ width }}>
      <div className="p-[13px_15px] border-b border-[#e6e6ee]">
        <span className="font-bold text-[13px]">{variant.aspect.label ?? `${variant.aspect.w}:${variant.aspect.h}`} — Canvas</span>
        <div className="text-[11px] text-[#9a9bab] mt-[3px]">Không có phần tử nào đang chọn — chỉnh nền chung cho toàn bộ tỷ lệ này.</div>
      </div>
      <Section title="Kiểu nền">
        <div className="flex gap-[6px]">
          {(
            [
              { value: 'none', label: 'Không có' },
              { value: 'color', label: 'Màu' },
              { value: 'gradient', label: 'Gradient' },
              { value: 'image', label: 'Ảnh' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                if (opt.value === 'none') onChange(undefined);
                else if (opt.value === 'color') onChange({ kind: 'color', color: background?.kind === 'color' ? background.color : '#201748' });
                else if (opt.value === 'gradient') onChange({ kind: 'gradient', gradient: background?.kind === 'gradient' ? background.gradient : 'linear-gradient(135deg, #201748, #4b57e6)' });
                else onChange({ kind: 'image', src: background?.kind === 'image' ? background.src : undefined });
              }}
              className={cn(
                'flex-1 py-[6px] rounded-[7px] text-[10.5px] border cursor-pointer font-medium',
                kind === opt.value ? 'border-[#4b57e6] bg-[#4b57e6]/10 text-[#4b57e6]' : 'border-[#e6e6ee] bg-[#fcfcfd] text-[#5c5d6e]'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Section>
      {kind === 'color' && (
        <Section title="Màu nền">
          <input
            type="color"
            value={background?.kind === 'color' ? background.color : '#201748'}
            onChange={(e) => onChange({ kind: 'color', color: e.target.value })}
            className="w-10 h-8 p-0 border-none rounded cursor-pointer"
          />
        </Section>
      )}
      {kind === 'gradient' && (
        <Section title="Gradient">
          <GradientEditor
            value={(background?.kind === 'gradient' ? background.gradient : undefined) ?? 'linear-gradient(135deg, #201748, #4b57e6)'}
            onChange={(gradient) => onChange({ kind: 'gradient', gradient })}
          />
        </Section>
      )}
      {kind === 'image' && pickAndSaveImage && (
        <Section title="Ảnh nền">
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
    </div>
  );
}
