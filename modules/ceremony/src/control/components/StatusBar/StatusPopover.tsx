import { useEffect, useRef, type ReactNode } from 'react';

export function StatusPopover({
  open,
  onClose,
  children,
  className = '',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      className={`absolute bottom-full mb-1 z-50 min-w-[320px] max-w-[420px] rounded-md border border-border bg-muted shadow-xl text-xs text-foreground select-text ${className}`}
    >
      {children}
    </div>
  );
}
