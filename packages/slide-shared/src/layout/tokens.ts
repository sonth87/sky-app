// Token resolver `@var` — theo docs/roadmap/plans/layout-designer/09-quy-dinh-variable.md §1.
// Cú pháp MỞ (không đóng đuôi, kiểu tag Facebook): `@` phải đứng sau khoảng trắng/đầu dòng để
// được coi là biến (email "a@b.com" không bị hiểu nhầm); tên biến bắt đầu+kết thúc bằng chữ/số,
// giữa cho phép thêm `-`/`_`. Dùng CHUNG cho layout content VÀ renderTemplate (TTS) — nguồn chân
// lý DUY NHẤT của regex, không định nghĩa lại ở nơi khác.

// Nhóm 1: `(^|\s)` — @ đứng sau đầu chuỗi hoặc khoảng trắng.
// Nhóm 2: tên biến — bắt đầu bằng chữ/số/_, giữa cho phép thêm `-`, kết thúc bằng chữ/số/_.
export const TOKEN_REGEX = /(^|\s)@([a-zA-Z0-9_](?:[a-zA-Z0-9_-]*[a-zA-Z0-9_])?)/g;

/** Trích danh sách key duy nhất xuất hiện trong 1 chuỗi content (thứ tự xuất hiện lần đầu). */
export function extractTokenKeys(content: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const match of content.matchAll(TOKEN_REGEX)) {
    const key = match[2]!;
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

/**
 * Thay mọi token `@key` trong content bằng giá trị tra từ `resolve(key)`.
 * Fail-soft tuyệt đối (09-quy-dinh-variable.md §2 "Validate — 3 thời điểm"): `resolve` trả
 * `undefined`/`null` → token bị xoá (chuỗi rỗng), KHÔNG throw, KHÔNG giữ lại literal `@key`.
 */
export function resolveTokens(content: string, resolve: (key: string) => string | null | undefined): string {
  return content.replace(TOKEN_REGEX, (_match, boundary: string, key: string) => {
    const value = resolve(key);
    return boundary + (value ?? '');
  });
}
