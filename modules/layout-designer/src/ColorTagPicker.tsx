// ColorTagPicker — chọn màu tag cho layout (PHỤ LỤC "Event Hub", 2026-07-22). Màu gắn vào
// CHÍNH LayoutDocument (không phải EventLayoutRef) — hiện dạng badge ở danh sách Event
// (module-ceremony) để phân biệt nhanh layout nào đang gán cho quy tắc/màn chờ nào. Bảng màu CỐ
// ĐỊNH (không color-picker tự do) — đơn giản, đủ phân biệt ~8-10 layout khác nhau trong 1 dự án.

import { useState } from 'react';
import { Check } from 'lucide-react';

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
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Màu tag layout"
        style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          border: color ? '2px solid #fff' : '2px dashed #c9c9d3',
          outline: color ? '1px solid #e6e6ee' : 'none',
          background: color ?? 'transparent',
          cursor: 'pointer',
          padding: 0,
          flex: 'none',
        }}
      />

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 49 }}
          />
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              marginTop: 6,
              padding: 10,
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 8,
              background: '#fff',
              border: '1px solid #e6e6ee',
              borderRadius: 11,
              boxShadow: '0 14px 34px rgba(20,20,40,.18)',
              zIndex: 50,
            }}
          >
            {LAYOUT_TAG_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                title={c}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  border: 'none',
                  background: c,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
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
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                border: '1px dashed #c9c9d3',
                background: '#fff',
                cursor: 'pointer',
                gridColumn: 'span 4',
                fontSize: 10,
                color: '#9a9bab',
              }}
            >
              ✕
            </button>
          </div>
        </>
      )}
    </div>
  );
}
