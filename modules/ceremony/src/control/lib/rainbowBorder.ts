/** Dải màu cầu vồng theo thứ tự tô dần khi viền "khép vòng" (đỏ → cam → vàng → lục → lam → tím). */
const RAINBOW_COLORS = [
  'rgb(239, 68, 68)',   // đỏ
  'rgb(249, 115, 22)',  // cam
  'rgb(234, 179, 8)',   // vàng
  'rgb(34, 197, 94)',   // lục
  'rgb(59, 130, 246)',  // lam
  'rgb(139, 92, 246)',  // tím
];

export interface RainbowBorderVisual {
  /** Nền conic-gradient cho lớp ngoài (outer) — card thật (inner) đè lên trên, chỉ hở viền mỏng */
  gradient: string;
  glowBoxShadow: string;
}

/**
 * progress: 0 → 1 (đã trôi qua). Vẽ viền khép dần từ 0° như kim đồng hồ, đoạn đã khép
 * tô theo dải cầu vồng, phần chưa tới để mờ. Kèm glow tăng dần theo progress.
 */
export function rainbowBorderVisual(progress: number): RainbowBorderVisual {
  const angle = Math.max(0, Math.min(1, progress)) * 360;
  const n = RAINBOW_COLORS.length;
  const stops = RAINBOW_COLORS
    .map((color, i) => `${color} ${(angle * i) / (n - 1)}deg`)
    .join(', ');
  const gradient = `conic-gradient(from 0deg, ${stops}, rgba(148, 163, 184, 0.35) ${angle}deg, rgba(148, 163, 184, 0.35) 360deg)`;
  const p = Math.max(0, Math.min(1, progress));
  const glow = p * 0.7; // tăng dần theo viền đã khép, gần 0 lúc bắt đầu, mạnh nhất lúc khép kín

  return {
    gradient,
    glowBoxShadow: `0 0 ${8 + glow * 14}px rgba(139, 92, 246, ${glow})`,
  };
}
