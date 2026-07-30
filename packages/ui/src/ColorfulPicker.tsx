// ColorfulPicker — wrap @uiw/react-color-colorful + Hex/RGBA field, khuôn nguyên vẹn
// module-layout-designer's StopColorPicker.tsx (rút ra dùng chung, 2026-07-29 — xem
// useColorfulSync.ts cho phần logic đồng bộ HSVA).
import Colorful from '@uiw/react-color-colorful';
import { useColorfulSync } from './useColorfulSync.js';
import { hexToRgb, rgbToHex } from './colorHex.js';

export const COLORFUL_PICKER_SIZE = 168;

export interface ColorfulPickerProps {
  color: string;
  alpha: number;
  onChange: (patch: { color?: string; alpha?: number }) => void;
}

export function ColorfulPicker({ color, alpha, onChange }: ColorfulPickerProps) {
  const { hsva, handleChange } = useColorfulSync(color, alpha, onChange);

  return (
    <div className="flex flex-wrap gap-3 mb-[10px]">
      <Colorful color={hsva} onChange={handleChange} style={{ width: COLORFUL_PICKER_SIZE, flex: 'none' }} />
      <div className="flex-1 min-w-[140px]">
        <label className="block text-[10.5px] text-[#9a9bab] mb-1.5 uppercase tracking-[.04em]">Hex</label>
        <input
          type="text"
          value={color}
          onChange={(e) => onChange({ color: e.target.value })}
          className="w-full border border-[#e6e6ee] rounded-md p-[6px_7px] text-[11.5px] font-mono mb-2"
        />
        <div className="flex gap-1.5">
          <RgbaField label="R" value={hexToRgb(color).r} onChange={(r) => onChange({ color: rgbToHex(r, hexToRgb(color).g, hexToRgb(color).b) })} />
          <RgbaField label="G" value={hexToRgb(color).g} onChange={(g) => onChange({ color: rgbToHex(hexToRgb(color).r, g, hexToRgb(color).b) })} />
          <RgbaField label="B" value={hexToRgb(color).b} onChange={(b) => onChange({ color: rgbToHex(hexToRgb(color).r, hexToRgb(color).g, b) })} />
          <RgbaField label="A" value={alpha} max={100} onChange={(a) => onChange({ alpha: a })} />
        </div>
      </div>
    </div>
  );
}

function RgbaField({ label, value, onChange, max = 255 }: { label: string; value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <div className="flex-1">
      <div className="text-[9.5px] text-[#9a9bab] text-center mb-0.5">{label}</div>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value))))}
        className="w-full border border-[#e6e6ee] rounded-md p-[6px_2px] text-[11.5px] text-center"
      />
    </div>
  );
}
