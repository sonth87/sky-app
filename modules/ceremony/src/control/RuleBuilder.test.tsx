// RuleBuilder — Giai đoạn 4b kế hoạch Event.

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { LayoutSelector } from '@sky-app/slide-shared';
import './i18n.js';
import { RuleBuilder } from './RuleBuilder.js';

function emptySelector(): LayoutSelector {
  return { groups: [{ rules: [{ attr: '', op: 'equals', val: '' }] }], priority: 0 };
}

describe('RuleBuilder', () => {
  it('thêm rule vào 1 khối gọi onChange với rules mới', () => {
    const onChange = vi.fn();
    render(<RuleBuilder selector={emptySelector()} onChange={onChange} attrSuggestions={[]} />);

    fireEvent.click(screen.getByText('+ Thêm điều kiện'));

    expect(onChange).toHaveBeenCalledWith({
      groups: [{ rules: [{ attr: '', op: 'equals', val: '' }, { attr: '', op: 'equals', val: '' }] }],
      priority: 0,
    });
  });

  it('thêm nhóm HOẶC gọi onChange với groups mới', () => {
    const onChange = vi.fn();
    render(<RuleBuilder selector={emptySelector()} onChange={onChange} attrSuggestions={[]} />);

    fireEvent.click(screen.getByText('+ Thêm nhóm HOẶC'));

    expect(onChange).toHaveBeenCalledWith({
      groups: [{ rules: [{ attr: '', op: 'equals', val: '' }] }, { rules: [{ attr: '', op: 'equals', val: '' }] }],
      priority: 0,
    });
  });

  it('đổi attr/op/val cập nhật đúng rule tương ứng', () => {
    const onChange = vi.fn();
    render(<RuleBuilder selector={emptySelector()} onChange={onChange} attrSuggestions={[]} />);

    fireEvent.change(screen.getByPlaceholderText('Thuộc tính (VD: gpa)'), { target: { value: 'gpa' } });
    expect(onChange).toHaveBeenLastCalledWith({
      groups: [{ rules: [{ attr: 'gpa', op: 'equals', val: '' }] }],
      priority: 0,
    });
  });

  it('xoá rule cuối cùng của khối → khối còn rules rỗng (không tự xoá khối)', () => {
    const onChange = vi.fn();
    render(<RuleBuilder selector={emptySelector()} onChange={onChange} attrSuggestions={[]} />);

    fireEvent.click(screen.getByLabelText('Xoá điều kiện'));

    expect(onChange).toHaveBeenCalledWith({ groups: [{ rules: [] }], priority: 0 });
  });

  it('có ≥2 khối mới hiện nút xoá khối, chỉ 1 khối thì ẩn', () => {
    render(<RuleBuilder selector={emptySelector()} onChange={() => {}} attrSuggestions={[]} />);
    expect(screen.queryByText('Xoá nhóm')).toBeNull();

    const twoGroups: LayoutSelector = { groups: [{ rules: [] }, { rules: [] }], priority: 0 };
    render(<RuleBuilder selector={twoGroups} onChange={() => {}} attrSuggestions={[]} />);
    expect(screen.getAllByText('Xoá nhóm').length).toBeGreaterThan(0);
  });

  it('gợi ý attr hiện trong datalist khi có attrSuggestions', () => {
    render(<RuleBuilder selector={emptySelector()} onChange={() => {}} attrSuggestions={['gpa', 'gender']} />);
    const input = screen.getByPlaceholderText('Thuộc tính (VD: gpa)');
    const listId = input.getAttribute('list');
    expect(listId).toBeTruthy();
    const datalist = document.getElementById(listId!);
    expect(datalist?.querySelectorAll('option').length).toBe(2);
  });
});
