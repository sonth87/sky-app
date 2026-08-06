import type { LayoutItem } from '@sky-app/slide-shared';
import { Square, Circle, Triangle, Diamond, Frame, Minus } from 'lucide-react';
import { Section } from './CommonControls.js';
import { IconToggleGroup, ColorfulSwatchButton } from '@sky-app/ui';
import { ShadowControl } from './ShadowControl.js';
import { cn } from '@sky-app/ui';

export interface ShapeControlsProps {
  item: Extract<LayoutItem, { type: 'shape' }>;
  patch: (p: Partial<LayoutItem>) => void;
}

export function ShapeControls({ item, patch }: ShapeControlsProps) {
  return (
    <>
      <Section title="Hình dạng">
        <IconToggleGroup
          options={[
            { value: 'rect' as const, icon: Square, title: 'Vuông' },
            { value: 'circle' as const, icon: Circle, title: 'Tròn' },
            { value: 'triangle' as const, icon: Triangle, title: 'Tam giác' },
            { value: 'diamond' as const, icon: Diamond, title: 'Kim cương' },
            { value: 'frame' as const, icon: Frame, title: 'Khung viền' },
            { value: 'line' as const, icon: Minus, title: 'Đường kẻ' },
          ]}
          value={item.shape}
          onChange={(shape) => {
            // GĐ10 bug fix — chọn 'frame' (khung viền rỗng) mà strokeW chưa set → tự bật
            // viền mặc định 2px, không thì chọn hình này sẽ VÔ HÌNH (không fill, không viền).
            if (shape === 'frame' && !(item.strokeW ?? 0)) {
              patch({ shape, strokeW: 2, stroke: item.stroke ?? '#000000' });
            } else {
              patch({ shape });
            }
          }}
        />
      </Section>
      {item.shape !== 'line' && item.shape !== 'frame' && (
        <Section title="Màu nền">
          <ColorfulSwatchButton
            color={typeof item.fill === 'string' ? (item.fill ?? '#4b57e6') : '#4b57e6'}
            onChange={(fill) => patch({ fill })}
            title="Màu nền"
          />
        </Section>
      )}
      {item.shape === 'rect' && (
        <Section title="Bo góc">
          <div className="flex items-center gap-[10px]">
            <input type="range" min={0} max={100} value={item.radius ?? 0} onChange={(e) => patch({ radius: Number(e.target.value) })} className="flex-1" />
            <span className="text-[11px] w-[34px] text-right">{item.radius ?? 0}</span>
          </div>
        </Section>
      )}
      <Section title={item.shape === 'frame' ? 'Viền (bắt buộc — đây là khung viền)' : 'Viền'}>
        <div className={cn('flex items-center gap-[10px]', (item.strokeW ?? 0) > 0 && 'mb-2')}>
          <input type="range" min={0} max={16} value={item.strokeW ?? 0} onChange={(e) => patch({ strokeW: Number(e.target.value) })} className="flex-1" />
          <span className="text-[11px] w-[34px] text-right">{item.strokeW ?? 0}</span>
        </div>
        {(item.strokeW ?? 0) > 0 && (
          <ColorfulSwatchButton
            color={item.stroke ?? '#000000'}
            onChange={(stroke) => patch({ stroke })}
            title="Màu viền"
          />
        )}
      </Section>
      <ShadowControl value={item.shadow} onChange={(shadow) => patch({ shadow })} />
    </>
  );
}
