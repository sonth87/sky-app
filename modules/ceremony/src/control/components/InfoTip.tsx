import { useState, useRef, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';
import { usePortalContainer } from '../PortalContainerContext';

/**
 * Tooltip hover render qua PORTAL (document.body) để KHÔNG bị cắt bởi các container
 * `overflow-hidden`/`overflow-y-auto` bao quanh (modal + cột cuộn). Native `title`
 * không dùng vì trễ và hay không hiện trên span chỉ chứa SVG trong Electron.
 */
export function InfoTip({ text, children }: { text: string; children?: ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const container = usePortalContainer();

  const open = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Đặt bubble ngay dưới icon, canh giữa theo icon.
      setPos({ x: r.left + r.width / 2, y: r.bottom + 6 });
    }, 120);
  }, []);

  const close = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setPos(null);
  }, []);

  return (
    <>
      <span
        ref={anchorRef}
        className="inline-flex items-center"
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
        tabIndex={0}
      >
        {children ?? (
          <span className="inline-flex cursor-help text-muted-foreground hover:text-primary">
            <HelpCircle size={13} />
          </span>
        )}
      </span>
      {pos &&
        createPortal(
          <span
            role="tooltip"
            style={{ left: pos.x, top: pos.y, transform: 'translateX(-50%)' }}
            className="pointer-events-none fixed z-[200] w-56 rounded-lg bg-foreground px-2.5 py-1.5 text-xxs font-normal leading-snug text-background shadow-xl"
          >
            {text}
          </span>,
          container ?? document.body,
        )}
    </>
  );
}
