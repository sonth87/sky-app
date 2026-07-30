import type { TextShadow } from '@sky-app/slide-shared';
import { Section } from './CommonControls.js';
import { cn } from '@sky-app/ui';

export interface ShadowControlProps {
  value: TextShadow | boolean | undefined;
  onChange: (v: TextShadow | undefined) => void;
}

export function ShadowControl({ value, onChange }: ShadowControlProps) {
  const enabled = Boolean(value);
  const obj = typeof value === 'object' ? value : {};
  return (
    <Section title="Đổ bóng">
      <div className={cn('flex items-center gap-2', enabled && 'mb-[10px]')}>
        <button
          onClick={() => onChange(enabled ? undefined : { color: 'rgba(0,0,0,0.35)', blur: 4, offsetX: 0, offsetY: 2 })}
          className={cn(
            'flex-1 py-[7px] rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors duration-100',
            enabled ? 'border-[#4b57e6] bg-[#4b57e6]/10 text-[#4b57e6]' : 'border-[#e6e6ee] bg-[#fcfcfd] text-[#5c5d6e] hover:bg-neutral-50'
          )}
        >
          {enabled ? 'Đang bật' : 'Bật đổ bóng'}
        </button>
      </div>
      {enabled && (
        <div className="flex flex-col gap-2">
          <input type="color" value={obj.color ?? '#000000'} onChange={(e) => onChange({ ...obj, color: e.target.value })} className="w-10 h-8 p-0 border-none rounded cursor-pointer" />
          <div className="flex gap-2">
            <label className="text-[10.5px] text-[#9a9bab] flex-1">
              Lệch X
              <input type="number" value={obj.offsetX ?? 0} onChange={(e) => onChange({ ...obj, offsetX: Number(e.target.value) })} className="w-full border border-[#e6e6ee] rounded-md p-[4px_6px] text-[11px]" />
            </label>
            <label className="text-[10.5px] text-[#9a9bab] flex-1">
              Lệch Y
              <input type="number" value={obj.offsetY ?? 2} onChange={(e) => onChange({ ...obj, offsetY: Number(e.target.value) })} className="w-full border border-[#e6e6ee] rounded-md p-[4px_6px] text-[11px]" />
            </label>
            <label className="text-[10.5px] text-[#9a9bab] flex-1">
              Độ mờ nhoè
              <input type="number" min={0} value={obj.blur ?? 4} onChange={(e) => onChange({ ...obj, blur: Number(e.target.value) })} className="w-full border border-[#e6e6ee] rounded-md p-[4px_6px] text-[11px]" />
            </label>
          </div>
        </div>
      )}
    </Section>
  );
}
