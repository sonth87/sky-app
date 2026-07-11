import { useEffect, useRef, useState } from 'react';

interface ToolbarGroupProps {
  label: string;
  icon: string;
  /** Highlight button khi tính năng đang bật */
  active?: boolean;
  /** Node thường, hoặc render-prop nhận hàm close() để children chủ động đóng popover */
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
}

/** Button toolbar kiểu Excel: click mở popover bên dưới, click ngoài để đóng */
export function ToolbarGroup({ label, icon, active, children }: ToolbarGroupProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={[
          'flex select-none items-center gap-1.5 rounded px-2.5 py-1.5 text-sm font-medium transition-colors',
          active
            ? 'bg-primary/10 text-primary ring-1 ring-inset ring-indigo-200'
            : 'text-foreground hover:bg-muted',
          open ? 'ring-1 ring-inset ring-indigo-300' : '',
        ].join(' ')}
      >
        <span>{icon}</span>
        <span>{label}</span>
        <svg className="h-2.5 w-2.5 opacity-40" viewBox="0 0 10 6" fill="currentColor">
          <path d="M0 0l5 6 5-6z" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 rounded-lg border border-border bg-card shadow-lg">
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}
