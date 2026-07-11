// SYNC: keep identical to electron/lib/renderTemplate.ts
import type { Student, CustomVariable } from '@sky-app/slide-shared';
import { resolveCustomVariables } from './customVariables';

function titleCaseIfAllCaps(str: string): string {
  if (str === str.toLocaleUpperCase('vi-VN') && str !== str.toLocaleLowerCase('vi-VN')) {
    return str.replace(/\S+/gu, (w) => w.charAt(0).toLocaleUpperCase('vi-VN') + w.slice(1).toLocaleLowerCase('vi-VN'));
  }
  return str;
}

export function renderTemplate(
  template: string,
  student: Student,
  customVars: CustomVariable[] = []
): string {
  const resolved = resolveCustomVariables(student, customVars);
  return template.replace(/@([a-zA-Z_]+)/g, (_, key) => {
    // Biến điều kiện tùy chỉnh ưu tiên hơn field gốc của Student
    if (key in resolved) return resolved[key];
    const val = (student as unknown as Record<string, unknown>)[key];
    if (val == null || val === '') return '';
    return titleCaseIfAllCaps(String(val));
  });
}

export const STUDENT_TEMPLATE_VARIABLES: Array<{ key: string; label: string; example: string }> = [
  { key: 'full_name',       label: 'Họ và tên',          example: 'MA THỊ MAI ANH' },
  { key: 'student_code',    label: 'Mã sinh viên',        example: '1677010006' },
  { key: 'major_name',      label: 'Ngành học',           example: 'Ngôn ngữ Anh' },
  { key: 'faculty_name',    label: 'Khoa',                example: 'Ngôn ngữ Anh' },
  { key: 'class_code',      label: 'Mã lớp',              example: 'TA 16 - 01' },
  { key: 'course_code',     label: 'Khóa',                example: 'K16' },
  { key: 'gpa',             label: 'Điểm GPA',            example: '9.08' },
  { key: 'classification',  label: 'Xếp loại',            example: 'Xuất sắc' },
  { key: 'award_content',   label: 'Nội dung khen thưởng', example: 'THỦ KHOA CẤP TRƯỜNG' },
  { key: 'quote',           label: 'Câu nói',             example: 'I only live once.' },
  { key: 'batch_name',      label: 'Tên đợt trao bằng',  example: 'Đợt trao bằng 25/06/2026' },
  { key: 'achievement_title', label: 'Danh hiệu',         example: 'Sinh viên xuất sắc' },
];
