// useColorfulSync — logic đồng bộ HSVA dùng chung cho @uiw/react-color-colorful, rút ra sau khi
// phát hiện module-layout-designer's StopColorPicker.tsx VÀ SwatchColorPopover.tsx viết lại y hệt
// logic này 2 lần độc lập (2026-07-29). `color`/`alpha` là "nguồn chân lý" bên ngoài (props) —
// hook giữ 1 bản `hsva` nội bộ cho Colorful (nó cần HsvaColor, không nhận hex+alpha rời), đồng
// bộ lại khi props đổi TỪ BÊN NGOÀI (không phải do chính hook vừa emit ra — lastEmittedHexRef
// chặn vòng lặp phản hồi).
import { useEffect, useRef, useState } from 'react';
import { hexToHsva, type ColorResult, type HsvaColor } from '@uiw/color-convert';

export interface UseColorfulSyncResult {
  hsva: HsvaColor;
  handleChange: (result: ColorResult) => void;
}

export function useColorfulSync(
  color: string,
  alpha: number,
  onChange: (patch: { color?: string; alpha?: number }) => void,
): UseColorfulSyncResult {
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

  return { hsva, handleChange };
}
