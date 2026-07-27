import { describe, expect, it } from 'vitest';
import { getCaretCharOffset } from '../lib/highlightEditor';

/**
 * getCaretCharOffset() phải khớp với `el.innerText`'s cách tính "\n" ở ranh giới block-level —
 * bug thật (2026-07-24): dùng Range.toString() (kiểu textContent, không tính "\n" giữa các <div>)
 * khiến con trỏ bị đặt lùi lại đúng 1 vị trí mỗi khi Enter tạo <div> mới, dù text/xuống dòng vẫn
 * đúng. Test này dựng cấu trúc DOM y hệt Chromium tạo sau khi bấm Enter (nhiều <div> con), verify
 * offset trả về khớp với vị trí trong chuỗi có "\n", không phải chuỗi textContent phẳng.
 */
describe('getCaretCharOffset', () => {
  it('cộng thêm 1 cho ranh giới <div> mới (giống "\\n" trong innerText) khi caret ở dòng 2', () => {
    const root = document.createElement('div');
    // Cấu trúc Chromium tạo khi Enter giữa "ab" và gõ "cd": <div>ab</div><div>cd</div>
    const div1 = document.createElement('div');
    div1.textContent = 'ab';
    const div2 = document.createElement('div');
    div2.textContent = 'cd';
    root.append(div1, div2);
    document.body.append(root);

    // Đặt caret ngay sau "c" trong div2 (offset 1 trong text node "cd")
    const range = document.createRange();
    range.setStart(div2.firstChild!, 1);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    // innerText tương ứng (trên trình duyệt thật — JSDOM không implement innerText layout-aware,
    // không assert được ở đây) là "ab\ncd" — caret sau "c" là offset 4 ("a","b","\n","c").
    expect(getCaretCharOffset(root)).toBe(4);

    root.remove();
  });

  it('không cộng thêm gì khi chỉ có 1 text node phẳng (không có block con)', () => {
    const root = document.createElement('div');
    root.textContent = 'hello world';
    document.body.append(root);

    const range = document.createRange();
    range.setStart(root.firstChild!, 5);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    expect(getCaretCharOffset(root)).toBe(5);

    root.remove();
  });

  it('cộng thêm 1 cho mỗi <br> đã đi qua', () => {
    const root = document.createElement('div');
    root.innerHTML = 'ab<br>cd';
    document.body.append(root);

    const textCd = root.childNodes[2]!; // text node "cd" sau <br>
    const range = document.createRange();
    range.setStart(textCd, 1); // sau "c"
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    // "ab" (2) + "\n" từ <br> (1) + "c" (1) = 4
    expect(getCaretCharOffset(root)).toBe(4);

    root.remove();
  });
});
