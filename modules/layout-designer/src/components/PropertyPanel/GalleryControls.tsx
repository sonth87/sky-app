import { Grid3X3, Columns3, Rows3, Maximize2, Minimize2 } from 'lucide-react';
import type { LayoutItem } from '@sky-app/slide-shared';
import { Section } from './CommonControls.js';
import { IconToggleGroup } from '@sky-app/ui';

export interface GalleryControlsProps {
  item: Extract<LayoutItem, { type: 'gallery' }>;
  patch: (p: Partial<LayoutItem>) => void;
  onOpenGalleryManager: () => void;
}

export function GalleryControls({
  item,
  patch,
  onOpenGalleryManager,
}: GalleryControlsProps) {
  return (
    <>
      <Section title="Quản lý ảnh">
        <div className="text-xs text-[#5c5d6e] mb-2">{item.images.length} ảnh</div>
        <button
          onClick={onOpenGalleryManager}
          className="w-full px-3 py-2 text-sm rounded-[7px] border border-[#e6e6ee] hover:bg-[#f4f5f9] font-medium"
        >
          Mở quản lý bộ ảnh
        </button>
      </Section>

      <Section title="Bố cục">
        <IconToggleGroup
          options={[
            { value: 'grid', icon: Grid3X3, title: 'Lưới' },
            { value: 'row', icon: Rows3, title: 'Hàng' },
            { value: 'column', icon: Columns3, title: 'Cột' },
          ]}
          value={item.layout}
          onChange={(layout) => patch({ layout })}
        />
        {item.layout === 'grid' && (
          <div className="flex items-center gap-[10px] mt-3 mb-3">
            <span className="text-[11.5px]">Số cột</span>
            <input type="range" min={1} max={8} value={item.columns ?? 3} onChange={(e) => patch({ columns: Number(e.target.value) })} className="flex-1" />
            <span className="text-[11px] w-[28px] text-right">{item.columns ?? 3}</span>
          </div>
        )}
        <div className="flex items-center gap-[10px]">
          <span className="text-[11.5px]">Khoảng cách</span>
          <input type="range" min={0} max={60} value={item.gap ?? 8} onChange={(e) => patch({ gap: Number(e.target.value) })} className="flex-1" />
          <span className="text-[11px] w-[28px] text-right">{item.gap ?? 8}</span>
        </div>
      </Section>

      <Section title="Hiển thị">
        <IconToggleGroup
          options={[
            { value: 'cover', icon: Maximize2, title: 'Lấp đầy' },
            { value: 'contain', icon: Minimize2, title: 'Vừa khung' },
          ]}
          value={item.fit}
          onChange={(fit) => patch({ fit })}
        />
        <div className="flex items-center gap-2 mt-3">
          <input
            type="checkbox"
            id="gallery-show-caption"
            checked={item.showCaption}
            onChange={(e) => patch({ showCaption: e.target.checked })}
            className="cursor-pointer"
          />
          <label htmlFor="gallery-show-caption" className="text-[11.5px] cursor-pointer">
            Hiện chú thích
          </label>
        </div>
      </Section>
    </>
  );
}
