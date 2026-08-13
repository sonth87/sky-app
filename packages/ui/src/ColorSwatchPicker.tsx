// ColorSwatchPicker — bảng màu cố định để "gắn tag" cho 1 đối tượng (phân biệt nhanh trong danh
// sách — LayoutDocument, Event, ...). Trước đây bị viết trùng 2 lần độc lập
// (module-layout-designer's `ColorTagPicker`, module-ceremony's `EventColorPicker`) — gộp về 1
// nguồn (2026-07-29). Không phụ thuộc i18n (package này tự chứa, xem cn.ts) — caller tự truyền
// `title`/`clearLabel` theo ngôn ngữ hiện tại.

import { useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from './cn.js';

export const COLOR_SWATCH_PALETTE = [
  '#ef4444', // đỏ
  '#f97316', // cam
  '#eab308', // vàng
  '#22c55e', // xanh lá
  '#14b8a6', // xanh ngọc
  '#3b82f6', // xanh dương
  '#8b5cf6', // tím
  '#ec4899', // hồng
] as const;

export interface ColorSwatchPickerProps {
  color: string | undefined;
  onChange: (color: string | undefined) => void;
  /** Tooltip trên nút mở picker — mặc định "Chọn màu" nếu không truyền. */
  title?: string;
  /** Nhãn nút "bỏ màu" — mặc định "✕" nếu không truyền. */
  clearLabel?: string;
}

export function ColorSwatchPicker({ color, onChange, title = 'Chọn màu', clearLabel = '✕' }: ColorSwatchPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={title}
        className={cn(
          'h-6 w-6 shrink-0 cursor-pointer rounded-full p-0',
          color ? 'border-2 border-background outline outline-1 outline-border' : 'border-2 border-dashed border-border',
        )}
        style={{ background: color ?? 'transparent' }}
      />

      {open && (
        <>
          <div onClick={() => setOpen(false)} className="fixed inset-0 z-40" />
          <div className="absolute right-0 top-full z-50 mt-1.5 grid grid-cols-4 gap-2 rounded-lg border border-border bg-popover p-2.5 shadow-lg">
            {COLOR_SWATCH_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                title={c}
                className="flex h-6 w-6 items-center justify-center rounded-full border-none"
                style={{ background: c }}
              >
                {color === c && <Check size={13} color="#fff" strokeWidth={3} />}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              title={clearLabel}
              className="col-span-4 rounded-full border border-dashed border-border bg-background text-[10px] text-muted-foreground"
            >
              {clearLabel}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
