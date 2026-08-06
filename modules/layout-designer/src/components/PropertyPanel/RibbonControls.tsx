import type { LayoutItem } from '@sky-app/slide-shared';
import { Bold } from 'lucide-react';
import { VariableTextarea } from '../VariableTextarea.js';
import { Section } from './CommonControls.js';
import { IconToggleButton, ColorfulSwatchButton } from '@sky-app/ui';
import { ShadowControl } from './ShadowControl.js';

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
        <div className="text-[10.5px] text-[#9a9bab] mt-[6px]">
          Gõ <b className="text-[#c07a1e]">@ten_bien</b> để chèn token — gợi ý theo layout này và biến hay dùng.
        </div>
      </Section>
      <Section title="Kiểu chữ">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11.5px]">Cỡ chữ</span>
          <input type="range" min={10} max={72} value={item.fontSize} onChange={(e) => patch({ fontSize: Number(e.target.value) })} className="flex-1" />
          <span className="text-[11px] w-[34px] text-right">{item.fontSize}</span>
        </div>
        <IconToggleButton
          icon={Bold}
          title="Đậm"
          active={boldActive}
          onClick={() => patch({ fontWeight: boldActive ? 400 : 700 })}
        />
      </Section>
      <Section title="Màu chữ">
        <ColorfulSwatchButton
          color={item.color ?? '#ffffff'}
          onChange={(color) => patch({ color })}
          title="Màu chữ"
        />
      </Section>
      <Section title="Nền dải ruy-băng">
        <ColorfulSwatchButton
          color={typeof item.bg === 'string' ? (item.bg ?? '#b9902f') : '#b9902f'}
          onChange={(bg) => patch({ bg })}
          title="Màu nền"
        />
      </Section>
      <Section title="Viền">
        <div className="flex items-center gap-[10px] mb-2">
          <input type="range" min={0} max={16} value={item.borderW ?? 0} onChange={(e) => patch({ borderW: Number(e.target.value) })} className="flex-1" />
          <span className="text-[11px] w-[34px] text-right">{item.borderW ?? 0}</span>
        </div>
        {(item.borderW ?? 0) > 0 && (
          <ColorfulSwatchButton
            color={item.borderColor ?? '#000000'}
            onChange={(borderColor) => patch({ borderColor })}
            title="Màu viền"
          />
        )}
      </Section>
      <ShadowControl value={item.shadow} onChange={(shadow) => patch({ shadow })} />
    </>
  );
}
