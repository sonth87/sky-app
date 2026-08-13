// ColorfulSwatchButton — nút tròn xem trước màu, bấm vào mở @uiw/react-color-colorful (full
// picker, không giới hạn bảng màu cố định) — dùng cho các chỗ "gắn 1 màu hex tuỳ ý" không cần
// alpha (khác ColorfulPicker/ColorfulSwatchPopover gốc — vốn có thêm kênh alpha cho gradient
// stop). 2026-07-29, theo yêu cầu dùng lại chính @uiw/react-color-colorful đã có trong repo thay
// vì bảng swatch cố định (ColorSwatchPicker) cho những chỗ cần chọn màu TỰ DO (VD màu Event).
//
// Bản đầu tự viết positioning tay (getBoundingClientRect + position: fixed) — SAI trong Modal
// (nổi lệch vị trí, "nằm dưới modal" — đã thử sửa 2 lần vẫn sai vì tính toạ độ containing-block
// không đúng, đặc biệt khi Ceremony chạy trong "cửa sổ ảo" device-layout). Bỏ hẳn cách tự viết,
// dùng THẲNG `radix-ui`'s `Popover` (đã có sẵn trong repo cho mọi popover khác — Select/Dialog/
// Tooltip/...) — Radix tự lo portal + định vị theo trigger (floating-ui bên trong, có tính toán
// va chạm viewport) + đóng khi click ra ngoài/Esc, không cần tự viết lại các cơ chế này.
import { useState } from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import Colorful from '@uiw/react-color-colorful';
import { cn } from './cn.js';
import { useColorfulSync } from './useColorfulSync.js';
import { COLORFUL_PICKER_SIZE } from './ColorfulPicker.js';

const FALLBACK_COLOR = '#94a3b8';

export interface ColorfulSwatchButtonProps {
  color: string | undefined;
  onChange: (color: string | undefined) => void;
  /** Tooltip trên nút mở picker — mặc định "Chọn màu" nếu không truyền. */
  title?: string;
  /** Nhãn nút "bỏ màu" (chỉ hiện khi đã có màu) — mặc định "✕" nếu không truyền. */
  clearLabel?: string;
  /** Portal container cho popover (tránh bị Modal/overflow cha che mất — xem comment đầu file)
   * — truyền `usePortalContainer()` của app đó. Không truyền → Radix tự portal vào
   * `document.body` (đủ dùng khi chắc chắn không cần giữ trong theme scope nào). */
  container?: HTMLElement | null;
}

export function ColorfulSwatchButton({ color, onChange, title = 'Chọn màu', clearLabel = '✕', container }: ColorfulSwatchButtonProps) {
  const [open, setOpen] = useState(false);
  const { hsva, handleChange } = useColorfulSync(color ?? FALLBACK_COLOR, 100, (patch) => {
    if (patch.color) onChange(patch.color);
  });

  return (
    <div className="inline-flex items-center gap-1.5">
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            title={title}
            className={cn(
              'h-6 w-6 shrink-0 cursor-pointer rounded-full p-0',
              color ? 'border-2 border-background outline outline-1 outline-border' : 'border-2 border-dashed border-border',
            )}
            style={{ background: color ?? 'transparent' }}
          />
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal container={container ?? undefined}>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={6}
            // z-[60] — PHẢI cao hơn z-50 (Modal.tsx và mọi primitive Radix khác trong repo đều
            // dùng z-50) vì popover này portal ra CÙNG container với Modal đang mở nó.
            className="z-[60] rounded-[11px] bg-white p-[10px] shadow-[0_14px_34px_rgba(20,20,40,0.18)] outline-none"
          >
            <Colorful color={hsva} onChange={handleChange} style={{ width: COLORFUL_PICKER_SIZE }} />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
      {color && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          title={clearLabel}
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          {clearLabel}
        </button>
      )}
    </div>
  );
}
