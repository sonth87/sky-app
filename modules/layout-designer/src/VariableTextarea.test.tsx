import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VariableTextarea } from './VariableTextarea.js';

/** VariableTextarea là controlled component — cần state thật để userEvent.type() gõ nhiều ký tự
 * liên tiếp phản ánh đúng vào `value` prop (onChange rỗng khiến React revert lại value cũ mỗi
 * keystroke, làm caret/uptoCaret tính sai — đây là lỗi test, không phải bug component). */
function ControlledHarness({ suggestions }: { suggestions: string[] }) {
  const [value, setValue] = useState('');
  return <VariableTextarea value={value} onChange={setValue} suggestions={suggestions} />;
}

// Dùng data-testid="variable-suggestion" (không getByText thô) — jsdom coi nội dung bên trong
// <textarea> là text node con, nên getByText('@full_name') có thể khớp NHẦM vào chính giá trị
// đang gõ trong textarea thay vì item dropdown thật.
function suggestionTexts(): string[] {
  return screen.queryAllByTestId('variable-suggestion').map((el) => within(el).getByText(/^@/).textContent!);
}

describe('VariableTextarea — autocomplete khi gõ @', () => {
  it('gõ @ ở đầu dòng → hiện dropdown gợi ý', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness suggestions={['full_name', 'gpa']} />);
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, '@');
    expect(suggestionTexts()).toEqual(['@full_name', '@gpa']);
  });

  it('gõ tiếp sau @ → lọc gợi ý theo query', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness suggestions={['full_name', 'gpa']} />);
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, '@gp');
    expect(suggestionTexts()).toEqual(['@gpa']);
  });

  it('@ dính liền chữ trước (không phải đầu dòng/sau khoảng trắng) → KHÔNG hiện dropdown', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness suggestions={['full_name']} />);
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'email a@b');
    expect(screen.queryAllByTestId('variable-suggestion')).toHaveLength(0);
  });

  it('gõ @ sau khoảng trắng → hiện dropdown', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness suggestions={['full_name']} />);
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'chào @');
    expect(suggestionTexts()).toEqual(['@full_name']);
  });

  it('không có suggestion nào khớp query → không hiện dropdown', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness suggestions={['full_name']} />);
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, '@zzz_khong_ton_tai');
    expect(screen.queryAllByTestId('variable-suggestion')).toHaveLength(0);
  });
});

describe('VariableTextarea — chọn token từ dropdown', () => {
  it('click 1 gợi ý → chèn đúng @key vào đúng vị trí, đóng dropdown', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness suggestions={['full_name']} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    await user.type(textarea, '@');

    await user.click(screen.getByTestId('variable-suggestion'));
    expect(textarea.value).toBe('@full_name');
    expect(screen.queryAllByTestId('variable-suggestion')).toHaveLength(0);
  });

  it('chèn token nối đúng vào cuối nội dung đã gõ', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness suggestions={['gpa']} />);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    await user.type(textarea, 'Điểm: @');

    await user.click(screen.getByTestId('variable-suggestion'));
    expect(textarea.value).toBe('Điểm: @gpa');
  });
});
