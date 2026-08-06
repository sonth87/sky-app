// IconToggleButton/IconToggleGroup — nút icon dạng toggle dùng chung cho Property Panel (GĐ10,
// docs/roadmap/plans/canva-ux/01-icon-foundation-and-shape-fix.md) — thay cho mỗi file Controls
// tự viết btnClass/glyph thô riêng. IconToggleGroup = radio (chọn-1-trong-N, loại trừ nhau);
// toggle ĐỘC LẬP (Bold/Italic bật/tắt riêng) dùng nhiều IconToggleButton rời, KHÔNG bọc trong
// IconToggleGroup (component đó chỉ dành cho lựa chọn loại trừ nhau).
import type { LucideIcon } from 'lucide-react';
import { cn } from '../cn.js';

export interface IconToggleButtonProps {
  icon: LucideIcon;
  active?: boolean;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  /** Hiện label TRƯỚC icon khi khái niệm khó truyền tải chỉ bằng icon (VD "Khi tràn khung"'s
   * Xuống dòng/Co chữ/Cắt) — mặc định không có, icon-only. */
  label?: string;
}

export function IconToggleButton({ icon: Icon, active, onClick, title, disabled, label }: IconToggleButtonProps) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-[6px] h-8 rounded-[7px] border cursor-pointer transition-colors',
        label ? 'flex-1 px-[10px] text-[11px] font-medium' : 'w-8',
        active ? 'border-[#4b57e6] bg-[#4b57e6]/10 text-[#4b57e6]' : 'border-[#e6e6ee] bg-[#fcfcfd] text-[#5c5d6e] hover:bg-[#f4f5f9]',
        disabled && 'opacity-40 cursor-not-allowed hover:bg-[#fcfcfd]',
      )}
    >
      <Icon size={label ? 13 : 15} />
      {label}
    </button>
  );
}

export interface IconToggleOption<T extends string> {
  value: T;
  icon: LucideIcon;
  title: string;
  label?: string;
}

export interface IconToggleGroupProps<T extends string> {
  options: IconToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function IconToggleGroup<T extends string>({ options, value, onChange }: IconToggleGroupProps<T>) {
  return (
    <div className="flex gap-[7px]">
      {options.map((opt) => (
        <IconToggleButton
          key={opt.value}
          icon={opt.icon}
          title={opt.title}
          label={opt.label}
          active={value === opt.value}
          onClick={() => onChange(opt.value)}
        />
      ))}
    </div>
  );
}
