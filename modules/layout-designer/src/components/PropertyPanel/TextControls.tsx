import type { LayoutItem } from '@sky-app/slide-shared';
import { Bold, Italic, CaseUpper, AlignLeft, AlignCenter, AlignRight, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, WrapText, Minimize2, Scissors } from 'lucide-react';
import { VariableTextarea } from '../VariableTextarea.js';
import { Section } from './CommonControls.js';
import { IconToggleButton, IconToggleGroup, ColorfulSwatchButton } from '@sky-app/ui';
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
          <IconToggleButton
            icon={Bold}
            title="Đậm"
            active={boldActive}
            onClick={() => patch({ fontWeight: boldActive ? 400 : 700 })}
          />
          <IconToggleButton
            icon={Italic}
            title="Nghiêng"
            active={!!item.italic}
            onClick={() => patch({ italic: !item.italic })}
          />
          <IconToggleButton
            icon={CaseUpper}
            title="Chữ hoa"
            active={!!item.uppercase}
            onClick={() => patch({ uppercase: !item.uppercase })}
          />
        </div>
      </Section>
      <Section title="Giãn dòng">
        <div className="flex items-center gap-[10px]">
          <input type="range" min={0.8} max={2.5} step={0.02} value={item.lineHeight ?? 1.18} onChange={(e) => patch({ lineHeight: Number(e.target.value) })} className="flex-1" />
          <span className="text-[11px] w-[34px] text-right">{(item.lineHeight ?? 1.18).toFixed(2)}</span>
        </div>
      </Section>
      <Section title="Màu chữ">
        <ColorfulSwatchButton
          color={item.color ?? '#ffffff'}
          onChange={(color) => patch({ color })}
          title="Màu chữ"
        />
      </Section>
      <Section title="Căn ngang">
        <IconToggleGroup
          options={[
            { value: 'left' as const, icon: AlignLeft, title: 'Căn trái' },
            { value: 'center' as const, icon: AlignCenter, title: 'Căn giữa' },
            { value: 'right' as const, icon: AlignRight, title: 'Căn phải' },
          ]}
          value={item.align ?? 'left'}
          onChange={(align) => patch({ align })}
        />
      </Section>
      <Section title="Căn dọc">
        <IconToggleGroup
          options={[
            { value: 'top' as const, icon: AlignVerticalJustifyStart, title: 'Căn trên' },
            { value: 'center' as const, icon: AlignVerticalJustifyCenter, title: 'Căn giữa' },
            { value: 'bottom' as const, icon: AlignVerticalJustifyEnd, title: 'Căn dưới' },
          ]}
          value={item.vAlign ?? 'center'}
          onChange={(vAlign) => patch({ vAlign })}
        />
      </Section>
      <Section title="Khi tràn khung">
        <IconToggleGroup
          options={[
            { value: 'wrap' as const, icon: WrapText, title: 'Xuống dòng', label: 'Xuống dòng' },
            { value: 'shrink' as const, icon: Minimize2, title: 'Co chữ', label: 'Co chữ' },
            { value: 'clip' as const, icon: Scissors, title: 'Cắt', label: 'Cắt' },
          ]}
          value={item.overflow ?? 'wrap'}
          onChange={(overflow) => patch({ overflow })}
        />
      </Section>
      <ShadowControl value={item.shadow} onChange={(v) => patch({ shadow: v })} />
    </>
  );
}
