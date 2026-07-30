// Hex<->RGB thuần, tách khỏi module-layout-designer/GradientEditor/helpers.ts (hàm đó còn có
// parseGradientCss/buildGradientCss đặc thù gradient-CSS, không generic — chỉ 2 hàm này dùng
// chung được cho ColorfulPicker/ColorfulSwatchPopover, 2026-07-29).

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, n));
  return `#${[clamp(r), clamp(g), clamp(b)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return { r, g, b };
}
