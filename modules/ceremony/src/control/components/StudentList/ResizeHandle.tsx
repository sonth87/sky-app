import { useCallback, useRef } from 'react';

export function ResizeHandle({ onDrag }: { onDrag: (dx: number) => void }) {
  const dragging = useRef(false);
  const startX = useRef(0);
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      const onMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        onDrag(ev.clientX - startX.current);
        startX.current = ev.clientX;
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
    <span
      onMouseDown={onMouseDown}
      className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none hover:bg-muted-foreground"
    />
  );
}
