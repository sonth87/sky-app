import type { LayoutItem } from '@sky-app/slide-shared';
import { Section } from './CommonControls.js';
import { cn } from '../../lib/cn.js';

export interface ShapeControlsProps {
  item: Extract<LayoutItem, { type: 'shape' }>;
  patch: (p: Partial<LayoutItem>) => void;
}

export function ShapeControls({ item, patch }: ShapeControlsProps) {
  return (
    <>
      <Section title="Hình dạng">
        <div className="flex gap-2 flex-wrap">
          {(['rect', 'circle', 'triangle', 'diamond', 'frame', 'line'] as const).map((s) => (
            <button
              key={s}
              onClick={() => patch({ shape: s })}
              className={cn(
                'w-[30px] h-[30px] rounded-[7px] border flex items-center justify-center cursor-pointer',
                item.shape === s ? 'border-[#4b57e6] bg-[#4b57e6]/10 text-[#4b57e6]' : 'border-[#e6e6ee] bg-[#fcfcfd] text-[#5c5d6e]'
              )}
            >
              {s === 'circle' ? '●' : s === 'triangle' ? '▲' : s === 'diamond' ? '◆' : s === 'frame' ? '▢' : s === 'line' ? '―' : '▮'}
            </button>
          ))}
        </div>
      </Section>
      {item.shape !== 'line' && (
        <Section title="Màu nền">
          <input type="color" value={item.fill ?? '#4b57e6'} onChange={(e) => patch({ fill: e.target.value })} className="w-10 h-8 p-0 border-none rounded cursor-pointer" />
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
      <Section title="Viền">
        <div className={cn('flex items-center gap-[10px]', (item.strokeW ?? 0) > 0 && 'mb-2')}>
          <input type="range" min={0} max={16} value={item.strokeW ?? 0} onChange={(e) => patch({ strokeW: Number(e.target.value) })} className="flex-1" />
          <span className="text-[11px] w-[34px] text-right">{item.strokeW ?? 0}</span>
        </div>
        {(item.strokeW ?? 0) > 0 && <input type="color" value={item.stroke ?? '#000000'} onChange={(e) => patch({ stroke: e.target.value })} className="w-10 h-8 p-0 border-none rounded cursor-pointer" />}
      </Section>
    </>
  );
}
