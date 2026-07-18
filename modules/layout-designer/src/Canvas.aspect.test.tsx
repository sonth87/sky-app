// Test khung hiển thị Canvas LUÔN đúng tỷ lệ variant.aspect (đổi 2026-07-18 — trước đó canvas
// cố định 760×428 bất kể variant tỷ lệ gì, bug đã sửa: xem Canvas.tsx's designSize()).

import { beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { LayoutDesignerApp } from './LayoutDesignerApp.js';
import type { LayoutContent } from '@sky-app/slide-shared';

function getArtEl(container: HTMLElement) {
  return container.querySelector('[data-testid="canvas-frame"]') as HTMLElement;
}

function contentWithAspect(aspectW: number, aspectH: number): LayoutContent {
  return {
    variants: [{ aspect: { id: `${aspectW}:${aspectH}`, w: aspectW, h: aspectH }, refW: aspectW * 100, refH: aspectH * 100, items: [] }],
  };
}

describe('Canvas — khung hiển thị LUÔN đúng tỷ lệ variant.aspect (cạnh dài=760, cạnh còn lại tự tính)', () => {
  it('variant 16:9 (ngang) → khung 760×427.5 (760 là cạnh dài/ngang)', () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { value: 2000, configurable: true });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { value: 2000, configurable: true });
    const { container } = render(<LayoutDesignerApp content={contentWithAspect(16, 9)} />);
    const artEl = getArtEl(container);
    expect(parseFloat(artEl.style.width)).toBe(760);
    expect(parseFloat(artEl.style.height)).toBeCloseTo(427.5, 5);
  });

  it('variant 4:3 (ngang, ít dẹt hơn) → khung 760×570', () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { value: 2000, configurable: true });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { value: 2000, configurable: true });
    const { container } = render(<LayoutDesignerApp content={contentWithAspect(4, 3)} />);
    const artEl = getArtEl(container);
    expect(parseFloat(artEl.style.width)).toBe(760);
    expect(parseFloat(artEl.style.height)).toBeCloseTo(570, 5);
  });

  it('variant 9:16 (DỌC — điện thoại) → cạnh DỌC là 760, cạnh ngang tự co còn 427.5', () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { value: 2000, configurable: true });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { value: 2000, configurable: true });
    const { container } = render(<LayoutDesignerApp content={contentWithAspect(9, 16)} />);
    const artEl = getArtEl(container);
    expect(parseFloat(artEl.style.width)).toBeCloseTo(427.5, 5);
    expect(parseFloat(artEl.style.height)).toBe(760);
  });

  it('variant 1:1 (vuông) → khung 760×760', () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { value: 2000, configurable: true });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { value: 2000, configurable: true });
    const { container } = render(<LayoutDesignerApp content={contentWithAspect(1, 1)} />);
    const artEl = getArtEl(container);
    expect(parseFloat(artEl.style.width)).toBe(760);
    expect(parseFloat(artEl.style.height)).toBe(760);
  });
});
