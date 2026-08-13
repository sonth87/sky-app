// SHAPE_CLIP_PATHS — CSS clip-path cho ShapeItem.shape chưa có style riêng (triangle/diamond).
// 'rect'/'circle' dùng borderRadius (rẻ hơn clip-path, không đổi). 'line'/'frame' có cấu trúc
// render riêng (không phải "cắt hình" mà là "vẽ 1 đường"/"chỉ viền không fill"), xử lý tại chỗ
// gọi (renderer.tsx/ItemContent.tsx), không nằm trong map này. Dùng CHUNG ở CẢ renderer.tsx
// (runtime backdrop thật) VÀ Canvas/ItemContent.tsx (preview lúc thiết kế) — tránh định nghĩa
// 2 lần lệch nhau (GĐ10, phát hiện 2026-08-06: renderer.tsx thiếu hẳn xử lý line/frame mà
// ItemContent.tsx đã có từ trước — bug WYSIWYG editor-vs-runtime).
import type { ShapeItem } from './types.js';

export const SHAPE_CLIP_PATHS: Partial<Record<ShapeItem['shape'], string>> = {
  triangle: 'polygon(50% 0%, 0% 100%, 100% 100%)',
  diamond: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
};
