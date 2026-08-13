// Snap + Helper-line — module thuần tính toán (không UI), theo 23-editor-core-architecture.md
// §2.4. Cho vị trí item đang kéo + các item khác + biên canvas → trả vị trí đã "hít" (snap) +
// danh sách đường gióng (Guide) để UI vẽ.

import type { Box } from '@sky-app/slide-shared';

export interface Guide {
  axis: 'x' | 'y';
  /** Toạ độ đường gióng, px trên canvas chuẩn (cùng hệ với Box). */
  position: number;
}

export interface SnapResult {
  snappedBox: Box;
  guides: Guide[];
}

interface Edges {
  left: number;
  centerX: number;
  right: number;
  top: number;
  centerY: number;
  bottom: number;
}

function edgesOf(box: Box): Edges {
  return {
    left: box.x,
    centerX: box.x + box.w / 2,
    right: box.x + box.w,
    top: box.y,
    centerY: box.y + box.h / 2,
    bottom: box.y + box.h,
  };
}

/**
 * Snap theo: cạnh/tâm của các item khác (`others`), tâm canvas, mép canvas. Lưới (grid) để
 * dành cho sub-bước sau nếu cần — chưa bắt buộc theo DoD hiện tại.
 * `threshold`: khoảng cách px (canvas chuẩn) để 1 cạnh được coi là "đủ gần" mà hít vào.
 */
export function computeSnap(dragBox: Box, others: Box[], canvas: { w: number; h: number }, threshold: number): SnapResult {
  const dragEdges = edgesOf(dragBox);
  const guides: Guide[] = [];

  const candidatesX = [
    ...others.map((b) => edgesOf(b).left),
    ...others.map((b) => edgesOf(b).centerX),
    ...others.map((b) => edgesOf(b).right),
    0,
    canvas.w / 2,
    canvas.w,
  ];
  const candidatesY = [
    ...others.map((b) => edgesOf(b).top),
    ...others.map((b) => edgesOf(b).centerY),
    ...others.map((b) => edgesOf(b).bottom),
    0,
    canvas.h / 2,
    canvas.h,
  ];

  const { offset: offsetX, guide: guideX } = bestSnapOffset(
    [dragEdges.left, dragEdges.centerX, dragEdges.right],
    candidatesX,
    threshold,
  );
  const { offset: offsetY, guide: guideY } = bestSnapOffset(
    [dragEdges.top, dragEdges.centerY, dragEdges.bottom],
    candidatesY,
    threshold,
  );

  if (guideX != null) guides.push({ axis: 'x', position: guideX });
  if (guideY != null) guides.push({ axis: 'y', position: guideY });

  return {
    snappedBox: { ...dragBox, x: dragBox.x + offsetX, y: dragBox.y + offsetY },
    guides,
  };
}

/** Trong các cạnh của box đang kéo (`dragValues`), tìm cạnh nào gần 1 candidate nhất trong threshold. */
function bestSnapOffset(dragValues: number[], candidates: number[], threshold: number): { offset: number; guide: number | null } {
  let bestDiff = threshold;
  let bestOffset = 0;
  let bestGuide: number | null = null;

  for (const dragValue of dragValues) {
    for (const candidate of candidates) {
      const diff = Math.abs(dragValue - candidate);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestOffset = candidate - dragValue;
        bestGuide = candidate;
      }
    }
  }

  return { offset: bestOffset, guide: bestGuide };
}
