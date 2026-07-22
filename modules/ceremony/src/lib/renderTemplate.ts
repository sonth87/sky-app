// SYNC: keep identical to electron/lib/renderTemplate.ts
import type { CanonicalRecord, CustomVariable } from '@sky-app/slide-shared';
import { resolveTokens, resolveCustomVariables, flattenCanonicalRecord } from '@sky-app/slide-shared';

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

/** Gợi ý field core cho autocomplete @var trong TemplateEditor — field đặc thù (major_name,
 * gpa...) giờ tuỳ theo DataSource của từng Event, không còn liệt kê cố định được ở đây (giai
 * đoạn "bỏ Student", 2026-07-22). Component dùng danh sách này NÊN bổ sung thêm gợi ý động từ
 * FieldMappingProfile.map khi có (xem RuleBuilder.tsx làm mẫu). */
export const CORE_TEMPLATE_VARIABLES: Array<{ key: string; label: string; example: string }> = [
  { key: 'full_name',       label: 'Họ và tên',          example: 'MA THỊ MAI ANH' },
  { key: 'identifierCode',  label: 'Mã định danh',        example: '1677010006' },
  { key: 'identityNumber',  label: 'CCCD/CMND',           example: '001204012345' },
  { key: 'phone',           label: 'Số điện thoại',       example: '0912345678' },
  { key: 'email',           label: 'Email',               example: 'a@example.com' },
  { key: 'dateOfBirth',     label: 'Ngày sinh',           example: '2004-01-01' },
  { key: 'title',           label: 'Chức danh/Danh hiệu', example: 'Sinh viên xuất sắc' },
  { key: 'description',     label: 'Mô tả',               example: '' },
];
