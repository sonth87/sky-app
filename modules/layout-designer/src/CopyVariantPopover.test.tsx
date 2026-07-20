import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CopyVariantPopover } from './CopyVariantPopover.js';
import type { LayoutVariant } from '@sky-app/slide-shared';

function variant(aspectId: string, w: number, h: number, items: LayoutVariant['items'] = []): LayoutVariant {
  return { aspect: { id: aspectId, w, h }, refW: w * 100, refH: h * 100, items };
}

describe('CopyVariantPopover — chọn nguồn + chế độ copy', () => {
  it('hiện đúng danh sách variant nguồn, LOẠI TRỪ chính variant đích', () => {
    render(
      <CopyVariantPopover
        variants={[variant('16:9', 16, 9), variant('4:3', 4, 3), variant('21:9', 21, 9)]}
        targetVariantId="4:3"
        onClose={() => {}}
        onConfirm={() => {}}
      />,
    );
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    const optionValues = [...select.options].map((o) => o.value);
    expect(optionValues).toEqual(['16:9', '21:9']); // không có 4:3 (chính nó)
  });

  it('chọn chế độ "chỉ thêm cái chưa có" rồi bấm Copy → gọi onConfirm đúng tham số', () => {
    const onConfirm = vi.fn();
    render(<CopyVariantPopover variants={[variant('16:9', 16, 9), variant('4:3', 4, 3)]} targetVariantId="4:3" onClose={() => {}} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByText('Copy'));
    expect(onConfirm).toHaveBeenCalledWith('16:9', 'add-missing');
  });

  it('chọn chế độ "cập nhật nội dung cái đã có" → gọi onConfirm đúng mode', () => {
    const onConfirm = vi.fn();
    render(<CopyVariantPopover variants={[variant('16:9', 16, 9), variant('4:3', 4, 3)]} targetVariantId="4:3" onClose={() => {}} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByText('Cập nhật nội dung cái đã có'));
    fireEvent.click(screen.getByText('Copy'));
    expect(onConfirm).toHaveBeenCalledWith('16:9', 'overwrite-existing');
  });

  it('chế độ "ghi đè toàn bộ", đích CÓ item (không rỗng) và KHÔNG khoá → chỉ cần confirm 1 lớp', () => {
    const onConfirm = vi.fn();
    const targetWithItem = variant('4:3', 4, 3, [{ id: 't1', type: 'text', box: { x: 0, y: 0, w: 10, h: 10 }, content: 'A', fontSize: 12 }]);
    render(<CopyVariantPopover variants={[variant('16:9', 16, 9), targetWithItem]} targetVariantId="4:3" onClose={() => {}} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByText('Ghi đè toàn bộ'));
    fireEvent.click(screen.getByText('Copy'));
    expect(screen.getByText('Ghi đè toàn bộ tỷ lệ này?')).toBeTruthy(); // confirm lớp 1

    fireEvent.click(screen.getByText('Ghi đè'));
    expect(onConfirm).toHaveBeenCalledWith('16:9', 'overwrite-all', 'skip-locked');
    expect(screen.queryByText('Có phần tử đang khoá')).toBeNull(); // KHÔNG có confirm lớp 2
  });

  it('chế độ "ghi đè toàn bộ", đích TRỐNG HOÀN TOÀN (chưa có item nào) → BỎ QUA confirm, gọi onConfirm NGAY (chốt 2026-07-18: "nếu tỷ lệ A chưa có comp nào... thì cho copy tất cả từ B mà không cần hỏi")', () => {
    const onConfirm = vi.fn();
    render(<CopyVariantPopover variants={[variant('16:9', 16, 9), variant('4:3', 4, 3, [])]} targetVariantId="4:3" onClose={() => {}} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByText('Ghi đè toàn bộ'));
    fireEvent.click(screen.getByText('Copy'));

    // KHÔNG hiện bất kỳ bước confirm nào — gọi onConfirm ngay lập tức.
    expect(screen.queryByText('Ghi đè toàn bộ tỷ lệ này?')).toBeNull();
    expect(onConfirm).toHaveBeenCalledWith('16:9', 'overwrite-all', 'skip-locked');
  });

  it('chế độ "ghi đè toàn bộ", đích CÓ item khoá → cần confirm 2 lớp, hỏi chiến lược khoá', () => {
    const onConfirm = vi.fn();
    const lockedTarget = variant('4:3', 4, 3, [{ id: 't1', type: 'text', box: { x: 0, y: 0, w: 10, h: 10 }, content: 'A', fontSize: 12, syncLocked: true }]);
    render(<CopyVariantPopover variants={[variant('16:9', 16, 9), lockedTarget]} targetVariantId="4:3" onClose={() => {}} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByText('Ghi đè toàn bộ'));
    fireEvent.click(screen.getByText('Copy'));
    fireEvent.click(screen.getByText('Ghi đè'));

    expect(screen.getByText('Có phần tử đang khoá')).toBeTruthy(); // confirm lớp 2 xuất hiện

    fireEvent.click(screen.getByText('Chỉ ghi đè phần tử CHƯA khoá'));
    expect(onConfirm).toHaveBeenCalledWith('16:9', 'overwrite-all', 'skip-locked');
  });

  it('confirm lớp 2 — chọn "ghi đè cả khoá" → gọi đúng lockStrategy', () => {
    const onConfirm = vi.fn();
    const lockedTarget = variant('4:3', 4, 3, [{ id: 't1', type: 'text', box: { x: 0, y: 0, w: 10, h: 10 }, content: 'A', fontSize: 12, syncLocked: true }]);
    render(<CopyVariantPopover variants={[variant('16:9', 16, 9), lockedTarget]} targetVariantId="4:3" onClose={() => {}} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByText('Ghi đè toàn bộ'));
    fireEvent.click(screen.getByText('Copy'));
    fireEvent.click(screen.getByText('Ghi đè'));
    fireEvent.click(screen.getByText('Ghi đè cả phần tử đã khoá'));

    expect(onConfirm).toHaveBeenCalledWith('16:9', 'overwrite-all', 'overwrite-locked');
  });

  it('không có variant nguồn nào khác (chỉ 1 variant) → hiện thông báo, không có nút Copy', () => {
    render(<CopyVariantPopover variants={[variant('4:3', 4, 3)]} targetVariantId="4:3" onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText('Chưa có tỷ lệ nào khác để copy.')).toBeTruthy();
    expect(screen.queryByText('Copy')).toBeNull();
  });
});
