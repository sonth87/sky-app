import { useState } from 'react';
import type { LayoutItem } from '@sky-app/slide-shared';
import { useResolvedAssetUrl } from '../../hooks/useResolvedAssetUrl.js';
import { pickerBtnStyle, Section } from './CommonControls.js';

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

  return (
    <>
      {pickAndSaveImage && (
        <Section title="Nguồn ảnh">
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
      {/* varKey (Bước 5 kế hoạch) — QUAN TRỌNG NHẤT của ImageItem: bind ảnh theo biến để 1 layout
          dùng chung cho N người, mỗi người ảnh khác nhau. Ưu tiên hơn src khi có record thật (xem
          LayoutRenderer/resolveTokens ở runtime) — src ở trên chỉ dùng khi KHÔNG bind biến. */}
      <Section title="Bind theo biến ảnh">
        <input
          type="text"
          value={item.varKey ?? ''}
          onChange={(e) => patch({ varKey: e.target.value || undefined })}
          placeholder="VD: anh_dai_dien (bỏ trống = dùng ảnh tĩnh trên)"
          style={{ width: '100%', border: '1px solid #e6e6ee', borderRadius: 7, padding: '6px 8px', fontSize: 11.5 }}
        />
      </Section>
      <Section title="Chữ thay thế khi không có ảnh">
        <input
          type="text"
          value={item.fallbackText ?? ''}
          onChange={(e) => patch({ fallbackText: e.target.value || undefined })}
          placeholder="Mặc định: tên biến hoặc 'ẢNH'"
          style={{ width: '100%', border: '1px solid #e6e6ee', borderRadius: 7, padding: '6px 8px', fontSize: 11.5 }}
        />
      </Section>
      <Section title="Cách lấp đầy khung">
        <div style={{ display: 'flex', gap: 7 }}>
          {(
            [
              { value: 'cover', label: 'Lấp đầy (cắt bớt)' },
              { value: 'contain', label: 'Vừa khung (giữ nguyên)' },
            ] as const
          ).map((opt) => (
            <button key={opt.value} onClick={() => patch({ fit: opt.value })} style={pickerBtnStyle((item.fit ?? 'cover') === opt.value, { flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 10 })}>
              {opt.label}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Hình dạng & viền">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          {(['rect', 'round', 'circle'] as const).map((s) => (
            <button
              key={s}
              onClick={() => patch({ shape: s })}
              style={pickerBtnStyle(item.shape === s, { width: 30, height: 30, borderRadius: 7 })}
            >
              {s === 'circle' ? '●' : '▢'}
            </button>
          ))}
          <span style={{ fontSize: 11.5, marginLeft: 6 }}>Viền</span>
          <input type="range" min={0} max={16} value={item.borderW ?? 0} onChange={(e) => patch({ borderW: Number(e.target.value) })} style={{ flex: 1 }} />
        </div>
        {(item.borderW ?? 0) > 0 && <input type="color" value={item.borderColor ?? '#000000'} onChange={(e) => patch({ borderColor: e.target.value })} />}
      </Section>
      <Section title="Bộ lọc">
        <div style={{ display: 'flex', gap: 8 }}>
          {(['none', 'bright', 'gray', 'warm'] as const).map((f) => (
            <button key={f} onClick={() => patch({ filter: f })} style={pickerBtnStyle(item.filter === f, { fontSize: 10.5, padding: '4px 8px', borderRadius: 6 })}>
              {f}
            </button>
          ))}
        </div>
      </Section>
    </>
  );
}
