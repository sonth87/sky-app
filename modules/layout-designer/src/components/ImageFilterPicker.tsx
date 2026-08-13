// ImageFilterPicker — lưới chọn filter đầy đủ (39+ preset, IMAGE_FILTERS ở @sky-app/slide-shared)
// — port từ my-builder (packages/builder-editor/src/panels/ImageFilterPicker.tsx). Dùng CHUNG ở
// CẢ ItemToolbar (popover nổi trên canvas) LẪN ImageControls (PropertyPanel bên phải), giống cách
// my-builder dùng chung 1 component cho ContextualToolbar + PropertyPanel (xem docblock gốc).
import type { CSSProperties } from 'react';
import { IMAGE_FILTERS, buildCssFilter, collectSvgFilterDefs, type ImageFilter } from '@sky-app/slide-shared';
import { cn } from '@sky-app/ui';

const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='60'%3E%3Crect width='80' height='60' fill='%23a0b4c0'/%3E%3Cpolygon points='40,8 15,52 65,52' fill='%2356a085'/%3E%3Cellipse cx='60' cy='18' rx='10' ry='9' fill='%23e8d5a3'/%3E%3Crect x='0' y='46' width='80' height='14' fill='%2382a87a'/%3E%3C/svg%3E";

/** SVG ẩn chứa toàn bộ <filter> def (3D/Ink) — chèn 1 lần khi picker mount, để `url(#id)` resolve
 * được trong swatch preview. Trùng id với renderer/ItemContent's bản chèn khác không sao (trình
 * duyệt lấy def đầu tiên khớp). */
function ImageFilterDefs() {
  const defs = collectSvgFilterDefs();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: `<defs>${defs}</defs>` }}
    />
  );
}

function FilterSwatch({
  filter,
  selected,
  previewSrc,
  onClick,
}: {
  filter: ImageFilter;
  selected: boolean;
  previewSrc?: string;
  onClick: () => void;
}) {
  const src = previewSrc || PLACEHOLDER;
  const cssFilter = buildCssFilter(filter);

  return (
    <button
      type="button"
      onClick={onClick}
      title={filter.label}
      className={cn(
        'flex flex-col items-center gap-1 p-1 rounded-lg transition-all cursor-pointer',
        selected ? 'ring-2 ring-[#4b57e6] bg-[#4b57e6]/5' : 'ring-1 ring-transparent hover:ring-[#e6e6ee]'
      )}
    >
      <div className="w-full aspect-[4/3] rounded overflow-hidden bg-[#f0f0f5] relative">
        <img
          src={src}
          alt={filter.label}
          draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: cssFilter }}
        />
        {filter.mode === 'overlay' && filter.overlayColor && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: filter.overlayColor,
              opacity: filter.overlayOpacity ?? 0.3,
              mixBlendMode: (filter.overlayBlend ?? 'multiply') as CSSProperties['mixBlendMode'],
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
      <span className={cn('text-[9px] leading-tight text-center truncate w-full', selected ? 'text-[#4b57e6] font-semibold' : 'text-[#9a9bab]')}>
        {filter.label}
      </span>
    </button>
  );
}

export interface ImageFilterPickerProps {
  /** URL ảnh thật (đã resolve) hiện trong từng swatch — bỏ trống dùng ảnh minh hoạ mặc định. */
  previewSrc?: string;
  value: string | undefined;
  onChange: (filter: string) => void;
  /** Bỏ trống = 3 cột (dùng cho popover hẹp trên ItemToolbar). Truyền 4-5 cho panel rộng hơn. */
  columns?: number;
}

export function ImageFilterPicker({ previewSrc, value, onChange, columns = 3 }: ImageFilterPickerProps) {
  const current = value || 'none';
  return (
    <div className="grid gap-1.5 p-1" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      <ImageFilterDefs />
      {IMAGE_FILTERS.map((f) => (
        <FilterSwatch key={f.value} filter={f} selected={current === f.value} previewSrc={previewSrc} onClick={() => onChange(f.value)} />
      ))}
    </div>
  );
}
