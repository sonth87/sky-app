import { describe, expect, it } from 'vitest';
import { extractTokenKeys, resolveTokens } from './tokens.js';

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
