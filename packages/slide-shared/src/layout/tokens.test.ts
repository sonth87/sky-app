import { describe, expect, it } from 'vitest';
import { extractTokenKeys, resolveTokens, extractTokenKeysFromContent, resolveContentTokens } from './tokens.js';
import type { RichTextContent, TiptapJSONDoc } from './types.js';

describe('resolveTokens', () => {
  it('thay token đứng đầu dòng', () => {
    expect(resolveTokens('@full_name', () => 'Nguyễn Văn A')).toBe('Nguyễn Văn A');
  });

  it('thay token sau khoảng trắng, dừng ở dấu câu', () => {
    expect(resolveTokens('tên tôi là @full_name.xin chào!', (k) => (k === 'full_name' ? 'A' : undefined))).toBe(
      'tên tôi là A.xin chào!',
    );
  });

  it('nhiều token liên tiếp cách nhau bởi khoảng trắng', () => {
    const values: Record<string, string> = { chuc_vu: 'Giám đốc', full_name: 'A' };
    expect(resolveTokens('@chuc_vu @full_name', (k) => values[k])).toBe('Giám đốc A');
  });

  it('cho phép gạch ngang ở giữa tên biến', () => {
    expect(resolveTokens('@ho-ten của bạn', (k) => (k === 'ho-ten' ? 'X' : undefined))).toBe('X của bạn');
  });

  it('@ dính liền chữ trước KHÔNG phải biến (email)', () => {
    expect(resolveTokens('email a@b.com', () => 'KHONG_DUOC_GOI')).toBe('email a@b.com');
  });

  it('nhả dấu gạch ngang ở cuối tên biến', () => {
    expect(extractTokenKeys('@ho-ten-')).toEqual(['ho-ten']);
  });

  it('cho phép số trong tên biến', () => {
    expect(extractTokenKeys('@a-1b')).toEqual(['a-1b']);
  });

  it('fail-soft: resolve trả undefined → token bị xoá, không throw, không giữ literal', () => {
    expect(resolveTokens('Xin chào @missing_key!', () => undefined)).toBe('Xin chào !');
  });

  it('fail-soft: resolve trả null → token bị xoá', () => {
    expect(resolveTokens('@x', () => null)).toBe('');
  });

  it('giữ nguyên khoảng trắng/đầu dòng phía trước token', () => {
    expect(resolveTokens('  @x', () => 'V')).toBe('  V');
  });
});

describe('extractTokenKeys', () => {
  it('trả về key duy nhất theo thứ tự xuất hiện lần đầu', () => {
    expect(extractTokenKeys('@a @b @a @c')).toEqual(['a', 'b', 'c']);
  });

  it('chuỗi không có token trả mảng rỗng', () => {
    expect(extractTokenKeys('không có gì cả')).toEqual([]);
  });
});

// Bước 12 kế hoạch resize/rotate (2026-07-18, sửa lại 2026-07-19) — TextItem.content đổi union
// string | RichTextContent ({json, html} — KHÔNG còn TiptapJSONDoc trần, xem types.ts's
// RichTextContent comment: bỏ generateHTML khỏi slide-shared để tránh kéo happy-dom/ws vỡ build
// Electron main). Backward-compat với layout CŨ (content luôn string) là DoD bắt buộc.
describe('extractTokenKeysFromContent — tổng quát cho string | RichTextContent', () => {
  it('content là string (layout cũ) → hoạt động Y HỆT extractTokenKeys', () => {
    expect(extractTokenKeysFromContent('Xin chào @full_name và @chuc_vu')).toEqual(['full_name', 'chuc_vu']);
  });

  function docWithTokens(): TiptapJSONDoc {
    return {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Xin chào ' },
            { type: 'text', text: '@full_name', marks: [{ type: 'bold' }] },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'Chức vụ: @chuc_vu' }] },
      ],
    };
  }

  it('content là RichTextContent → duyệt MỌI text node lồng nhau trong .json, gộp key duy nhất', () => {
    const rich: RichTextContent = { json: docWithTokens(), html: '<p>Xin chào <strong>@full_name</strong></p><p>Chức vụ: @chuc_vu</p>' };
    expect(extractTokenKeysFromContent(rich)).toEqual(['full_name', 'chuc_vu']);
  });

  it('json không có text node nào (rỗng) → mảng rỗng, không throw', () => {
    const rich: RichTextContent = { json: { type: 'doc', content: [{ type: 'paragraph' }] }, html: '<p></p>' };
    expect(extractTokenKeysFromContent(rich)).toEqual([]);
  });
});

describe('resolveContentTokens — trả ĐÚNG CÙNG KIỂU với input', () => {
  it('content là string → trả string đã resolve (giống resolveTokens)', () => {
    const result = resolveContentTokens('Xin chào @full_name', () => 'Nguyễn Văn A');
    expect(result).toBe('Xin chào Nguyễn Văn A');
  });

  it('content là RichTextContent → resolve CẢ .json (mọi text node, giữ nguyên marks) LẪN .html', () => {
    const rich: RichTextContent = {
      json: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Chào @full_name', marks: [{ type: 'bold' }] }] }] },
      html: '<p>Chào <strong>@full_name</strong></p>',
    };
    const result = resolveContentTokens(rich, () => 'An') as RichTextContent;

    expect(result.json.type).toBe('doc');
    const textNode = result.json.content![0]!.content![0]!;
    expect(textNode.text).toBe('Chào An');
    expect(textNode.marks).toEqual([{ type: 'bold' }]);
    expect(result.html).toBe('<p>Chào <strong>An</strong></p>');
  });

  it('resolveContentTokens KHÔNG mutate input .json gốc (deep-clone trước khi sửa)', () => {
    const rich: RichTextContent = { json: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '@x' }] }] }, html: '<p>@x</p>' };
    resolveContentTokens(rich, () => 'VALUE');

    expect(rich.json.content![0]!.content![0]!.text).toBe('@x');
    expect(rich.html).toBe('<p>@x</p>');
  });

  it('fail-soft giữ nguyên trong RichTextContent — resolve trả undefined → token bị xoá khỏi CẢ json LẪN html', () => {
    const rich: RichTextContent = {
      json: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Xin chào @missing!' }] }] },
      html: '<p>Xin chào @missing!</p>',
    };
    const result = resolveContentTokens(rich, () => undefined) as RichTextContent;

    expect(result.json.content![0]!.content![0]!.text).toBe('Xin chào !');
    expect(result.html).toBe('<p>Xin chào !</p>');
  });
});
