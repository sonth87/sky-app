import type { LayoutItem } from '@sky-app/slide-shared';
import { VariableTextarea } from '../VariableTextarea.js';
import { Section } from './CommonControls.js';
import { ShadowControl } from './ShadowControl.js';
import { cn } from '@sky-app/ui';

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

  const btnClass = (active: boolean) =>
    cn(
      'flex-1 py-[7px] rounded-lg border text-xs font-semibold cursor-pointer transition-colors duration-100',
      active ? 'border-[#4b57e6] bg-[#4b57e6]/10 text-[#4b57e6]' : 'border-[#e6e6ee] bg-[#fcfcfd] text-[#5c5d6e] hover:bg-neutral-50'
    );

  return (
    <>
      <Section title="Nội dung">
        {typeof item.content === 'string' ? (
          <VariableTextarea value={item.content} onChange={(v) => patch({ content: v })} suggestions={tokenSuggestions} onTokenInserted={onTokenInserted} />
        ) : (
          <div className="border border-[#e6e6ee] rounded-[9px] p-[9px_10px] text-[12.5px] text-[#5c5d6e] bg-[#fafafd]">
            Nội dung đã có định dạng (chữ đậm/nghiêng...) — nhấp đúp vào ô văn bản trên canvas để sửa.
          </div>
        )}
        <div className="text-[10.5px] text-[#9a9bab] mt-[6px]">
          Gõ <b className="text-[#c07a1e]">@ten_bien</b> để chèn token — gợi ý theo layout này và biến hay dùng.
        </div>
      </Section>
      <Section title="Font chữ">
        <input
          type="text"
          value={item.fontFamily ?? ''}
          onChange={(e) => patch({ fontFamily: e.target.value || undefined })}
          placeholder="Mặc định hệ thống…"
          className="w-full border border-[#e6e6ee] rounded-[7px] p-[6px_8px] text-[11.5px] mb-2"
        />
        <div className="flex items-center gap-2">
          <span className="text-[11.5px]">Cỡ chữ</span>
          <input type="range" min={10} max={72} value={item.fontSize} onChange={(e) => patch({ fontSize: Number(e.target.value) })} className="flex-1" />
          <span className="text-[11px] w-[34px] text-right">{item.fontSize}</span>
        </div>
      </Section>
      <Section title="Kiểu">
        <div className="flex gap-[7px]">
          <button onClick={() => patch({ fontWeight: boldActive ? 400 : 700 })} className={cn(btnClass(boldActive), 'font-bold')}>
            B
          </button>
          <button onClick={() => patch({ italic: !item.italic })} className={cn(btnClass(Boolean(item.italic)), 'italic')}>
            I
          </button>
          <button onClick={() => patch({ uppercase: !item.uppercase })} className={btnClass(Boolean(item.uppercase))}>
            AA
          </button>
        </div>
      </Section>
      <Section title="Giãn dòng">
        <div className="flex items-center gap-[10px]">
          <input type="range" min={0.8} max={2.5} step={0.02} value={item.lineHeight ?? 1.18} onChange={(e) => patch({ lineHeight: Number(e.target.value) })} className="flex-1" />
          <span className="text-[11px] w-[34px] text-right">{(item.lineHeight ?? 1.18).toFixed(2)}</span>
        </div>
      </Section>
      <Section title="Màu chữ">
        <input type="color" value={item.color ?? '#ffffff'} onChange={(e) => patch({ color: e.target.value })} className="w-10 h-8 p-0 border-none rounded cursor-pointer" />
      </Section>
      <Section title="Căn ngang">
        <div className="flex gap-[7px]">
          {(['left', 'center', 'right'] as const).map((a) => (
            <button key={a} onClick={() => patch({ align: a })} className={btnClass(item.align === a)}>
              {a === 'left' ? '◧' : a === 'center' ? '▣' : '◨'}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Căn dọc">
        <div className="flex gap-[7px]">
          {(['top', 'center', 'bottom'] as const).map((v) => (
            <button key={v} onClick={() => patch({ vAlign: v })} className={cn(btnClass((item.vAlign ?? 'center') === v), 'text-[10.5px]')}>
              {v === 'top' ? 'Trên' : v === 'center' ? 'Giữa' : 'Dưới'}
            </button>
          ))}
        </div>
      </Section>
      <Section title="Khi tràn khung">
        <div className="flex gap-[7px]">
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
              className={cn(btnClass((item.overflow ?? 'wrap') === opt.value), 'text-[10px] py-[6px]')}
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
