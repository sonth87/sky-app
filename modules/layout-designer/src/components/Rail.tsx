// Rail — 8 icon nhóm bên trái, kiểu Canva (Mẫu/Văn bản/Media/Đồ họa/Khung/Lưới/Biến/Lớp), theo
// GĐ19 (docs/roadmap/plans/canva-ux/10-rail-assembly.md). Đổi từ cấu trúc 6 nhóm cũ
// (comp/tpl/coll/var/img/layers, GĐ10 2026-08-06) — "Bộ sưu tập" (coll) không còn trong danh sách
// 8-nhóm chính thức, ẩn khỏi Rail (không xoá `CollectionsPanel.tsx`, giữ phòng dùng lại sau).
// "Thành phần" (comp) tách thành 2 nhóm riêng "Văn bản" + "Đồ họa" — phần tile cơ bản (Chữ/Ảnh/
// Ribbon/Khung lặp) không có preset riêng chuyển vào đầu `GraphicsPanel.tsx`'s "Thành phần cơ
// bản". "Ảnh" (img) đổi tên hiển thị thành "Media" cho khớp thuật ngữ Canva, giữ nguyên nội dung
// (`ImagePanel.tsx`) — quản lý ảnh user upload, KHÁC "Đồ họa" (icon/hình khối cung cấp sẵn).

import { PanelLeftClose, LayoutTemplate, Type, Image, Shapes, Frame, Grid3x3, Variable, Layers, type LucideIcon } from 'lucide-react';
import { cn } from '@sky-app/ui';

export type RailGroup = 'template' | 'text' | 'media' | 'graphics' | 'frame' | 'grid' | 'var' | 'layers';

const GROUPS: { key: RailGroup; icon: LucideIcon; label: string }[] = [
  { key: 'template', icon: LayoutTemplate, label: 'Mẫu' },
  { key: 'text', icon: Type, label: 'Văn bản' },
  { key: 'media', icon: Image, label: 'Media' },
  { key: 'graphics', icon: Shapes, label: 'Đồ họa' },
  { key: 'frame', icon: Frame, label: 'Khung' },
  { key: 'grid', icon: Grid3x3, label: 'Lưới' },
  { key: 'var', icon: Variable, label: 'Biến' },
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
