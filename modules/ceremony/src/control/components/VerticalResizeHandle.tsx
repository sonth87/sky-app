import { useCallback, useRef } from 'react';

/** Thanh kéo mỏng theo trục Y — kéo lên để tăng chiều cao, kéo xuống để giảm. */
export function VerticalResizeHandle({ onDrag }: { onDrag: (dy: number) => void }) {
  const dragging = useRef(false);
  const startY = useRef(0);
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startY.current = e.clientY;
      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        onDrag(ev.clientY - startY.current);
        startY.current = ev.clientY;
      };
      const onUp = () => {
        dragging.current = false;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [onDrag],
  );
  return (
    <div
      onMouseDown={onMouseDown}
      className="group relative h-1.5 shrink-0 cursor-row-resize select-none bg-border/60 hover:bg-info transition-colors"
    >
      <div className="absolute left-1/2 top-1/2 h-1 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground/40 group-hover:bg-info-foreground/80 transition-colors" />
    </div>
  );
}
