import { useEffect, useRef, useState } from 'react';
import Colorful from '@uiw/react-color-colorful';
import { hexToHsva, type ColorResult, type HsvaColor } from '@uiw/color-convert';
import { hexToRgb, rgbToHex, labelStyle, numberInputStyle } from './helpers.js';

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, alpha]);

  function handleColorfulChange(result: ColorResult) {
    setHsva(result.hsva);
    lastEmittedHexRef.current = result.hex;
    onChange({ color: result.hex, alpha: Math.round(result.rgba.a * 100) });
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 10 }}>
      <Colorful color={hsva} onChange={handleColorfulChange} style={{ width: PICKER_SIZE, flex: 'none' }} />
      <div style={{ flex: '1 1 140px', minWidth: 140 }}>
        <label style={{ ...labelStyle, marginBottom: 6 }}>Hex</label>
        <input
          type="text"
          value={color}
          onChange={(e) => onChange({ color: e.target.value })}
          style={{ ...numberInputStyle(undefined), width: '100%', fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
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
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 9.5, color: '#9a9bab', textAlign: 'center', marginBottom: 2 }}>{label}</div>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value))))}
        style={{ ...numberInputStyle(undefined), width: '100%', textAlign: 'center', padding: '6px 2px' }}
      />
    </div>
  );
}
