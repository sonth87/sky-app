// FieldMappingProfile/MappingRule/applyMapping — Giai đoạn 4a kế hoạch Event, theo
// docs/roadmap/plans/layout-designer/05-he-bien-va-adapter.md §"FieldMappingProfile — Adapter".
// Adapter chuyển raw record (shape bất kỳ, cột do user tự đặt tên) → CanonicalSubject, chạy 1
// lần lúc import — toàn bộ pipeline sau (resolveLayout/renderTemplate/LayoutRenderer) không cần
// biết data gốc, đúng "ports & adapters" xuyên suốt sky-app.

import { CORE_FIELD_ACCESSORS, type CanonicalSubject } from './canonical.js';

export interface FieldMappingProfile {
  id: string;
  label: string;
  /** Khớp CanonicalSubject.subjectType — mở, không union cứng (11-canonical-da-loai-va-loop.md). */
  subjectType: string;
  /** Tên cột (key trong rawRow) dùng làm khoá tự nhiên định danh bản ghi — record.id sinh ổn
   * định từ giá trị cột này (22-import-modal.md §2), re-import cùng người = cùng id. */
  naturalKeyField: string;
  /** canonicalKey (VD "full_name", "gpa") → cách lấy giá trị từ rawRow. */
  map: Record<string, MappingRule>;
  /** Giá trị mẫu (1 record giả) để preview trong editor mapping. */
  sample?: Record<string, string>;
}

export type MappingRule =
  | { kind: 'from'; from: string }
  | { kind: 'concat'; parts: string[]; sep?: string }
  | { kind: 'const'; value: string }
  /** GĐ4a: chỉ hỗ trợ transform text đơn giản, KHÔNG phải expression engine đầy đủ (tránh scope
   * creep — blueprint để `ComputedExpr` mở cho tương lai, ở đây thu hẹp còn 1 danh sách cố định). */
  | { kind: 'computed'; from: string; transform: ComputedTransform };

export type ComputedTransform = 'trim' | 'upper' | 'lower' | 'titlecase';

/** 1 lỗi ở 1 dòng dữ liệu khi import (CSV/Excel/ZIP) — dùng để hiện bảng lỗi chi tiết trong
 * wizard (Bước 2, nâng cấp 2026-07-22). `rowIndex` là index trong mảng rows đã parse (0-based),
 * KHÔNG phải số dòng file gốc (không tính dòng header) — UI tự +2 khi hiển thị nếu cần khớp số
 * dòng Excel thật. */
export interface ImportRowError {
  rowIndex: number;
  /** Tên field liên quan (VD naturalKeyField) — rỗng nếu lỗi không gắn với field cụ thể nào. */
  field?: string;
  message: string;
}

function applyTransform(value: string, transform: ComputedTransform): string {
  switch (transform) {
    case 'trim':
      return value.trim();
    case 'upper':
      return value.toUpperCase();
    case 'lower':
      return value.toLowerCase();
    case 'titlecase':
      return value
        .toLowerCase()
        .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
    default: {
      const _exhaustive: never = transform;
      return _exhaustive;
    }
  }
}

/** Lấy giá trị 1 MappingRule từ rawRow — fail-soft: cột nguồn không tồn tại → chuỗi rỗng, KHÔNG throw. */
function resolveMappingRule(rawRow: Record<string, string>, rule: MappingRule): string {
  switch (rule.kind) {
    case 'from':
      return rawRow[rule.from] ?? '';
    case 'concat':
      return rule.parts.map((p) => rawRow[p] ?? '').join(rule.sep ?? ' ').trim();
    case 'const':
      return rule.value;
    case 'computed':
      return applyTransform(rawRow[rule.from] ?? '', rule.transform);
    default: {
      const _exhaustive: never = rule;
      return _exhaustive;
    }
  }
}

/** Nguồn chân lý DUY NHẤT cho "key nào là core" — Object.keys(CORE_FIELD_ACCESSORS) từ
 * canonical.ts, tránh duy trì 2 danh sách dễ lệch nhau (bug thật đã tránh: trước đây CORE_KEYS
 * là Set riêng, dễ quên cập nhật khi thêm field core mới — Giai đoạn 4c, 2026-07-20). */
const CORE_KEYS = new Set(Object.keys(CORE_FIELD_ACCESSORS));

/**
 * rawRow (1 dòng đã parse từ CSV/XLSX, Record<string,string>) → CanonicalSubject theo profile.
 * `id`/`displayOrder` do caller gán (record.id = giá trị naturalKeyField, xem queries/
 * data-source.ts's insertDataSourceRecords) — hàm này CHỈ áp mapping, không biết ngữ cảnh DB.
 */
export function applyMapping(rawRow: Record<string, string>, profile: FieldMappingProfile): Omit<CanonicalSubject, 'id' | 'displayOrder'> {
  const extra: Record<string, string | number> = {};
  let full_name = '';
  let image_relative_path: string | undefined;
  let status: string | undefined;
  let identifierCode: string | undefined;
  let identityNumber: string | undefined;
  let phone: string | undefined;
  let email: string | undefined;
  let dateOfBirth: string | undefined;
  let title: string | undefined;
  let description: string | undefined;

  for (const [key, rule] of Object.entries(profile.map)) {
    const value = resolveMappingRule(rawRow, rule);
    if (key === 'full_name') full_name = value;
    else if (key === 'image_relative_path') image_relative_path = value || undefined;
    else if (key === 'status') status = value || undefined;
    else if (key === 'identifier_code') identifierCode = value || undefined;
    else if (key === 'identity_number') identityNumber = value || undefined;
    else if (key === 'phone') phone = value || undefined;
    else if (key === 'email') email = value || undefined;
    else if (key === 'date_of_birth') dateOfBirth = value || undefined;
    else if (key === 'title') title = value || undefined;
    else if (key === 'description') description = value || undefined;
    else if (!CORE_KEYS.has(key)) extra[key] = value;
  }

  return {
    full_name,
    image_relative_path,
    status,
    identifierCode,
    identityNumber,
    phone,
    email,
    dateOfBirth,
    title,
    description,
    subjectType: profile.subjectType,
    extra,
  };
}

/**
 * Trả danh sách NHÓM index (trong rows) có cùng giá trị naturalKeyField — rỗng nếu không có
 * trùng gì. Mỗi nhóm ≥2 phần tử (22-import-modal.md §7 "báo lỗi ở màn preview, buộc user sửa
 * file" — quyết định chốt qua AskUserQuestion 2026-07-19, không có lựa chọn "lấy dòng cuối").
 * Trả THEO NHÓM (không phải cặp rời rạc) để UI highlight đúng 1 khối 3+ dòng trùng cùng lúc.
 */
export function detectDuplicateNaturalKeys(rows: Array<Record<string, string>>, naturalKeyField: string): number[][] {
  const indexByKey = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const key = row[naturalKeyField];
    if (!key) return; // khoá rỗng không tính là "trùng" ở đây — đó là lỗi khác (thiếu dữ liệu).
    const existing = indexByKey.get(key);
    if (existing) existing.push(index);
    else indexByKey.set(key, [index]);
  });
  return [...indexByKey.values()].filter((group) => group.length > 1);
}
