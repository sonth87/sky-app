// FieldMappingProfile query — Giai đoạn 4a kế hoạch Event. Lưu PERSISTENT (quyết định chốt qua
// AskUserQuestion 2026-07-19) — theo đúng pattern queries/layout.ts (interface Row snake_case +
// rowToX() map camelCase, hàm nhận executor đầu tiên).

import type { SqlExecutor } from '../sql-executor.js';
import type { FieldMappingProfile, MappingRule } from '@sky-app/slide-shared';

interface FieldMappingProfileRow {
  id: string;
  label: string;
  subject_type: string;
  natural_key_field: string;
  map_json: string;
  sample_json: string | null;
  created_at: string;
  updated_at: string;
}

function rowToProfile(row: FieldMappingProfileRow): FieldMappingProfile {
  return {
    id: row.id,
    label: row.label,
    subjectType: row.subject_type,
    naturalKeyField: row.natural_key_field,
    map: JSON.parse(row.map_json) as Record<string, MappingRule>,
    sample: row.sample_json ? (JSON.parse(row.sample_json) as Record<string, string>) : undefined,
  };
}

export function listFieldMappingProfiles(executor: SqlExecutor): FieldMappingProfile[] {
  const rows = executor.query<FieldMappingProfileRow>('SELECT * FROM field_mapping_profile ORDER BY updated_at DESC');
  return rows.map(rowToProfile);
}

/** Insert nếu chưa tồn tại, UPDATE nếu đã có (upsert theo id) — cho phép "sửa mẫu đã lưu". */
export function saveFieldMappingProfile(executor: SqlExecutor, profile: FieldMappingProfile): void {
  const now = new Date().toISOString();
  const mapJson = JSON.stringify(profile.map);
  const sampleJson = profile.sample ? JSON.stringify(profile.sample) : null;
  executor.transaction(() => {
    const changes = executor.run(
      'UPDATE field_mapping_profile SET label = ?, subject_type = ?, natural_key_field = ?, map_json = ?, sample_json = ?, updated_at = ? WHERE id = ?',
      [profile.label, profile.subjectType, profile.naturalKeyField, mapJson, sampleJson, now, profile.id],
    ).changes;
    if (changes === 0) {
      executor.run(
        'INSERT INTO field_mapping_profile (id, label, subject_type, natural_key_field, map_json, sample_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [profile.id, profile.label, profile.subjectType, profile.naturalKeyField, mapJson, sampleJson, now, now],
      );
    }
  });
}
