// CanonicalSubject/CanonicalGroup — theo docs/roadmap/plans/layout-designer/
// 11-canonical-da-loai-va-loop.md Phần 1-2. Đây là "record" đưa vào LayoutRenderer, độc lập
// khỏi Student (Student hiện có xem như 1 profile cụ thể ánh xạ từ CanonicalSubject).

/** Lõi chung mọi loại đối tượng đều có (cá nhân) — sinh viên/nhân viên/... */
export interface CanonicalSubject {
  id: string;
  displayOrder?: number;
  full_name: string;
  image_relative_path?: string;
  status?: string;

  // "student" | "employee" | ... — mở, không union cứng (11 Phần 1)
  subjectType: string;

  // Field đặc thù theo loại (sinh viên: gpa/major_name; nhân viên: chuc_vu/nam_kinh_nghiem...)
  extra: Record<string, string | number>;
}

/**
 * Nhóm/tập thể — dùng CHUNG 1 type cho cả "danh nghĩa" (không cần liệt kê người) và "có danh
 * sách" (11 Phần 2). `members` optional: rỗng/undefined → LoopItem tự ẩn, layout hiển thị như
 * 1 cá nhân danh nghĩa (full_name = tên nhóm).
 */
export interface CanonicalGroup {
  id: string;
  displayOrder?: number;
  subjectType: 'group';
  full_name: string; // tên gọi chung của nhóm, VD "5 sinh viên xuất sắc nhất khoá"
  image_relative_path?: string;
  status?: string;
  members?: CanonicalSubject[]; // OPTIONAL — xem 11 Phần 2 "Hai loại nhóm"
  extra: Record<string, string | number>; // field của CHÍNH nhóm (thanh_tich_tap_the, so_luong...)
}

export type CanonicalRecord = CanonicalSubject | CanonicalGroup;

export function isCanonicalGroup(record: CanonicalRecord): record is CanonicalGroup {
  return record.subjectType === 'group';
}

/** Field chung mà CanonicalSubject VÀ CanonicalGroup đều có — đủ để resolve token @key. */
interface HasCanonicalFields {
  full_name: string;
  image_relative_path?: string;
  status?: string;
  extra: Record<string, string | number>;
}

/** Tra giá trị 1 token key trên 1 CanonicalSubject/CanonicalGroup — lõi trước, extra sau (11 Phần 1). */
export function resolveCanonicalField(record: HasCanonicalFields, key: string): string | undefined {
  if (key === 'full_name') return record.full_name;
  if (key === 'image_relative_path') return record.image_relative_path;
  if (key === 'status') return record.status;
  const extraVal = record.extra[key];
  if (extraVal == null) return undefined;
  return String(extraVal);
}
