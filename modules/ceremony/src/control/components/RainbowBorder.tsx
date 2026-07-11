import type { ReactNode } from 'react';
import { rainbowBorderVisual } from '../lib/rainbowBorder';

interface RainbowBorderProps {
  /** Có đang chạy hiệu ứng không (false = viền xám tĩnh mặc định) */
  active: boolean;
  /** Đã trôi qua bao nhiêu (0 → 1), mượt theo rAF */
  progress: number;
  /** className áp cho card bên trong (nền, padding nội dung...) — không cần rounded/border */
  className?: string;
  children: ReactNode;
}

/**
 * Bọc 1 card để vẽ viền cầu vồng khép dần theo kim đồng hồ + glow, bo góc đúng theo
 * card (border-image gốc không hỗ trợ border-radius). Kỹ thuật: lớp ngoài (outer) có nền
 * là conic-gradient + border-radius, lớp trong (inner, card thật) có nền đặc che kín phần
 * giữa, padding của outer = độ dày viền hở ra — giống "gradient border" cổ điển, không cần mask.
 */
export function RainbowBorder({ active, progress, className = '', children }: RainbowBorderProps) {
  if (!active) {
    return (
      <div className={`rounded-lg border border-border ${className}`}>
        {children}
      </div>
    );
  }

  const { gradient, glowBoxShadow } = rainbowBorderVisual(progress);

  return (
    <div
      className="rounded-lg p-[2px]"
      style={{ background: gradient, boxShadow: glowBoxShadow }}
    >
      <div className={`rounded-[7px] bg-card ${className}`}>
        {children}
      </div>
    </div>
  );
}
