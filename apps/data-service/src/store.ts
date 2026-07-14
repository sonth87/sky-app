import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppConfig, Ceremony, Student } from '@sky-app/slide-shared';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const BUNDLE_PATH = join(DATA_DIR, 'bundle.json');
const SAMPLE_STUDENTS_PATH = join(__dirname, '..', '..', 'shell-electron', 'sample-bundle', 'data', 'students.json');

export interface CeremonyBundle {
  ceremony: Ceremony;
  config: AppConfig;
  students: Student[];
  syncedAt: string | null;
}

interface RawStudent {
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

/** Map registration_status (portal) → StudentStatus nội bộ — cùng mapping với apps/shell-electron/electron/slide/data/sync.ts's mapStatus(). */
function mapStatus(raw: string): Student['status'] {
  switch (raw) {
    case 'on_stage': return 'on_stage';
    case 'returned':
    case 'received_hardcopy': return 'returned';
    case 'checked_in': return 'checked_in';
    case 'called': return 'called';
    case 'absent': return 'absent';
    default: return 'registered';
  }
}

function mapRawStudent(r: RawStudent): Student {
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

function defaultCeremony(): Ceremony {
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

function defaultConfig(): AppConfig {
  return {
    ws_port: 8765,
    http_port: 8766,
    mode: 'manual',
    delay_seconds: 3,
    auto_open_browser: false,
    kiosk_mode: false,
    auto_load_first: false,
    slide_display_seconds: 8,
    idle_timeout_enabled: false,
    idle_timeout_seconds: 60,
  };
}

function seedFromSample(): CeremonyBundle {
  const raw = JSON.parse(readFileSync(SAMPLE_STUDENTS_PATH, 'utf-8')) as RawStudent[];
  return {
    ceremony: defaultCeremony(),
    config: defaultConfig(),
    students: raw.map(mapRawStudent),
    syncedAt: null,
  };
}

export function readBundle(): CeremonyBundle {
  if (!existsSync(BUNDLE_PATH)) return seedFromSample();
  return JSON.parse(readFileSync(BUNDLE_PATH, 'utf-8')) as CeremonyBundle;
}

export function writeBundle(bundle: CeremonyBundle): void {
  mkdirSync(dirname(BUNDLE_PATH), { recursive: true });
  writeFileSync(BUNDLE_PATH, JSON.stringify(bundle, null, 2), 'utf-8');
}

export function syncFromSample(): CeremonyBundle {
  const bundle = seedFromSample();
  bundle.syncedAt = new Date().toISOString();
  writeBundle(bundle);
  return bundle;
}

export function resetAll(): CeremonyBundle {
  const bundle = seedFromSample();
  bundle.students = [];
  bundle.syncedAt = null;
  writeBundle(bundle);
  return bundle;
}

export function resetStudentOperationalFields(): CeremonyBundle {
  const bundle = readBundle();
  bundle.students = bundle.students.map((s) => ({
    ...s,
    status: 'registered',
    ts_checkin: null,
    ts_called: null,
    ts_on_stage: null,
    ts_returned: null,
    src_on_stage: null,
    staff_presenter: null,
  }));
  writeBundle(bundle);
  return bundle;
}
