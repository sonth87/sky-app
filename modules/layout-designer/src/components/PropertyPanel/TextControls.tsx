import type { LayoutItem } from '@sky-app/slide-shared';
import { VariableTextarea } from '../VariableTextarea.js';
import { pickerBtnStyle, Section } from './CommonControls.js';
import { ShadowControl } from './ShadowControl.js';

export interface TextControlsProps {
  item: Extract<LayoutItem, { type: 'text' }>;
  patch: (p: Partial<LayoutItem>) => void;
  tokenSuggestions: string[];
  onTokenInserted?: (key: string) => void;
}

export function TextControls({
  item,
  patch,
  tokenSuggestions,
  onTokenInserted,
}: TextControlsProps) {
  const boldActive = (item.fontWeight ?? 400) >= 700;
  return (
    <>
      <Section title="Nội dung">
        {/* content string (layout cũ/chưa qua rich-text editor) → sửa qua VariableTextarea như
           cũ. Đã qua rich-text editor (Tiptap JSON, Bước 12) → CHỈ hiện preview read-only + gợi ý
           "Sửa trên canvas" (tránh 2 nguồn chỉnh sửa cùng lúc gây desync giữa sidebar và canvas,
           quyết định đã chốt trong plan) — double-click trực tiếp trên canvas mới mở editor thật. */}
        {typeof item.content === 'string' ? (
          <VariableTextarea value={item.content} onChange={(v) => patch({ content: v })} suggestions={tokenSuggestions} onTokenInserted={onTokenInserted} />
        ) : (
          <div style={{ border: '1px solid #e6e6ee', borderRadius: 9, padding: '9px 10px', fontSize: 12.5, color: '#5c5d6e', background: '#fafafd' }}>
            Nội dung đã có định dạng (chữ đậm/nghiêng...) — nhấp đúp vào ô văn bản trên canvas để sửa.
          </div>
        )}
        <div style={{ fontSize: 10.5, color: '#9a9bab', marginTop: 6 }}>
          Gõ <b style={{ color: '#c07a1e' }}>@ten_bien</b> để chèn token — gợi ý theo layout này và biến hay dùng.
        </div>
      </Section>
      <Section title="Font chữ">
        <input
          type="text"
          value={item.fontFamily ?? ''}
          onChange={(e) => patch({ fontFamily: e.target.value || undefined })}
          placeholder="Mặc định hệ thống…"
          style={{ width: '100%', border: '1px solid #e6e6ee', borderRadius: 7, padding: '6px 8px', fontSize: 11.5, marginBottom: 8 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11.5 }}>Cỡ chữ</span>
          <input type="range" min={10} max={72} value={item.fontSize} onChange={(e) => patch({ fontSize: Number(e.target.value) })} style={{ flex: 1 }} />
          <span style={{ fontSize: 11, width: 34, textAlign: 'right' }}>{item.fontSize}</span>
        </div>
      </Section>
      <Section title="Kiểu">
        <div style={{ display: 'flex', gap: 7 }}>
          <button onClick={() => patch({ fontWeight: boldActive ? 400 : 700 })} style={pickerBtnStyle(boldActive, { flex: 1, padding: '7px 0', borderRadius: 8, fontWeight: 700 })}>
            B
          </button>
          <button onClick={() => patch({ italic: !item.italic })} style={pickerBtnStyle(Boolean(item.italic), { flex: 1, padding: '7px 0', borderRadius: 8, fontStyle: 'italic' })}>
            I
          </button>
          <button onClick={() => patch({ uppercase: !item.uppercase })} style={pickerBtnStyle(Boolean(item.uppercase), { flex: 1, padding: '7px 0', borderRadius: 8 })}>
            AA
          </button>
        </div>
      </Section>
      <Section title="Giãn dòng">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="range" min={0.8} max={2.5} step={0.02} value={item.lineHeight ?? 1.18} onChange={(e) => patch({ lineHeight: Number(e.target.value) })} style={{ flex: 1 }} />
          <span style={{ fontSize: 11, width: 34, textAlign: 'right' }}>{(item.lineHeight ?? 1.18).toFixed(2)}</span>
        </div>
      </Section>
      <Section title="Màu chữ">
        <input type="color" value={item.color ?? '#ffffff'} onChange={(e) => patch({ color: e.target.value })} />
      </Section>
      <Section title="Căn ngang">
        <div style={{ display: 'flex', gap: 7 }}>
          {(['left', 'center', 'right'] as const).map((a) => (
            <button key={a} onClick={() => patch({ align: a })} style={pickerBtnStyle(item.align === a, { flex: 1, padding: '7px 0', borderRadius: 8 })}>
              {a === 'left' ? '◧' : a === 'center' ? '▣' : '◨'}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Căn dọc">
        <div style={{ display: 'flex', gap: 7 }}>
          {(['top', 'center', 'bottom'] as const).map((v) => (
            <button key={v} onClick={() => patch({ vAlign: v })} style={pickerBtnStyle((item.vAlign ?? 'center') === v, { flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 10.5 })}>
              {v === 'top' ? 'Trên' : v === 'center' ? 'Giữa' : 'Dưới'}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Khi tràn khung">
        <div style={{ display: 'flex', gap: 7 }}>
          {(
            [
              { value: 'wrap', label: 'Xuống dòng' },
              { value: 'shrink', label: 'Co chữ' },
              { value: 'clip', label: 'Cắt' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              onClick={() => patch({ overflow: opt.value })}
              style={pickerBtnStyle((item.overflow ?? 'wrap') === opt.value, { flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 10 })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Section>
      <ShadowControl value={item.shadow} onChange={(v) => patch({ shadow: v })} />
    </>
  );
}
