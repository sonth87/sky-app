// SYNC: keep identical to src/lib/renderTemplate.ts
import type { CanonicalRecord, CustomVariable } from '@sky-app/slide-shared';
import { resolveTokens, resolveCustomVariables, flattenCanonicalRecord } from '@sky-app/slide-shared';

// Title-case chỉ khi chuỗi TOÀN HOA (vd: "NGUYỄN THANH HẢI" → "Nguyễn Thanh Hải").
// Chuỗi đã mixed-case ("Ngôn ngữ Anh", "Xuất sắc") giữ nguyên.
function titleCaseIfAllCaps(str: string): string {
  if (str === str.toLocaleUpperCase('vi-VN') && str !== str.toLocaleLowerCase('vi-VN')) {
    return str.replace(/\S+/gu, (w) => w.charAt(0).toLocaleUpperCase('vi-VN') + w.slice(1).toLocaleLowerCase('vi-VN'));
  }
  return str;
}

export function renderTemplate(
  template: string,
  record: CanonicalRecord,
  customVars: CustomVariable[] = []
): string {
  const flat = flattenCanonicalRecord(record);
  const resolved = resolveCustomVariables(flat, customVars);
  return resolveTokens(template, (key) => {
    // Biến điều kiện tùy chỉnh ưu tiên hơn field gốc của record
    if (key in resolved) return resolved[key];
    const val = flat[key];
    if (val == null || val === '') return '';
    return titleCaseIfAllCaps(String(val));
  });
}
