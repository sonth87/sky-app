// Rail — 6 icon nhóm bên trái, theo prototype "Backdrop Editor 2a - keo tha.dc.html" §RAIL.

import { PanelLeftClose } from 'lucide-react';
import { cn } from '../lib/cn.js';

export type RailGroup = 'comp' | 'tpl' | 'coll' | 'var' | 'img' | 'layers';

const GROUPS: { key: RailGroup; icon: string; label: string }[] = [
  { key: 'comp', icon: '▦', label: 'Thành phần' },
  { key: 'tpl', icon: '▤', label: 'Mẫu' },
  { key: 'coll', icon: '❖', label: 'Bộ sưu tập' },
  { key: 'var', icon: '{ }', label: 'Biến' },
  { key: 'img', icon: '▧', label: 'Ảnh' },
  { key: 'layers', icon: '≣', label: 'Lớp' },
];

export interface RailProps {
  active: RailGroup;
  onChange: (group: RailGroup) => void;
  /** Bỏ trống = ẩn nút toggle (VD dùng Rail ở nơi khác không cần ẩn/hiện). Review 2026-07-18:
   * "palette trái cũng có nút để toggle". */
  onToggleVisible?: () => void;
}

export function Rail({ active, onChange, onToggleVisible }: RailProps) {
  return (
    <div className="w-[78px] shrink-0 border-r border-[#e6e6ee] bg-white flex flex-col py-[9px]">
      {onToggleVisible && (
        <button
          onClick={onToggleVisible}
          aria-label="Ẩn palette"
          className="self-center mb-[6px] w-[26px] h-[26px] rounded-[7px] border border-[#e6e6ee] bg-transparent text-[#9a9bab] flex items-center justify-center cursor-pointer hover:bg-neutral-50"
        >
          <PanelLeftClose size={13} />
        </button>
      )}
      {GROUPS.map((g) => {
        const on = g.key === active;
        return (
          <div
            key={g.key}
            onClick={() => onChange(g.key)}
            className={cn(
              'relative flex flex-col items-center gap-[4px] py-[9px] cursor-pointer font-semibold text-[9.5px] text-center border-l-[3px]',
              on ? 'text-[#4b57e6] border-[#4b57e6]' : 'text-[#9a9bab] border-transparent'
            )}
          >
            <span
              className={cn(
                'w-[38px] h-[38px] rounded-[11px] flex items-center justify-center',
                g.icon === '{ }' ? 'text-[13px] font-mono font-bold' : 'text-[17px] font-normal',
                on ? 'bg-[#4b57e6]/10' : 'bg-transparent'
              )}
            >
              {g.icon}
            </span>
            {g.label}
          </div>
        );
      })}
    </div>
  );
}
