import { useCallback, useRef } from 'react';
import { cn } from '@sky-app/ui';

interface VerticalResizeHandleProps {
  /** Giá trị hiện tại (px) của khu vực phía trên — đọc lúc pointerdown để làm mốc tính toán,
   * tránh cộng dồn sai khi `onResize` gọi nhiều lần trong 1 lượt kéo (mỗi lần nhận độ lệch tích
   * luỹ từ điểm bắt đầu, không phải delta từng frame). */
  getStartValue: () => number;
  /** `nextValue` = giá trị mới của khu vực phía trên, đã cộng độ lệch kéo — cha tự clamp min/max. */
  onResize: (nextValue: number) => void;
}

/** Thanh chia mỏng giữa 2 khu vực xếp dọc — kéo để đổi chiều cao khu vực phía trên.
 * `cursor-row-resize` + vùng bấm rộng hơn vạch hiển thị (dễ bấm trúng hơn trên trackpad). */
export function VerticalResizeHandle({ getStartValue, onResize }: VerticalResizeHandleProps) {
  const startYRef = useRef(0);
  const startValueRef = useRef(0);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      startYRef.current = e.clientY;
      startValueRef.current = getStartValue();
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        onResize(startValueRef.current + (moveEvent.clientY - startYRef.current));
      };
      const handlePointerUp = () => {
        target.releasePointerCapture(e.pointerId);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    },
    [getStartValue, onResize],
  );

  return (
    <div
      onPointerDown={handlePointerDown}
      className="group relative flex h-2 flex-none cursor-row-resize items-center justify-center"
    >
      <div
        className={cn(
          'h-px w-full bg-border transition-colors',
          'group-hover:bg-primary/50 group-active:bg-primary',
        )}
      />
    </div>
  );
}
