// Rail — 6 icon nhóm bên trái, theo prototype "Backdrop Editor 2a - keo tha.dc.html" §RAIL.
// GĐ10 (2026-08-06) — đổi glyph Unicode thô sang icon lucide-react thật (dọn icon debt). Cấu
// trúc 6 tab (comp/tpl/coll/var/img/layers) GIỮ NGUYÊN ở phase này — đổi thành 8 tab kiểu Canva
// (Mẫu/Văn bản/Media/Đồ họa/Khung/Lưới/Biến/Lớp) thuộc GĐ19 (docs/roadmap/plans/canva-ux/
// 10-rail-assembly.md), phụ thuộc các thư viện nội dung GĐ14-18 xây trước.

import { PanelLeftClose, LayoutTemplate, Sparkles, Variable, Image, Layers, Shapes, type LucideIcon } from 'lucide-react';
import { cn } from '@sky-app/ui';

export type RailGroup = 'comp' | 'tpl' | 'coll' | 'var' | 'img' | 'layers';

const GROUPS: { key: RailGroup; icon: LucideIcon; label: string }[] = [
  { key: 'comp', icon: Shapes, label: 'Thành phần' },
  { key: 'tpl', icon: LayoutTemplate, label: 'Mẫu' },
  { key: 'coll', icon: Sparkles, label: 'Bộ sưu tập' },
  { key: 'var', icon: Variable, label: 'Biến' },
  { key: 'img', icon: Image, label: 'Ảnh' },
  { key: 'layers', icon: Layers, label: 'Lớp' },
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
      <div className="flex-1 flex flex-col">
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
                  on ? 'bg-[#4b57e6]/10' : 'bg-transparent'
                )}
              >
                <g.icon size={18} />
              </span>
              {g.label}
            </div>
          );
        })}
      </div>
      {onToggleVisible && (
        <button
          onClick={onToggleVisible}
          aria-label="Ẩn palette"
          className="self-center mt-[6px] w-[26px] h-[26px] rounded-[7px] border border-[#e6e6ee] bg-transparent text-[#9a9bab] flex items-center justify-center cursor-pointer hover:bg-neutral-50"
        >
          <PanelLeftClose size={13} />
        </button>
      )}
    </div>
  );
}
