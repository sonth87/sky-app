import type { LayoutItem } from '@sky-app/slide-shared';
import { VariableTextarea } from '../VariableTextarea.js';
import { Section } from './CommonControls.js';
import { cn } from '../../lib/cn.js';

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
        <button
          onClick={() => patch({ fontWeight: boldActive ? 400 : 700 })}
          className={cn(
            'p-[7px_14px] rounded-lg border text-xs font-bold cursor-pointer transition-colors duration-100',
            boldActive ? 'border-[#4b57e6] bg-[#4b57e6]/10 text-[#4b57e6]' : 'border-[#e6e6ee] bg-[#fcfcfd] text-[#5c5d6e] hover:bg-neutral-50'
          )}
        >
          B
        </button>
      </Section>
      <Section title="Màu chữ">
        <input type="color" value={item.color ?? '#ffffff'} onChange={(e) => patch({ color: e.target.value })} className="w-10 h-8 p-0 border-none rounded cursor-pointer" />
      </Section>
      <Section title="Nền dải ruy-băng">
        <input type="color" value={item.bg ?? '#b9902f'} onChange={(e) => patch({ bg: e.target.value })} className="w-10 h-8 p-0 border-none rounded cursor-pointer" />
      </Section>
    </>
  );
}
