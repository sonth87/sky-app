import { useState } from 'react';
import type { AspectRatio } from '@sky-app/slide-shared';
import { cn } from '../lib/cn.js';

const PRESETS: { id: string; w: number; h: number; label: string }[] = [
  { id: '16:9', w: 16, h: 9, label: '16:9 — Màn hình rộng' },
  { id: '4:3', w: 4, h: 3, label: '4:3 — Tiêu chuẩn' },
  { id: '21:9', w: 21, h: 9, label: '21:9 — Ultrawide' },
  { id: '25:9', w: 25, h: 9, label: '25:9 — Màn ghép LED' },
  { id: '32:9', w: 32, h: 9, label: '32:9 — Siêu rộng' },
  { id: '1:1', w: 1, h: 1, label: '1:1 — Vuông' },
  { id: '9:16', w: 9, h: 16, label: '9:16 — Dọc (điện thoại)' },
  { id: '3:4', w: 3, h: 4, label: '3:4 — Dọc tiêu chuẩn' },
];

export interface AddVariantModalProps {
  usedAspectIds: Set<string>;
  onClose: () => void;
  onConfirm: (aspect: AspectRatio) => void;
  title?: string;
  confirmLabel?: string;
}

export function AddVariantModal({ usedAspectIds, onClose, onConfirm, title = 'Thêm tỷ lệ màn hình', confirmLabel = 'Thêm' }: AddVariantModalProps) {
  const [customW, setCustomW] = useState('');
  const [customH, setCustomH] = useState('');
  const [hoveredPresetId, setHoveredPresetId] = useState<string | null>(null);

  const customWNum = Number(customW);
  const customHNum = Number(customH);
  const customValid = customW.trim() !== '' && customH.trim() !== '' && customWNum > 0 && customHNum > 0;
  const customId = customValid ? `custom:${customWNum}x${customHNum}` : '';
  const customUsed = customValid && usedAspectIds.has(customId);

  function confirmCustom() {
    if (!customValid || customUsed) return;
    onConfirm({ id: customId, w: customWNum, h: customHNum });
  }

  return (
    <>
      <div
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute -inset-[1000px] z-[9]"
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute top-full left-0 mt-[6px] w-[260px] bg-white border border-[#e6e6ee] rounded-[11px] shadow-[0_14px_34px_rgba(20,20,40,0.18)] z-[10] overflow-hidden"
      >
        <div className="p-[10px_12px_6px] font-bold text-xs text-[#5c5d6e]">{title}</div>
        <div className="max-h-[260px] overflow-y-auto px-[6px] py-[2px]">
          {PRESETS.map((p) => {
            const disabled = usedAspectIds.has(p.id);
            const hovered = !disabled && hoveredPresetId === p.id;
            return (
              <button
                key={p.id}
                disabled={disabled}
                onClick={() => onConfirm({ id: p.id, w: p.w, h: p.h })}
                onMouseEnter={() => setHoveredPresetId(p.id)}
                onMouseLeave={() => setHoveredPresetId((cur) => (cur === p.id ? null : cur))}
                className={cn(
                  'block w-full text-left p-2 rounded-[7px] border-none text-xs font-semibold transition-colors duration-100',
                  disabled ? 'text-[#c9c9d3] cursor-default' : hovered ? 'text-[#26262e] cursor-pointer' : 'text-[#26262e] cursor-pointer'
                )}
                style={{
                  background: hovered ? '#f4f5f9' : 'transparent',
                }}
              >
                {p.label}
                {disabled && <span className="ml-[6px] font-normal text-[10.5px]">(đã dùng)</span>}
              </button>
            );
          })}
        </div>
        <div className="border-t border-[#f0f0f5] p-[10px]">
          <div className="font-bold text-[11px] text-[#9a9bab] mb-[6px] uppercase tracking-[.04em]">Tuỳ chỉnh</div>
          <div className="flex gap-[6px] items-center">
            <input
              type="number"
              min={1}
              placeholder="W"
              value={customW}
              onChange={(e) => setCustomW(e.target.value)}
              className="w-0 flex-1 border border-[#e6e6ee] rounded-[7px] p-[6px_8px] text-xs"
            />
            <span className="text-[#9a9bab] text-xs">:</span>
            <input
              type="number"
              min={1}
              placeholder="H"
              value={customH}
              onChange={(e) => setCustomH(e.target.value)}
              className="w-0 flex-1 border border-[#e6e6ee] rounded-[7px] p-[6px_8px] text-xs"
            />
            <button
              onClick={confirmCustom}
              disabled={!customValid || customUsed}
              className={cn(
                'p-[6px_12px] rounded-[7px] border-none font-bold text-[11.5px]',
                !customValid || customUsed ? 'bg-[#e6e6ee] text-[#9a9bab] cursor-default' : 'bg-[#4b57e6] text-white cursor-pointer hover:bg-[#3b47d6]'
              )}
            >
              {confirmLabel}
            </button>
          </div>
          {customUsed && <div className="text-[10.5px] text-[#e05656] mt-[4px]">Tỷ lệ này đã có trong layout.</div>}
        </div>
      </div>
    </>
  );
}
