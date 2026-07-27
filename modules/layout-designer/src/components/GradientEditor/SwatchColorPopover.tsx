import { useEffect, useRef, useState } from 'react';
import Colorful from '@uiw/react-color-colorful';
import { hexToHsva, type ColorResult, type HsvaColor } from '@uiw/color-convert';
import { PICKER_SIZE } from './StopColorPicker.js';

export interface SwatchColorPopoverProps {
  color: string;
  alpha: number;
  onChange: (patch: { color?: string; alpha?: number }) => void;
  onClose: () => void;
}

export function SwatchColorPopover({
  color,
  alpha,
  onChange,
  onClose,
}: SwatchColorPopoverProps) {
  const [hsva, setHsva] = useState<HsvaColor>(() => ({ ...hexToHsva(color), a: alpha / 100 }));
  const lastEmittedHexRef = useRef<string>(color);

  useEffect(() => {
    if (color === lastEmittedHexRef.current && Math.round(hsva.a * 100) === alpha) return;
    setHsva({ ...hexToHsva(color), a: alpha / 100 });
    lastEmittedHexRef.current = color;
  }, [color, alpha]);

  function handleChange(result: ColorResult) {
    setHsva(result.hsva);
    lastEmittedHexRef.current = result.hex;
    onChange({ color: result.hex, alpha: Math.round(result.rgba.a * 100) });
  }

  return (
    <>
      <div
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute -inset-[1000px] z-[9]"
        style={{ position: 'absolute', inset: '-1000px' }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute top-full left-0 mt-[6px] z-[10] rounded-[11px] shadow-[0_14px_34px_rgba(20,20,40,0.18)] bg-white p-[10px]"
      >
        <Colorful color={hsva} onChange={handleChange} style={{ width: PICKER_SIZE }} />
      </div>
    </>
  );
}
