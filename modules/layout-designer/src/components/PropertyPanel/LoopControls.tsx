import type { LayoutItem } from '@sky-app/slide-shared';
import { Rows3, Columns3, Grid3X3, Minimize2, Scissors } from 'lucide-react';
import { Section } from './CommonControls.js';
import { IconToggleGroup } from '@sky-app/ui';

export interface LoopControlsProps {
  item: Extract<LayoutItem, { type: 'loop' }>;
  patch: (p: Partial<LayoutItem>) => void;
}

export function LoopControls({ item, patch }: LoopControlsProps) {
  return (
    <>
      <Section title="Hướng sắp xếp">
        <IconToggleGroup
          options={[
            { value: 'row' as const, icon: Rows3, title: 'Hàng' },
            { value: 'column' as const, icon: Columns3, title: 'Cột' },
            { value: 'grid' as const, icon: Grid3X3, title: 'Lưới' },
          ]}
          value={item.direction}
          onChange={(direction) => patch({ direction, columns: direction === 'grid' ? (item.columns ?? 2) : undefined })}
        />
      </Section>

      {item.direction === 'grid' && (
        <Section title="Số cột">
          <div className="flex items-center gap-[10px]">
            <input
              type="range"
              min={1}
              max={10}
              value={item.columns ?? 2}
              onChange={(e) => patch({ columns: Number(e.target.value) })}
              className="flex-1"
            />
            <span className="text-[11px] w-[34px] text-right">{item.columns ?? 2}</span>
          </div>
        </Section>
      )}

      <Section title="Khoảng cách">
        <div className="flex items-center gap-[10px]">
          <input
            type="range"
            min={0}
            max={50}
            value={item.gap ?? 0}
            onChange={(e) => patch({ gap: Number(e.target.value) })}
            className="flex-1"
          />
          <span className="text-[11px] w-[34px] text-right">{item.gap ?? 0}px</span>
        </div>
      </Section>

      <Section title="Kích thước ô">
        <div className="space-y-2">
          <div className="flex items-center gap-[10px]">
            <label className="text-[11px] w-8">Rộng</label>
            <input
              type="range"
              min={10}
              max={500}
              value={item.itemBox.w}
              onChange={(e) => patch({ itemBox: { ...item.itemBox, w: Number(e.target.value) } })}
              className="flex-1"
            />
            <span className="text-[11px] w-[34px] text-right">{item.itemBox.w}px</span>
          </div>
          <div className="flex items-center gap-[10px]">
            <label className="text-[11px] w-8">Cao</label>
            <input
              type="range"
              min={10}
              max={500}
              value={item.itemBox.h}
              onChange={(e) => patch({ itemBox: { ...item.itemBox, h: Number(e.target.value) } })}
              className="flex-1"
            />
            <span className="text-[11px] w-[34px] text-right">{item.itemBox.h}px</span>
          </div>
        </div>
      </Section>

      <Section title="Tràn dữ liệu">
        <IconToggleGroup
          options={[
            { value: 'shrink' as const, icon: Minimize2, title: 'Thu nhỏ', label: 'Thu nhỏ' },
            { value: 'truncate' as const, icon: Scissors, title: 'Cắt bớt', label: 'Cắt bớt' },
          ]}
          value={item.overflow}
          onChange={(overflow) => patch({ overflow, maxItems: overflow === 'truncate' ? (item.maxItems ?? 5) : undefined })}
        />
      </Section>

      {item.overflow === 'truncate' && (
        <>
          <Section title="Số mục tối đa">
            <div className="flex items-center gap-[10px]">
              <input
                type="range"
                min={1}
                max={20}
                value={item.maxItems ?? 5}
                onChange={(e) => patch({ maxItems: Number(e.target.value) })}
                className="flex-1"
              />
              <span className="text-[11px] w-[34px] text-right">{item.maxItems ?? 5}</span>
            </div>
          </Section>

          <Section title="Văn bản tràn">
            <input
              type="text"
              placeholder="+@count_more"
              value={item.overflowMoreText ?? ''}
              onChange={(e) => patch({ overflowMoreText: e.target.value })}
              className="w-full px-2 py-[6px] border border-[#e6e6ee] rounded-[6px] text-[12px] placeholder:text-[#a8a9b8]"
            />
          </Section>
        </>
      )}

      <Section title="Nguồn dữ liệu">
        <div className="text-[12px] text-[#5c5d6e] py-[6px] px-2 bg-[#fcfcfd] rounded-[6px] border border-[#e6e6ee]">
          Thành viên nhóm
        </div>
      </Section>
    </>
  );
}
