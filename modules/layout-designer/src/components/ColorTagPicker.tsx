// ColorTagPicker — chọn màu tag cho layout (PHỤ LỤC "Event Hub", 2026-07-22). Màu gắn vào
// CHÍNH LayoutDocument (không phải EventLayoutRef) — hiện dạng badge ở danh sách Event
// (module-ceremony) để phân biệt nhanh layout nào đang gán cho quy tắc/màn chờ nào. Bảng màu CỐ
// ĐỊNH (không color-picker tự do) — đơn giản, đủ phân biệt ~8-10 layout khác nhau trong 1 dự án.

import { useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../lib/cn.js';

export const LAYOUT_TAG_COLORS = [
  '#ef4444', // đỏ
  '#f97316', // cam
  '#eab308', // vàng
  '#22c55e', // xanh lá
  '#14b8a6', // xanh ngọc
  '#3b82f6', // xanh dương
  '#8b5cf6', // tím
  '#ec4899', // hồng
] as const;

export interface ColorTagPickerProps {
  color: string | undefined;
  onChange: (color: string | undefined) => void;
}

export function ColorTagPicker({ color, onChange }: ColorTagPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Màu tag layout"
        className={cn(
          'wa-6 h-6 rounded-full cursor-pointer p-0 shrink-0',
          color ? 'border-2 border-white outline-1 outline-[#e6e6ee]' : 'border-2 border-dashed border-[#c9c9d3]'
        )}
        style={{
          background: color ?? 'transparent',
        }}
      />

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[49]"
          />
          <div className="absolute right-0 top-full mt-[6px] p-[10px] grid grid-cols-4 gap-2 bg-white border border-[#e6e6ee] rounded-[11px] shadow-[0_14px_34px_rgba(20,20,40,0.18)] z-[50]">
            {LAYOUT_TAG_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                title={c}
                className="w-6 h-6 rounded-full border-none cursor-pointer flex items-center justify-center"
                style={{ background: c }}
              >
                {color === c && <Check size={13} color="#fff" strokeWidth={3} />}
              </button>
            ))}
            <button
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
              title="Bỏ màu"
              className="w-6 h-6 rounded-full border border-dashed border-[#c9c9d3] bg-white cursor-pointer col-span-4 text-[10px] text-[#9a9bab]"
            >
              ✕
            </button>
          </div>
        </>
      )}
    </div>
  );
}
