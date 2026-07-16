import { describe, it, expect, beforeEach } from 'vitest';
import type { CeremonyBundle } from '@sky-app/slide-shared';
import { BetterSqlite3Executor } from './drivers/better-sqlite3-executor.js';
import { runMigrations } from './migrate.js';
import { getCeremonyBundle, saveCeremonyBundle } from './queries/ceremony.js';
import { patchStudent, findStudentByCode } from './queries/student.js';

function sampleBundle(): CeremonyBundle {
  return {
    room_id: 'default',
    room_name: 'Phòng chính',
    ceremony: {
      id: 1,
      name: 'Lễ Trao Bằng Tốt Nghiệp',
      graduation_year: '2025-2026',
      date: '2026-07-16',
      venue: 'Hội trường A',
      university_name: 'TRƯỜNG ĐẠI HỌC ĐẠI NAM',
      ministry_name: 'BỘ GIÁO DỤC VÀ ĐÀO TẠO',
      title_line1: 'LỄ TRAO BẰNG',
      title_line2: 'TỐT NGHIỆP',
      logo: 'logo.png',
      backdrops_config: 'assets/2026/backdrops_layouts.json',
      idle_image: 'assets/2026/idle.jpg',
      idle_image_variants: { '16:9': 'idle_16_9.jpg' },
    },
    config: {
      ws_port: 8081,
      http_port: 8080,
      mode: 'auto',
      delay_seconds: 2,
      auto_open_browser: true,
      kiosk_mode: true,
      auto_load_first: true,
      slide_display_seconds: 20,
      custom_variables: [
        {
          id: 'cv1',
          key: 'danh_xung',
          label: 'Danh xưng',
          default: 'Cử nhân',
          rules: [{ id: 'r1', attr: 'Ngành', op: 'equals', val: 'Kỹ thuật', result: 'Kỹ sư' }],
        },
      ],
      layout_overrides: { a: { image: 'foo.png' } },
    },
    students: [
      {
        id: 'uuid-1',
        student_code: 'SV001',
        display_order: 1,
        full_name: 'Nguyễn Văn A',
        gender: 'Nam',
        date_of_birth: '2004-01-01T00:00:00+00:00',
        major_name: 'CNTT',
        faculty_name: 'Khoa CNTT',
        class_code: 'CNTT16-01',
        course_code: 'K16',
        phone_number: '0900000000',
        identity_number: '000000000001',
        email: 'a@example.com',
        gpa: 3.65,
        classification: 'Giỏi',
        classification_type: 2,
        achievement_title: 'Khong',
        award_type: 'TOTNGHIEP',
        award_type_code: null,
        award_content: 'default',
        presentation_template_type: 'Trao bằng',
        presentation_template_type_code: null,
        quote: null,
        image_file_name: 'sv001.jpg',
        image_relative_path: 'image/sv001.jpg',
        graduation_batch_id: 'batch1',
        batch_name: 'Đợt 1',
        degree_award_status: 'pending',
        status: 'registered',
        ts_checkin: null,
        ts_called: null,
        ts_on_stage: null,
        ts_returned: null,
        src_on_stage: null,
        staff_presenter: null,
      },
    ],
    session_state: {
      current_on_stage_msv: null,
      pending_msv: null,
      mode: 'auto',
      last_scan_msv: null,
      last_scan_ts: null,
      broadcast_count: 0,
      sync_queue: [],
    },
    _synced_at: '2026-07-16T00:00:00Z',
    _bundle_version: '1',
  };
}

describe('ceremony-db round-trip', () => {
  let executor: BetterSqlite3Executor;

  beforeEach(() => {
    executor = new BetterSqlite3Executor(':memory:');
    runMigrations(executor);
  });

  it('ghi và đọc lại bundle đúng nguyên trạng, bao gồm field nested JSON', () => {
    const bundle = sampleBundle();
    saveCeremonyBundle(executor, bundle);

    const loaded = getCeremonyBundle(executor, 'default');
    expect(loaded).not.toBeNull();
    expect(loaded!.ceremony.name).toBe(bundle.ceremony.name);
    expect(loaded!.ceremony.idle_image_variants).toEqual({ '16:9': 'idle_16_9.jpg' });
    expect(loaded!.config.layout_overrides).toEqual({ a: { image: 'foo.png' } });
    expect(loaded!.config.custom_variables).toHaveLength(1);
    expect(loaded!.config.custom_variables![0].rules).toHaveLength(1);
    expect(loaded!.config.custom_variables![0].rules[0].result).toBe('Kỹ sư');
    expect(loaded!.students).toHaveLength(1);
    expect(loaded!.students[0].full_name).toBe('Nguyễn Văn A');
  });

  it('saveCeremonyBundle gọi lại lần 2 (update) không tạo ceremony trùng', () => {
    const bundle = sampleBundle();
    saveCeremonyBundle(executor, bundle);
    saveCeremonyBundle(executor, { ...bundle, ceremony: { ...bundle.ceremony, name: 'Đổi tên' } });

    const rows = executor.query('SELECT * FROM ceremony');
    expect(rows).toHaveLength(1);
    const loaded = getCeremonyBundle(executor, 'default');
    expect(loaded!.ceremony.name).toBe('Đổi tên');
  });

  it('patchStudent UPDATE ngay lập tức, không cần saveCeremonyBundle lại', () => {
    const bundle = sampleBundle();
    saveCeremonyBundle(executor, bundle);
    const ceremonyId = executor.query<{ id: number }>('SELECT id FROM ceremony')[0]!.id;

    patchStudent(executor, ceremonyId, 'SV001', { status: 'checked_in', ts_checkin: '2026-07-16T08:00:00Z' });
    patchStudent(executor, ceremonyId, 'SV001', { status: 'called' });

    const student = findStudentByCode(executor, ceremonyId, 'SV001');
    expect(student!.status).toBe('called');
    expect(student!.ts_checkin).toBe('2026-07-16T08:00:00Z');
  });

  it('runMigrations gọi lại nhiều lần là no-op an toàn', () => {
    runMigrations(executor);
    runMigrations(executor);
    const versions = executor.query('SELECT version FROM schema_version');
    expect(versions).toHaveLength(1);
  });
});
