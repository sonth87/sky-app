// Viewport (zoom/pan) — thuần tính toán, theo 23-editor-core-architecture.md §2.5. Toạ độ item
// vẫn là px trên canvas chuẩn (refW/refH) — zoom/pan chỉ biến đổi HIỂN THỊ, KHÔNG đổi dữ liệu item.

import type { Viewport } from './state.js';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * Zoom quanh 1 điểm neo (thường là vị trí con trỏ, tính theo px màn hình trong khung canvas) —
 * điểm neo phải giữ nguyên vị trí trên màn hình sau khi zoom (không "nhảy" theo tâm canvas).
 */
export function zoomAt(viewport: Viewport, anchor: { x: number; y: number }, factor: number): Viewport {
  const nextZoom = clampZoom(viewport.zoom * factor);
  const actualFactor = nextZoom / viewport.zoom;
  return {
    zoom: nextZoom,
    panX: anchor.x - (anchor.x - viewport.panX) * actualFactor,
    panY: anchor.y - (anchor.y - viewport.panY) * actualFactor,
  };
}

export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return { ...viewport, panX: viewport.panX + dx, panY: viewport.panY + dy };
}

export function resetViewport(): Viewport {
  return { zoom: 1, panX: 0, panY: 0 };
}

/** Toạ độ màn hình (px trong khung canvas) → toạ độ canvas chuẩn (px refW/refH, hệ của Box). */
export function screenToCanvas(viewport: Viewport, screenPoint: { x: number; y: number }): { x: number; y: number } {
  return {
    x: (screenPoint.x - viewport.panX) / viewport.zoom,
    y: (screenPoint.y - viewport.panY) / viewport.zoom,
  };
}

export function canvasToScreen(viewport: Viewport, canvasPoint: { x: number; y: number }): { x: number; y: number } {
  return {
    x: canvasPoint.x * viewport.zoom + viewport.panX,
    y: canvasPoint.y * viewport.zoom + viewport.panY,
  };
}
