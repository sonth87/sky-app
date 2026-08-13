// Token resolver `@var` — theo docs/roadmap/plans/layout-designer/09-quy-dinh-variable.md §1.
// Cú pháp MỞ (không đóng đuôi, kiểu tag Facebook): `@` phải đứng sau khoảng trắng/đầu dòng để
// được coi là biến (email "a@b.com" không bị hiểu nhầm); tên biến bắt đầu+kết thúc bằng chữ/số,
// giữa cho phép thêm `-`/`_`. Dùng CHUNG cho layout content VÀ renderTemplate (TTS) — nguồn chân
// lý DUY NHẤT của regex, không định nghĩa lại ở nơi khác.

import type { RichTextContent, TiptapJSONDoc } from './types.js';

// Nhóm 1: `(^|\s)` — @ đứng sau đầu chuỗi hoặc khoảng trắng.
// Nhóm 2: tên biến — bắt đầu bằng chữ/số/_, giữa cho phép thêm `-`, kết thúc bằng chữ/số/_.
export const TOKEN_REGEX = /(^|\s)@([a-zA-Z0-9_](?:[a-zA-Z0-9_-]*[a-zA-Z0-9_])?)/g;

// Biến thể DÀNH RIÊNG cho chuỗi HTML (content.html của RichTextContent, Bước 12) — thêm `>` và
// `"` vào tập ranh giới hợp lệ NGOÀI khoảng trắng/đầu chuỗi, vì @var có thể đứng NGAY SAU thẻ mở
// (`<strong>@full_name`, không có khoảng trắng giữa `>` và `@`). KHÔNG dùng regex này cho content
// string thường (TOKEN_REGEX) — chỉ hợp lệ trong ngữ cảnh HTML do Tiptap tự sinh.
const HTML_TOKEN_REGEX = /(^|[\s>"])@([a-zA-Z0-9_](?:[a-zA-Z0-9_-]*[a-zA-Z0-9_])?)/g;

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

/** Duyệt mọi text node trong cây Tiptap JSON, gọi `visit(text)` cho từng node — dùng chung bởi
 * extractTokenKeysFromContent/resolveContentTokens, tránh viết đệ quy 2 lần. */
function walkTextNodes(doc: TiptapJSONDoc, visit: (text: string) => string | void): void {
  if (typeof doc.text === 'string') {
    const replaced = visit(doc.text);
    if (replaced !== undefined) doc.text = replaced;
  }
  if (doc.content) {
    for (const child of doc.content) walkTextNodes(child, visit);
  }
}

/**
 * `extractTokenKeys`/`resolveTokens` bản TỔNG QUÁT — nhận CẢ string (layout cũ/TextItem chưa
 * qua rich-text editor) LẪN RichTextContent (đã sửa qua editor, Bước 12 kế hoạch resize/rotate,
 * 2026-07-18 — sửa lại 2026-07-19: content giờ là {json, html}, KHÔNG còn TiptapJSONDoc trần).
 * Layout CŨ (content luôn string) PHẢI tiếp tục hoạt động không lỗi/không mất dữ liệu qua 2 hàm
 * này — test bắt buộc, không phải nice-to-have.
 */
export function extractTokenKeysFromContent(content: string | RichTextContent): string[] {
  if (typeof content === 'string') return extractTokenKeys(content);
  const keys: string[] = [];
  const seen = new Set<string>();
  walkTextNodes(content.json, (text) => {
    for (const key of extractTokenKeys(text)) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  });
  return keys;
}

/**
 * Trả về CÙNG KIỂU với input. `json` resolve qua walkTextNodes (đệ quy text node, an toàn với
 * JSON tree). `html` resolve bằng HTML_TOKEN_REGEX (KHÔNG phải TOKEN_REGEX thường — @var có thể
 * đứng ngay sau thẻ mở `<strong>@full_name`, không có khoảng trắng) — AN TOÀN vì `@var` trong
 * content này CHỈ xuất hiện trong text content do chính Tiptap editor sinh ra (không phải input
 * tuỳ ý từ nơi khác), không có khả năng "@var" nằm lẫn trong tag/attribute HTML.
 */
export function resolveContentTokens(content: string | RichTextContent, resolve: (key: string) => string | null | undefined): string | RichTextContent {
  if (typeof content === 'string') return resolveTokens(content, resolve);
  const json: TiptapJSONDoc = JSON.parse(JSON.stringify(content.json));
  walkTextNodes(json, (text) => resolveTokens(text, resolve));
  const html = content.html.replace(HTML_TOKEN_REGEX, (_match, boundary: string, key: string) => {
    const value = resolve(key);
    return boundary + (value ?? '');
  });
  return { json, html };
}
