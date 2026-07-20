// Test slider "Xoay" trong PropertyPanel — Bước 1 kế hoạch resize/rotate (2026-07-18).

import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LayoutDesignerApp } from './LayoutDesignerApp.js';
import type { LayoutContent } from '@sky-app/slide-shared';

function shapeContent(): LayoutContent {
  return {
    variants: [
      {
        aspect: { id: '16:9', w: 16, h: 9 },
        refW: 1920,
        refH: 1080,
        items: [{ id: 's1', type: 'shape', box: { x: 100, y: 100, w: 200, h: 200 }, shape: 'rect', fill: '#4b57e6' }],
      },
    ],
  };
}

describe('PropertyPanel — RotationControl (Section "Xoay")', () => {
  it('mặc định (không có item.box.rotation) → slider hiện 0°', () => {
    const { container } = render(<LayoutDesignerApp content={shapeContent()} />);
    fireEvent.pointerDown(container.querySelector('[style*="cursor: move"]') as HTMLElement);

    expect(screen.getByText('Xoay')).toBeTruthy();
    expect(screen.getByText('0°')).toBeTruthy();
  });

  it('kéo slider Xoay → patch box.rotation, canvas item nhận transform rotate() đúng góc', () => {
    const { container } = render(<LayoutDesignerApp content={shapeContent()} />);
    fireEvent.pointerDown(container.querySelector('[style*="cursor: move"]') as HTMLElement);

    const sliders = container.querySelectorAll('input[type="range"]');
    // Section "Xoay" đặt NGAY TRƯỚC "Độ mờ" — slider Xoay là input range gần cuối, trước slider
    // opacity cuối cùng. Tìm theo cặp label "Xoay"/"0°" để chắc chắn lấy đúng input.
    const rotationLabel = screen.getByText('Xoay');
    const rotationSection = rotationLabel.closest('div')!.parentElement!;
    const rotationSlider = rotationSection.querySelector('input[type="range"]') as HTMLInputElement;
    expect(rotationSlider).toBeTruthy();

    fireEvent.change(rotationSlider, { target: { value: '45' } });

    expect(screen.getByText('45°')).toBeTruthy();
    const itemEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    expect(itemEl.style.transform).toBe('rotate(45deg)');
    void sliders;
  });

  it('undo sau khi xoay → quay lại rotation cũ (0°, không transform)', () => {
    const { container } = render(<LayoutDesignerApp content={shapeContent()} />);
    fireEvent.pointerDown(container.querySelector('[style*="cursor: move"]') as HTMLElement);

    const rotationLabel = screen.getByText('Xoay');
    const rotationSection = rotationLabel.closest('div')!.parentElement!;
    const rotationSlider = rotationSection.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.change(rotationSlider, { target: { value: '90' } });
    expect(screen.getByText('90°')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Hoàn tác'));

    const itemEl = container.querySelector('[style*="cursor: move"]') as HTMLElement;
    expect(itemEl.style.transform).toBeFalsy();
  });
});
