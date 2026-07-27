import { useState } from 'react';
import type { Background, LayoutVariant } from '@sky-app/slide-shared';
import { useResolvedAssetUrl } from '../../hooks/useResolvedAssetUrl.js';
import { pickerBtnStyle, Section } from './CommonControls.js';
import { GradientEditor } from '../GradientEditor/GradientEditor.js';

export interface FrameBackgroundControlsProps {
  variant: LayoutVariant;
  onChange: (background: Background | undefined) => void;
  pickAndSaveImage?: () => Promise<{ relativePath: string } | null>;
  resolveAssetUrl?: (path: string) => Promise<string>;
  width?: number;
}

/**
 * Thuộc tính của CHÍNH Frame/Canvas (khi không có item nào đang chọn) — chọn kiểu nền: Không có
 * (mặc định trắng — xem Canvas.tsx đổi 2026-07-18, TRƯỚC ĐÓ mặc định tím `#201748`)/Màu/Gradient/
 * Ảnh. `video`/`effect` CHƯA làm (hoãn — cần đổi cả LayoutRenderer runtime, xem plan Giai đoạn 2.6
 * review "Property panel canvas" — chỉ làm color/gradient/image trước theo quyết định 2026-07-18).
 */
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
    <div style={{ width, flex: 'none', borderLeft: '1px solid #e6e6ee', background: '#fff', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <div style={{ padding: '13px 15px', borderBottom: '1px solid #e6e6ee' }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{variant.aspect.label ?? `${variant.aspect.w}:${variant.aspect.h}`} — Canvas</span>
        <div style={{ fontSize: 11, color: '#9a9bab', marginTop: 3 }}>Không có phần tử nào đang chọn — chỉnh nền chung cho toàn bộ tỷ lệ này.</div>
      </div>
      <Section title="Kiểu nền">
        <div style={{ display: 'flex', gap: 6 }}>
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
              style={pickerBtnStyle(kind === opt.value, { flex: 1, padding: '6px 0', borderRadius: 7, fontSize: 10.5 })}
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
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {previewUrl ? (
              <img src={previewUrl} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', border: '1px solid #e6e6ee' }} />
            ) : (
              <div style={{ width: 44, height: 44, borderRadius: 8, border: '1px dashed #cfd0da', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#9a9bab' }}>
                ẢNH
              </div>
            )}
            <button
              onClick={handlePickImage}
              disabled={picking}
              style={{
                flex: 1,
                padding: '8px 0',
                background: picking ? '#c9c9d3' : 'var(--accent-color, #4b57e6)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 11.5,
                cursor: picking ? 'default' : 'pointer',
              }}
            >
              {picking ? 'Đang chọn…' : 'Đổi ảnh'}
            </button>
          </div>
        </Section>
      )}
    </div>
  );
}
