// ColorfulSwatchPopover — Colorful trong 1 popover nhỏ (click-outside tự viết, không Radix),
// khuôn nguyên vẹn module-layout-designer's SwatchColorPopover.tsx (rút ra dùng chung, 2026-07-29
// — xem useColorfulSync.ts cho phần logic đồng bộ HSVA).
import Colorful from '@uiw/react-color-colorful';
import { useColorfulSync } from './useColorfulSync.js';
import { COLORFUL_PICKER_SIZE } from './ColorfulPicker.js';

export interface ColorfulSwatchPopoverProps {
  color: string;
  alpha: number;
  onChange: (patch: { color?: string; alpha?: number }) => void;
  onClose: () => void;
}

export function ColorfulSwatchPopover({ color, alpha, onChange, onClose }: ColorfulSwatchPopoverProps) {
  const { hsva, handleChange } = useColorfulSync(color, alpha, onChange);

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
        <Colorful color={hsva} onChange={handleChange} style={{ width: COLORFUL_PICKER_SIZE }} />
      </div>
    </>
  );
}
