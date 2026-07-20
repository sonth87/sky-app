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

  // Field core MỞ RỘNG (Giai đoạn 4c, 2026-07-20) — phục vụ đa dạng loại đối tượng (sinh viên/
  // nhân viên/khác), không chỉ 4 field core cũ ở trên. TOÀN BỘ optional, không phá dữ liệu cũ.
  identifierCode?: string; // mã định danh CHUNG (thay cho student_code/employee_code riêng biệt)
  identityNumber?: string; // CCCD/CMND
  phone?: string;
  email?: string;
  dateOfBirth?: string;
  title?: string; // chức danh/danh hiệu ở tầng Canonical — KHÁC Student.achievement_title
  description?: string;

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
  identifierCode?: string;
  identityNumber?: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string;
  title?: string;
  description?: string;
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
  identifierCode?: string;
  identityNumber?: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string;
  title?: string;
  description?: string;
  extra: Record<string, string | number>;
}

/** Field core → key token @var tương ứng — nguồn chân lý DUY NHẤT cho việc "key nào là core,
 * key nào rơi vào extra" (dùng bởi resolveCanonicalField VÀ applyMapping's CORE_KEYS — export
 * để field-mapping.ts tái dùng Object.keys() thay vì duy trì 2 danh sách dễ lệch nhau). */
export const CORE_FIELD_ACCESSORS: Record<string, (record: HasCanonicalFields) => string | undefined> = {
  full_name: (r) => r.full_name,
  image_relative_path: (r) => r.image_relative_path,
  status: (r) => r.status,
  identifier_code: (r) => r.identifierCode,
  identity_number: (r) => r.identityNumber,
  phone: (r) => r.phone,
  email: (r) => r.email,
  date_of_birth: (r) => r.dateOfBirth,
  title: (r) => r.title,
  description: (r) => r.description,
};

/** Tra giá trị 1 token key trên 1 CanonicalSubject/CanonicalGroup — lõi trước, extra sau (11 Phần 1). */
export function resolveCanonicalField(record: HasCanonicalFields, key: string): string | undefined {
  const accessor = CORE_FIELD_ACCESSORS[key];
  if (accessor) return accessor(record);
  const extraVal = record.extra[key];
  if (extraVal == null) return undefined;
  return String(extraVal);
}
