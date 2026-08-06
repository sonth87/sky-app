import { useState } from 'react';
import type { Background, LayoutVariant } from '@sky-app/slide-shared';
import type { AssetPort } from '@sky-app/service-contracts';
import { Ban, Palette, Sparkles, Image as ImageIcon } from 'lucide-react';
import { useResolvedAssetUrl } from '../../hooks/useResolvedAssetUrl.js';
import { Section } from './CommonControls.js';
import { GradientEditor } from '../GradientEditor/GradientEditor.js';
import { IconToggleGroup, ColorfulSwatchButton, cn } from '@sky-app/ui';
import { MediaLibraryModal } from '../MediaLibraryModal.js';

export interface FrameBackgroundControlsProps {
  variant: LayoutVariant;
  onChange: (background: Background | undefined) => void;
  pickAndSaveImage?: () => Promise<{ relativePath: string } | null>;
  resolveAssetUrl?: (path: string) => Promise<string>;
  assetPort?: AssetPort;
  width?: number;
}

export function FrameBackgroundControls({
  variant,
  onChange,
  pickAndSaveImage,
  resolveAssetUrl,
  assetPort,
  width = 302,
}: FrameBackgroundControlsProps) {
  const background = variant.background;
  const kind = background?.kind ?? 'none';
  const previewUrl = useResolvedAssetUrl(background?.kind === 'image' ? background.src : undefined, resolveAssetUrl);
  const [picking, setPicking] = useState(false);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);

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
      <MediaLibraryModal
        open={mediaLibraryOpen}
        onOpenChange={setMediaLibraryOpen}
        assetPort={assetPort}
        onSelect={(relativePath) => onChange({ kind: 'image', src: relativePath })}
      />
      <div className="p-[13px_15px] border-b border-[#e6e6ee]">
        <span className="font-bold text-[13px]">{variant.aspect.label ?? `${variant.aspect.w}:${variant.aspect.h}`} — Canvas</span>
        <div className="text-[11px] text-[#9a9bab] mt-[3px]">Không có phần tử nào đang chọn — chỉnh nền chung cho toàn bộ tỷ lệ này.</div>
      </div>
      <Section title="Kiểu nền">
        <IconToggleGroup
          options={[
            { value: 'none' as const, icon: Ban, title: 'Không có', label: 'Không có' },
            { value: 'color' as const, icon: Palette, title: 'Màu', label: 'Màu' },
            { value: 'gradient' as const, icon: Sparkles, title: 'Gradient', label: 'Gradient' },
            { value: 'image' as const, icon: ImageIcon, title: 'Ảnh', label: 'Ảnh' },
          ]}
          value={kind}
          onChange={(value) => {
            if (value === 'none') onChange(undefined);
            else if (value === 'color') onChange({ kind: 'color', color: background?.kind === 'color' ? background.color : '#201748' });
            else if (value === 'gradient') onChange({ kind: 'gradient', gradient: background?.kind === 'gradient' ? background.gradient : 'linear-gradient(135deg, #201748, #4b57e6)' });
            else onChange({ kind: 'image', src: background?.kind === 'image' ? background.src : undefined });
          }}
        />
      </Section>
      {kind === 'color' && (
        <Section title="Màu nền">
          <ColorfulSwatchButton
            color={background?.kind === 'color' ? background.color : '#201748'}
            onChange={(color) => onChange({ kind: 'color', color })}
            title="Màu nền"
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
      {kind === 'image' && (pickAndSaveImage || assetPort) && (
        <Section title="Ảnh nền">
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
    </div>
  );
}
