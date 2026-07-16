import type { SqlExecutor } from '../sql-executor.js';
import type { Student } from '@sky-app/slide-shared';

interface StudentRow {
  student_code: string;
  ceremony_id: number;
  id: string;
  display_order: number;
  full_name: string;
  gender: string;
  date_of_birth: string;
  major_name: string;
  faculty_name: string;
  class_code: string;
  course_code: string;
  phone_number: string;
  identity_number: string;
  email: string;
  card_code: string | null;
  gpa: number;
  classification: string;
  classification_type: number;
  achievement_title: string;
  award_type: string;
  award_type_code: string | null;
  award_content: string;
  presentation_template_type: string;
  presentation_template_type_code: string | null;
  quote: string | null;
  image_file_name: string;
  image_relative_path: string;
  graduation_batch_id: string;
  batch_name: string;
  degree_award_status: string;
  image_base64: string | null;
  status: string;
  ts_checkin: string | null;
  ts_called: string | null;
  ts_on_stage: string | null;
  ts_returned: string | null;
  src_on_stage: string | null;
  staff_presenter: string | null;
  absent: number | null;
  absent_reason: string | null;
}

function rowToStudent(row: StudentRow): Student {
  return {
    id: row.id,
    student_code: row.student_code,
    display_order: row.display_order,
    full_name: row.full_name,
    gender: row.gender,
    date_of_birth: row.date_of_birth,
    major_name: row.major_name,
    faculty_name: row.faculty_name,
    class_code: row.class_code,
    course_code: row.course_code,
    phone_number: row.phone_number,
    identity_number: row.identity_number,
    email: row.email,
    card_code: row.card_code ?? undefined,
    gpa: row.gpa,
    classification: row.classification,
    classification_type: row.classification_type,
    achievement_title: row.achievement_title,
    award_type: row.award_type,
    award_type_code: row.award_type_code,
    award_content: row.award_content,
    presentation_template_type: row.presentation_template_type,
    presentation_template_type_code: row.presentation_template_type_code,
    quote: row.quote,
    image_file_name: row.image_file_name,
    image_relative_path: row.image_relative_path,
    graduation_batch_id: row.graduation_batch_id,
    batch_name: row.batch_name,
    degree_award_status: row.degree_award_status,
    image_base64: row.image_base64,
    status: row.status as Student['status'],
    ts_checkin: row.ts_checkin,
    ts_called: row.ts_called,
    ts_on_stage: row.ts_on_stage,
    ts_returned: row.ts_returned,
    src_on_stage: row.src_on_stage as Student['src_on_stage'],
    staff_presenter: row.staff_presenter,
    absent: row.absent == null ? undefined : !!row.absent,
    absent_reason: row.absent_reason ?? undefined,
  };
}

const STUDENT_COLUMNS = [
  'student_code', 'ceremony_id', 'id', 'display_order', 'full_name', 'gender', 'date_of_birth',
  'major_name', 'faculty_name', 'class_code', 'course_code', 'phone_number', 'identity_number',
  'email', 'card_code', 'gpa', 'classification', 'classification_type', 'achievement_title',
  'award_type', 'award_type_code', 'award_content', 'presentation_template_type',
  'presentation_template_type_code', 'quote', 'image_file_name', 'image_relative_path',
  'graduation_batch_id', 'batch_name', 'degree_award_status', 'image_base64', 'status',
  'ts_checkin', 'ts_called', 'ts_on_stage', 'ts_returned', 'src_on_stage', 'staff_presenter',
  'absent', 'absent_reason',
] as const;

function studentToParams(ceremonyId: number, s: Student): unknown[] {
  return [
    s.student_code, ceremonyId, s.id, s.display_order, s.full_name, s.gender, s.date_of_birth,
    s.major_name, s.faculty_name, s.class_code, s.course_code, s.phone_number, s.identity_number,
    s.email, s.card_code ?? null, s.gpa, s.classification, s.classification_type,
    s.achievement_title, s.award_type, s.award_type_code, s.award_content,
    s.presentation_template_type, s.presentation_template_type_code, s.quote, s.image_file_name,
    s.image_relative_path, s.graduation_batch_id, s.batch_name, s.degree_award_status,
    s.image_base64 ?? null, s.status, s.ts_checkin, s.ts_called, s.ts_on_stage, s.ts_returned,
    s.src_on_stage, s.staff_presenter, s.absent == null ? null : s.absent ? 1 : 0,
    s.absent_reason ?? null,
  ];
}

export function getStudents(executor: SqlExecutor, ceremonyId: number): Student[] {
  return executor
    .query<StudentRow>('SELECT * FROM student WHERE ceremony_id = ? ORDER BY display_order', [ceremonyId])
    .map(rowToStudent);
}

export function findStudentByCode(executor: SqlExecutor, ceremonyId: number, studentCode: string): Student | null {
  const rows = executor.query<StudentRow>('SELECT * FROM student WHERE ceremony_id = ? AND student_code = ?', [
    ceremonyId,
    studentCode,
  ]);
  return rows[0] ? rowToStudent(rows[0]) : null;
}

/** Bản ghi liền kề theo display_order (dir=1 kế tiếp, dir=-1 trước đó) — cho cmd:next/prev. */
export function neighborByDisplayOrder(
  executor: SqlExecutor,
  ceremonyId: number,
  currentCode: string,
  dir: 1 | -1,
): Student | null {
  const current = findStudentByCode(executor, ceremonyId, currentCode);
  if (!current) return null;
  const rows = executor.query<StudentRow>(
    `SELECT * FROM student WHERE ceremony_id = ? AND display_order ${dir === 1 ? '>' : '<'} ?
     ORDER BY display_order ${dir === 1 ? 'ASC' : 'DESC'} LIMIT 1`,
    [ceremonyId, current.display_order],
  );
  return rows[0] ? rowToStudent(rows[0]) : null;
}

export function replaceStudents(executor: SqlExecutor, ceremonyId: number, students: Student[]): void {
  executor.run('DELETE FROM student WHERE ceremony_id = ?', [ceremonyId]);
  const placeholders = STUDENT_COLUMNS.map(() => '?').join(', ');
  for (const s of students) {
    executor.run(`INSERT INTO student (${STUDENT_COLUMNS.join(', ')}) VALUES (${placeholders})`, studentToParams(ceremonyId, s));
  }
}

export function clearStudents(executor: SqlExecutor, ceremonyId: number): void {
  executor.run('DELETE FROM student WHERE ceremony_id = ?', [ceremonyId]);
}

/** UPDATE trực tiếp — thay cho hành vi cũ "chỉ patch memory, chờ ghi toàn file" (file 18 §2). */
export function patchStudent(executor: SqlExecutor, ceremonyId: number, studentCode: string, patch: Partial<Student>): void {
  const entries = Object.entries(patch).filter(([key]) => (STUDENT_COLUMNS as readonly string[]).includes(key));
  if (entries.length === 0) return;
  const setClause = entries.map(([key]) => `${key} = ?`).join(', ');
  const values = entries.map(([key, value]) => {
    if (key === 'absent') return value == null ? null : value ? 1 : 0;
    return value;
  });
  executor.run(`UPDATE student SET ${setClause} WHERE ceremony_id = ? AND student_code = ?`, [
    ...values,
    ceremonyId,
    studentCode,
  ]);
}
