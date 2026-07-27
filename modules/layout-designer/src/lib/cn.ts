import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes + conditional class logic — dùng thay thế cho inline
 * style ở các phần CỐ ĐỊNH (structural layout, padding, gap, border, color
 * tokens). Các giá trị ĐỘNG (item.box.x * scaleX, item.color, rotation...) vẫn
 * dùng `style={{}}` trực tiếp vì Tailwind static class không thể biểu diễn.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
