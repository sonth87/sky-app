import { useEffect, useRef, useState } from 'react';
import Colorful from '@uiw/react-color-colorful';
import { hexToHsva, type ColorResult, type HsvaColor } from '@uiw/color-convert';
import { hexToRgb, rgbToHex } from './helpers.js';

export const PICKER_SIZE = 168;

export interface StopColorPickerProps {
  color: string;
  alpha: number;
  onChange: (patch: { color?: string; alpha?: number }) => void;
}

export function StopColorPicker({
  color,
  alpha,
  onChange,
}: StopColorPickerProps) {
  const [hsva, setHsva] = useState<HsvaColor>(() => ({ ...hexToHsva(color), a: alpha / 100 }));
  const lastEmittedHexRef = useRef<string>(color);

  useEffect(() => {
    if (color === lastEmittedHexRef.current && Math.round(hsva.a * 100) === alpha) return;
    setHsva({ ...hexToHsva(color), a: alpha / 100 });
    lastEmittedHexRef.current = color;
  }, [color, alpha]);

  function handleColorfulChange(result: ColorResult) {
    setHsva(result.hsva);
    lastEmittedHexRef.current = result.hex;
    onChange({ color: result.hex, alpha: Math.round(result.rgba.a * 100) });
  }

  return (
    <div className="flex flex-wrap gap-3 mb-[10px]">
      <Colorful color={hsva} onChange={handleColorfulChange} style={{ width: PICKER_SIZE, flex: 'none' }} />
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
