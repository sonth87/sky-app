import type React from 'react';

export type GradientType = 'linear' | 'radial';

export interface GradientStop {
  /** id nội bộ ổn định cho React key + để nhận diện stop đang chọn — KHÔNG xuất ra CSS. */
  id: string;
  color: string;
  /** rgba() alpha (0-100, giống UI ảnh mẫu — % không phải 0-1) — lưu riêng để hiện ô "A" trong RGBA. */
  alpha: number;
  /** Vị trí % (0-100) trên dải gradient. */
  offset: number;
}

let stopIdCounter = 0;
export function nextStopId(): string {
  stopIdCounter += 1;
  return `gstop_${stopIdCounter}`;
}

export const DEFAULT_CSS = 'linear-gradient(135deg, #201748 0%, #4b57e6 100%)';

/** Parse 1 màu CSS (#hex, #hex bỏ #, hoặc rgba(...)) → {hex, alpha 0-100}. Fail-soft: trả màu đen
 * đặc nếu không nhận diện được — KHÔNG throw, gradient CSS tự do nên không chặn parse thất bại. */
export function parseColor(raw: string): { hex: string; alpha: number } {
  const trimmed = raw.trim();
  const rgbaMatch = trimmed.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (rgbaMatch) {
    const r = Math.round(Number(rgbaMatch[1]));
    const g = Math.round(Number(rgbaMatch[2]));
    const b = Math.round(Number(rgbaMatch[3]));
    const a = rgbaMatch[4] !== undefined ? Number(rgbaMatch[4]) : 1;
    return { hex: rgbToHex(r, g, b), alpha: Math.round(a * 100) };
  }
  if (/^#?[0-9a-f]{6}$/i.test(trimmed)) {
    return { hex: trimmed.startsWith('#') ? trimmed : `#${trimmed}`, alpha: 100 };
  }
  if (/^#?[0-9a-f]{3}$/i.test(trimmed)) {
    const h = trimmed.replace('#', '');
    const hex = `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
    return { hex, alpha: 100 };
  }
  return { hex: '#000000', alpha: 100 };
}

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

export function stopToCssColor(stop: GradientStop): string {
  const { r, g, b } = hexToRgb(stop.color);
  return `rgba(${r}, ${g}, ${b}, ${(stop.alpha / 100).toFixed(2).replace(/\.?0+$/, '') || '0'})`;
}

export interface ParsedGradient {
  type: GradientType;
  angle: number;
  stops: GradientStop[];
}

/** Parse 1 CSS gradient string → {type, angle, stops}. Fail-soft TUYỆT ĐỐI: bất kỳ chuỗi không
 * nhận diện được (rỗng, không phải gradient, cú pháp lạ...) đều trả về gradient mặc định thay vì
 * throw — vì đây là input tự do trước đây (textarea CSS thô), dữ liệu cũ có thể không khớp cú
 * pháp mà regex ở đây hỗ trợ. */
export function parseGradientCss(css: string): ParsedGradient {
  const trimmed = css.trim();
  const isRadial = /^radial-gradient\(/i.test(trimmed);
  const isLinear = /^linear-gradient\(/i.test(trimmed);
  if (!isRadial && !isLinear) return parseGradientCss(DEFAULT_CSS);

  const inner = trimmed.replace(/^(linear|radial)-gradient\(/i, '').replace(/\)\s*$/, '');
  // Tách theo dấu phẩy TRÊN CÙNG CẤP (không tách trong rgba(...)) — đếm ngoặc mở/đóng.
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of inner) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());

  let angle = 135;
  let stopParts = parts;
  if (isLinear && parts.length > 0) {
    const angleMatch = parts[0]!.match(/^(-?\d+(?:\.\d+)?)deg$/i);
    if (angleMatch) {
      angle = Number(angleMatch[1]);
      stopParts = parts.slice(1);
    } else if (/^to\s+/i.test(parts[0]!)) {
      // "to right"/"to bottom right" etc — quy đổi thô về góc gần đúng, đủ dùng cho UI chỉnh tiếp.
      angle = keywordToAngle(parts[0]!);
      stopParts = parts.slice(1);
    }
  } else if (isRadial && parts.length > 0 && /^(circle|ellipse)/i.test(parts[0]!)) {
    stopParts = parts.slice(1);
  }

  if (stopParts.length === 0) return parseGradientCss(DEFAULT_CSS);

  const stops: GradientStop[] = stopParts.map((part, i) => {
    const offsetMatch = part.match(/(-?\d+(?:\.\d+)?)%\s*$/);
    const offset = offsetMatch ? Number(offsetMatch[1]) : Math.round((i / Math.max(1, stopParts.length - 1)) * 100);
    const colorPart = offsetMatch ? part.slice(0, offsetMatch.index).trim() : part.trim();
    const { hex, alpha } = parseColor(colorPart);
    return { id: nextStopId(), color: hex, alpha, offset };
  });

  return { type: isRadial ? 'radial' : 'linear', angle, stops };
}

export function keywordToAngle(keyword: string): number {
  const k = keyword.replace(/^to\s+/i, '').trim().toLowerCase();
  const map: Record<string, number> = { top: 0, 'top right': 45, right: 90, 'bottom right': 135, bottom: 180, 'bottom left': 225, left: 270, 'top left': 315 };
  return map[k] ?? 135;
}

export function buildGradientCss(g: ParsedGradient): string {
  const sorted = [...g.stops].sort((a, b) => a.offset - b.offset);
  const stopsCss = sorted.map((s) => `${stopToCssColor(s)} ${Math.round(s.offset)}%`).join(', ');
  if (g.type === 'radial') return `radial-gradient(circle, ${stopsCss})`;
  return `linear-gradient(${Math.round(g.angle)}deg, ${stopsCss})`;
}

export const labelStyle: React.CSSProperties = { display: 'block', fontSize: 10.5, color: '#9a9bab', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' };

export function numberInputStyle(width: number | undefined): React.CSSProperties {
  return {
    width,
    border: '1px solid #e6e6ee',
    borderRadius: 6,
    padding: '6px 7px',
    fontSize: 11.5,
  };
}
