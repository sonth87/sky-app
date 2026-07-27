import type { LayoutItem } from '@sky-app/slide-shared';
import { VariableTextarea } from '../VariableTextarea.js';
import { pickerBtnStyle, Section } from './CommonControls.js';

export interface RibbonControlsProps {
  item: Extract<LayoutItem, { type: 'ribbon' }>;
  patch: (p: Partial<LayoutItem>) => void;
  tokenSuggestions: string[];
  onTokenInserted?: (key: string) => void;
}

export function RibbonControls({
  item,
  patch,
  tokenSuggestions,
  onTokenInserted,
}: RibbonControlsProps) {
  const boldActive = (item.fontWeight ?? 400) >= 700;
  return (
    <>
      <Section title="Nội dung">
        <VariableTextarea value={item.content} onChange={(v) => patch({ content: v })} suggestions={tokenSuggestions} onTokenInserted={onTokenInserted} />
        <div style={{ fontSize: 10.5, color: '#9a9bab', marginTop: 6 }}>
          Gõ <b style={{ color: '#c07a1e' }}>@ten_bien</b> để chèn token — gợi ý theo layout này và biến hay dùng.
        </div>
      </Section>
      <Section title="Kiểu chữ">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 11.5 }}>Cỡ chữ</span>
          <input type="range" min={10} max={72} value={item.fontSize} onChange={(e) => patch({ fontSize: Number(e.target.value) })} style={{ flex: 1 }} />
          <span style={{ fontSize: 11, width: 34, textAlign: 'right' }}>{item.fontSize}</span>
        </div>
        <button onClick={() => patch({ fontWeight: boldActive ? 400 : 700 })} style={pickerBtnStyle(boldActive, { padding: '7px 14px', borderRadius: 8, fontWeight: 700 })}>
          B
        </button>
      </Section>
      <Section title="Màu chữ">
        <input type="color" value={item.color ?? '#ffffff'} onChange={(e) => patch({ color: e.target.value })} />
      </Section>
      <Section title="Nền dải ruy-băng">
        <input type="color" value={item.bg ?? '#b9902f'} onChange={(e) => patch({ bg: e.target.value })} />
      </Section>
    </>
  );
}
