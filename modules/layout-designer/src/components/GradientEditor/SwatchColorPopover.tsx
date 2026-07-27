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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        style={{ position: 'absolute', inset: '-1000px', zIndex: 9 }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: 6,
          zIndex: 10,
          borderRadius: 11,
          boxShadow: '0 14px 34px rgba(20,20,40,.18)',
          background: '#fff',
          padding: 10,
        }}
      >
        <Colorful color={hsva} onChange={handleChange} style={{ width: PICKER_SIZE }} />
      </div>
    </>
  );
}
