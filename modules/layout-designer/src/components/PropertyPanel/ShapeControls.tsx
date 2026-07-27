import type { LayoutItem } from '@sky-app/slide-shared';
import { pickerBtnStyle, Section } from './CommonControls.js';

export interface ShapeControlsProps {
  item: Extract<LayoutItem, { type: 'shape' }>;
  patch: (p: Partial<LayoutItem>) => void;
}

export function ShapeControls({ item, patch }: ShapeControlsProps) {
  return (
    <>
      <Section title="Hình dạng">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['rect', 'circle', 'triangle', 'diamond', 'frame', 'line'] as const).map((s) => (
            <button
              key={s}
              onClick={() => patch({ shape: s })}
              style={pickerBtnStyle(item.shape === s, { width: 30, height: 30, borderRadius: 7 })}
            >
              {s === 'circle' ? '●' : s === 'triangle' ? '▲' : s === 'diamond' ? '◆' : s === 'frame' ? '▢' : s === 'line' ? '―' : '▮'}
            </button>
          ))}
        </div>
      </Section>
      {item.shape !== 'line' && (
        <Section title="Màu nền">
          <input type="color" value={item.fill ?? '#4b57e6'} onChange={(e) => patch({ fill: e.target.value })} />
        </Section>
      )}
      {item.shape === 'rect' && (
        <Section title="Bo góc">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="range" min={0} max={100} value={item.radius ?? 0} onChange={(e) => patch({ radius: Number(e.target.value) })} style={{ flex: 1 }} />
            <span style={{ fontSize: 11, width: 34, textAlign: 'right' }}>{item.radius ?? 0}</span>
          </div>
        </Section>
      )}
      <Section title="Viền">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: (item.strokeW ?? 0) > 0 ? 8 : 0 }}>
          <input type="range" min={0} max={16} value={item.strokeW ?? 0} onChange={(e) => patch({ strokeW: Number(e.target.value) })} style={{ flex: 1 }} />
          <span style={{ fontSize: 11, width: 34, textAlign: 'right' }}>{item.strokeW ?? 0}</span>
        </div>
        {(item.strokeW ?? 0) > 0 && <input type="color" value={item.stroke ?? '#000000'} onChange={(e) => patch({ stroke: e.target.value })} />}
      </Section>
    </>
  );
}
