export const DESIGN_LONG_EDGE = 760;

export function designSize(aspect: { w: number; h: number }): { w: number; h: number } {
  if (aspect.w >= aspect.h) {
    return { w: DESIGN_LONG_EDGE, h: (DESIGN_LONG_EDGE * aspect.h) / aspect.w };
  }
  return { w: (DESIGN_LONG_EDGE * aspect.w) / aspect.h, h: DESIGN_LONG_EDGE };
}

export function screenPointToCanvas(
  artEl: HTMLElement,
  refW: number,
  refH: number,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const rect = artEl.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const scaleX = rect.width / refW;
  const scaleY = rect.height / refH;
  return { x: (clientX - rect.left) / scaleX, y: (clientY - rect.top) / scaleY };
}
