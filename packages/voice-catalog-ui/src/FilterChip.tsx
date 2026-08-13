import { useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

export interface FilterChipProps {
  label: string;
  value: string | null;
  options: string[];
  onChange: (value: string | null) => void;
  /** Format giá trị hiển thị (vd viết hoa chữ cái đầu, dịch) — mặc định hiện nguyên văn. */
  formatOption?: (value: string) => string;
}

/** 1 chip filter dạng "+ Label" khi chưa chọn, "Label: value ×" khi đã chọn — mở popover chọn 1 giá trị. */
export function FilterChip({ label, value, options, onChange, formatOption }: FilterChipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const format = formatOption ?? ((v: string) => v);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  if (options.length === 0) return null;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={
          value
            ? 'flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/15'
            : 'flex items-center gap-1 rounded-full border border-border bg-transparent px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted'
        }
      >
        {value ? (
          <>
            <span>{label}: {format(value)}</span>
            <X
              size={12}
              onClick={(e) => { e.stopPropagation(); onChange(null); }}
              className="opacity-70 hover:opacity-100"
            />
          </>
        ) : (
          <>
            <span>+ {label}</span>
            <ChevronDown size={12} />
          </>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-48 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => { onChange(opt === value ? null : opt); setOpen(false); }}
              className={
                opt === value
                  ? 'block w-full rounded px-2 py-1.5 text-left text-xs font-medium bg-primary/10 text-primary'
                  : 'block w-full rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-muted'
              }
            >
              {format(opt)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
