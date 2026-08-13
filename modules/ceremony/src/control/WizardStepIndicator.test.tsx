// WizardStepIndicator — Giai đoạn 4c mở rộng (2026-07-20), phát hiện qua phản hồi thật: thiếu
// thanh tiến trình trực quan khiến user tưởng nhầm các bước Layout/Ghép biến "biến mất".

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import './i18n.js';
import { WizardStepIndicator } from './WizardStepIndicator.js';

describe('WizardStepIndicator', () => {
  it('hiện đủ nhãn theo đúng thứ tự truyền vào', () => {
    render(<WizardStepIndicator labels={['Thông tin', 'Dữ liệu', 'Layout', 'Ghép biến']} currentOrdinal={1} />);
    expect(screen.getByText('Thông tin')).toBeTruthy();
    expect(screen.getByText('Dữ liệu')).toBeTruthy();
    expect(screen.getByText('Layout')).toBeTruthy();
    expect(screen.getByText('Ghép biến')).toBeTruthy();
  });

  it('bước đã qua (ordinal < currentOrdinal) hiện dấu Check, không hiện số', () => {
    const { container } = render(<WizardStepIndicator labels={['A', 'B', 'C']} currentOrdinal={3} />);
    // 2 bước đầu đã qua (A, B) → không còn text số "1"/"2" trong node tròn (thay bằng icon Check).
    expect(screen.queryByText('1')).toBeNull();
    expect(screen.queryByText('2')).toBeNull();
    // Bước hiện tại (3) vẫn hiện số.
    expect(screen.getByText('3')).toBeTruthy();
    // Có 2 icon Check (lucide-react render <svg>) cho 2 bước đã qua.
    expect(container.querySelectorAll('svg').length).toBe(2);
  });

  it('3 bước (nhánh existing/later, bỏ qua Bước Dữ liệu) vẫn render đúng không lỗi', () => {
    render(<WizardStepIndicator labels={['Thông tin', 'Layout', 'Ghép biến']} currentOrdinal={2} />);
    expect(screen.getByText('Thông tin')).toBeTruthy();
    expect(screen.getByText('Layout')).toBeTruthy();
    expect(screen.getByText('Ghép biến')).toBeTruthy();
  });
});
