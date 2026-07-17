import type { AppConfig, Ceremony, Student } from '@sky-app/slide-shared';

/**
 * Shape thô của students.json từ hệ thống portal + hàm map raw → canonical `Student`.
 * GOM TỪ 3 NƠI (2026-07-16): trước đây `RawStudent`/`mapStatus`/`mapRawStudent`/`defaultCeremony`
 * trùng lặp y hệt ở apps/shell-electron/electron/slide/data/sync.ts, apps/data-service/src/store.ts,
 * và packages/platform-web/src/adapters/sqlite-wasm-data.ts. Gom về đây để 1 nguồn chân lý.
 *
 * LƯU Ý: `defaultConfig` KHÔNG gom vào đây — Electron và data-service dùng giá trị mặc định
 * KHÁC NHAU (port, mode, kiosk...), giữ riêng ở từng app.
 */
export interface RawStudent {
  id: string;
  graduation_batch_id: string;
  batch_name: string;
  display_order: number;
  student_code: string;
  full_name: string;
  gender?: string;
  date_of_birth: string;
  identity_number?: string;
  major_name: string;
  faculty_name: string;
  class_code: string;
  course_code: string;
  phone_number?: string;
  email: string;
  gpa: number;
  classification: string;
  classification_type: number;
  achievement_title: string;
  award_type: string;
  award_type_code: string | null;
  award_content: string;
  quote: string | null;
  image_file_name: string;
  image_relative_path?: string;
  presentation_template_type: string;
  presentation_template_type_code: string | null;
  registration_status: string;
  degree_award_status: string;
}

/** Map registration_status (portal) → StudentStatus nội bộ. */
export function mapStatus(raw: string): Student['status'] {
  switch (raw) {
    case 'on_stage':
      return 'on_stage';
    case 'returned':
    case 'received_hardcopy':
      return 'returned';
    case 'checked_in':
      return 'checked_in';
    case 'called':
      return 'called';
    case 'absent':
      return 'absent';
    default:
      return 'registered';
  }
}

/** Map 1 bản ghi thô từ portal thành canonical `Student` (trạng thái vận hành reset về mặc định). */
export function mapRawStudent(r: RawStudent): Student {
  return {
    id: r.id,
    student_code: r.student_code,
    display_order: r.display_order,
    full_name: r.full_name,
    gender: r.gender || 'Nam',
    date_of_birth: r.date_of_birth,
    major_name: r.major_name,
    faculty_name: r.faculty_name,
    class_code: r.class_code,
    course_code: r.course_code,
    phone_number: r.phone_number ?? '',
    identity_number: r.identity_number ?? '',
    email: r.email,
    gpa: r.gpa,
    classification: r.classification,
    classification_type: r.classification_type,
    achievement_title: r.achievement_title,
    award_type: r.award_type,
    award_type_code: r.award_type_code,
    award_content: r.award_content,
    presentation_template_type: r.presentation_template_type,
    presentation_template_type_code: r.presentation_template_type_code,
    quote: r.quote,
    image_file_name: r.image_file_name,
    image_relative_path: r.image_relative_path ?? '',
    graduation_batch_id: r.graduation_batch_id,
    batch_name: r.batch_name,
    degree_award_status: r.degree_award_status,
    status: mapStatus(r.registration_status),
    ts_checkin: null,
    ts_called: null,
    ts_on_stage: null,
    ts_returned: null,
    src_on_stage: null,
    staff_presenter: null,
  };
}

/** Ceremony mặc định khi seed từ students.json (chưa có thông tin lễ cụ thể). */
export function defaultCeremony(): Ceremony {
  return {
    id: 1,
    name: 'Lễ Trao Bằng Tốt Nghiệp',
    graduation_year: new Date().getFullYear().toString(),
    date: new Date().toISOString().slice(0, 10),
    venue: 'Trường ĐH Đại Nam',
    university_name: 'TRƯỜNG ĐẠI HỌC ĐẠI NAM',
    ministry_name: 'BỘ GIÁO DỤC VÀ ĐÀO TẠO',
    title_line1: 'LỄ TRAO BẰNG TỐT NGHIỆP',
    title_line2: '',
    logo: 'logo.png',
    backdrops_config: 'assets/2026/backdrops_layouts.json',
  };
}

// Kiểu AppConfig re-export tiện cho caller tự viết defaultConfig riêng mà không phải import 2 nơi.
export type { AppConfig };
