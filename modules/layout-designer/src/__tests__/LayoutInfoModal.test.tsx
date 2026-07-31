import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LayoutInfoModal } from '../components/LayoutInfoModal.js';

describe('LayoutInfoModal', () => {
  it('điền sẵn giá trị initial vào các field', () => {
    render(
      <LayoutInfoModal
        initial={{ name: 'Layout A', description: 'Mô tả A', category: 'Trao bằng', tags: ['2026', 'xuất sắc'] }}
        onClose={() => {}}
        onSave={() => {}}
      />,
    );
    expect(screen.getByDisplayValue('Layout A')).toBeTruthy();
    expect(screen.getByDisplayValue('Mô tả A')).toBeTruthy();
    expect(screen.getByDisplayValue('Trao bằng')).toBeTruthy();
    expect(screen.getByText('2026')).toBeTruthy();
    expect(screen.getByText('xuất sắc')).toBeTruthy();
  });

  it('gõ tag rồi nhấn Enter → thêm chip mới, ô nhập rỗng lại', () => {
    render(<LayoutInfoModal initial={{ name: 'Layout A', tags: [] }} onClose={() => {}} onSave={() => {}} />);
    const input = screen.getByPlaceholderText('Gõ rồi nhấn Enter để thêm thẻ');
    fireEvent.change(input, { target: { value: 'mới' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByText('mới')).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('gõ dấu phẩy → cũng thêm chip (không cần Enter)', () => {
    render(<LayoutInfoModal initial={{ name: 'Layout A', tags: [] }} onClose={() => {}} onSave={() => {}} />);
    const input = screen.getByPlaceholderText('Gõ rồi nhấn Enter để thêm thẻ');
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.keyDown(input, { key: ',' });

    expect(screen.getByText('abc')).toBeTruthy();
  });

  it('không thêm chip trùng lặp', () => {
    render(<LayoutInfoModal initial={{ name: 'Layout A', tags: ['2026'] }} onClose={() => {}} onSave={() => {}} />);
    const input = screen.getByPlaceholderText('') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2026' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getAllByText('2026').length).toBe(1);
  });

  it('click × trên 1 chip → xoá đúng chip đó, giữ nguyên chip khác', () => {
    render(<LayoutInfoModal initial={{ name: 'Layout A', tags: ['2026', 'xuất sắc'] }} onClose={() => {}} onSave={() => {}} />);
    fireEvent.click(screen.getByLabelText('Xoá thẻ 2026'));

    expect(screen.queryByText('2026')).toBeNull();
    expect(screen.getByText('xuất sắc')).toBeTruthy();
  });

  it('Backspace khi ô nhập rỗng → xoá chip CUỐI CÙNG', () => {
    render(<LayoutInfoModal initial={{ name: 'Layout A', tags: ['a', 'b'] }} onClose={() => {}} onSave={() => {}} />);
    const input = screen.getByPlaceholderText('') as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'Backspace' });

    expect(screen.queryByText('b')).toBeNull();
    expect(screen.getByText('a')).toBeTruthy();
  });

  it('nút Lưu bị disable khi tên rỗng', () => {
    render(<LayoutInfoModal initial={{ name: '', tags: [] }} onClose={() => {}} onSave={() => {}} />);
    expect(screen.getByText('Lưu').closest('button')).toBeDisabled();
  });

  it('bấm Lưu → gọi onSave với đúng dữ liệu đã sửa (name trim, description/category rỗng → undefined)', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<LayoutInfoModal initial={{ name: 'Layout A', description: 'cũ', category: 'cũ', tags: ['x'] }} onClose={() => {}} onSave={onSave} />);

    fireEvent.change(screen.getByDisplayValue('Layout A'), { target: { value: '  Tên mới  ' } });
    fireEvent.change(screen.getByPlaceholderText('Mô tả (tuỳ chọn)'), { target: { value: '  ' } }); // toàn khoảng trắng
    fireEvent.change(screen.getByPlaceholderText('VD: Trao bằng, Khen thưởng...'), { target: { value: '' } });

    fireEvent.click(screen.getByText('Lưu'));

    expect(onSave).toHaveBeenCalledWith({ name: 'Tên mới', description: undefined, category: undefined, tags: ['x'] });
  });

  it('bấm Huỷ → gọi onClose', () => {
    const onClose = vi.fn();
    render(<LayoutInfoModal initial={{ name: 'Layout A', tags: [] }} onClose={onClose} onSave={() => {}} />);
    fireEvent.click(screen.getByText('Huỷ'));
    expect(onClose).toHaveBeenCalled();
  });
});
