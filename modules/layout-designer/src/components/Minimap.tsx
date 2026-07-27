import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { LayoutItem, LayoutVariant } from '@sky-app/slide-shared';

const MINIMAP_W = 160;
const MINIMAP_PADDING = 10;

export interface MinimapProps {
  variant: LayoutVariant;
  designW: number;
  designH: number;
  originX: number;
  originY: number;
  totalScale: number;
  containerSize: { w: number; h: number };
  onPan: (originX: number, originY: number) => void;
}

export function shouldShowMinimap(designW: number, designH: number, originX: number, originY: number, totalScale: number, containerSize: { w: number; h: number }): boolean {
  const frameLeft = originX;
  const frameTop = originY;
  const frameRight = originX + designW * totalScale;
  const frameBottom = originY + designH * totalScale;
  const fitsEntirely = frameLeft >= 0 && frameTop >= 0 && frameRight <= containerSize.w && frameBottom <= containerSize.h;
  return !fitsEntirely;
}

export function Minimap({ variant, designW, designH, originX, originY, totalScale, containerSize, onPan }: MinimapProps) {
  const minimapH = (MINIMAP_W * designH) / designW;
  const mmScale = MINIMAP_W / designW;

  const dragRef = useRef<{ startX: number; startY: number; fromOriginX: number; fromOriginY: number } | null>(null);

  const visibleLeft = (0 - originX) / totalScale;
  const visibleTop = (0 - originY) / totalScale;
  const visibleRight = (containerSize.w - originX) / totalScale;
  const visibleBottom = (containerSize.h - originY) / totalScale;

  const viewportRectStyle = {
    position: 'absolute' as const,
    left: visibleLeft * mmScale,
    top: visibleTop * mmScale,
    width: (visibleRight - visibleLeft) * mmScale,
    height: (visibleBottom - visibleTop) * mmScale,
    border: '1.5px solid var(--accent-color, #4b57e6)',
    background: 'color-mix(in srgb, var(--accent-color, #4b57e6) 12%, transparent)',
    cursor: 'grab',
    boxSizing: 'border-box' as const,
  };

  const jumpTo = useCallback(
    (mmClickX: number, mmClickY: number) => {
      const targetCanvasX = mmClickX / mmScale;
      const targetCanvasY = mmClickY / mmScale;
      const newOriginX = containerSize.w / 2 - targetCanvasX * totalScale;
      const newOriginY = containerSize.h / 2 - targetCanvasY * totalScale;
      onPan(newOriginX, newOriginY);
    },
    [mmScale, totalScale, containerSize, onPan],
  );

  const onMinimapPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      jumpTo(clickX, clickY);
      dragRef.current = { startX: e.clientX, startY: e.clientY, fromOriginX: originX, fromOriginY: originY };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [jumpTo, originX, originY],
  );

  const onMinimapPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      jumpTo(clickX, clickY);
    },
    [jumpTo],
  );

  const onMinimapPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, []);

  return (
    <div
      data-testid="minimap"
      onPointerDown={onMinimapPointerDown}
      onPointerMove={onMinimapPointerMove}
      onPointerUp={onMinimapPointerUp}
      className="absolute bg-white border border-[#e6e6ee] rounded-lg shadow-[0_6px_20px_-8px_rgba(20,10,50,0.35)] overflow-hidden cursor-pointer z-[999] touch-none"
      style={{
        right: MINIMAP_PADDING,
        bottom: MINIMAP_PADDING,
        width: MINIMAP_W,
        height: minimapH,
      }}
    >
      {variant.items.map((item) => (
        <MinimapItem key={item.id} item={item} mmScale={mmScale} />
      ))}
      <div style={viewportRectStyle} />
    </div>
  );
}

function MinimapItem({ item, mmScale }: { item: LayoutItem; mmScale: number }) {
  return (
    <div
      className="absolute bg-[#c9c9d6] rounded-[1px] pointer-events-none"
      style={{
        left: item.box.x * mmScale,
        top: item.box.y * mmScale,
        width: item.box.w * mmScale,
        height: item.box.h * mmScale,
      }}
    />
  );
}
