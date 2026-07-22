import { SQL_001_CEREMONY_CORE } from './001_ceremony_core.js';
import { SQL_002_LAYOUT_VERSIONING } from './002_layout_versioning.js';
import { SQL_003_VARIABLE_REGISTRY } from './003_variable_registry.js';
import { SQL_004_ASSET_LIBRARY } from './004_asset_library.js';
import { SQL_005_EVENT_DATA_SOURCE } from './005_event_data_source.js';
import { SQL_006_FIELD_MAPPING_PROFILE } from './006_field_mapping_profile.js';
import { SQL_007_CANONICAL_CORE_FIELDS } from './007_canonical_core_fields.js';
import { SQL_008_EVENT_LAYOUT_REF_ROLE } from './008_event_layout_ref_role.js';
import { SQL_009_DROP_STUDENT_SCHEMA } from './009_drop_student_schema.js';
import { SQL_010_LAYOUT_DOCUMENT_COLOR } from './010_layout_document_color.js';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * Danh sách migration theo thứ tự — mỗi giai đoạn mới chỉ THÊM 1 entry vào cuối mảng này
 * (kèm file NNN_ten.ts export 1 string SQL_NNN_TEN tương ứng), không sửa lại các entry cũ
 * đã áp dụng. SQL nhúng trực tiếp dạng string TS (không đọc file .sql lúc runtime) để dùng
 * chung được cho Electron bundle inline lẫn sql.js trong trình duyệt — xem 001_ceremony_core.ts.
 */
export const MIGRATIONS: Migration[] = [
  { version: 1, name: 'ceremony_core', sql: SQL_001_CEREMONY_CORE },
  { version: 2, name: 'layout_versioning', sql: SQL_002_LAYOUT_VERSIONING },
  { version: 3, name: 'variable_registry', sql: SQL_003_VARIABLE_REGISTRY },
  { version: 4, name: 'asset_library', sql: SQL_004_ASSET_LIBRARY },
  { version: 5, name: 'event_data_source', sql: SQL_005_EVENT_DATA_SOURCE },
  { version: 6, name: 'field_mapping_profile', sql: SQL_006_FIELD_MAPPING_PROFILE },
  { version: 7, name: 'canonical_core_fields', sql: SQL_007_CANONICAL_CORE_FIELDS },
  { version: 8, name: 'event_layout_ref_role', sql: SQL_008_EVENT_LAYOUT_REF_ROLE },
  { version: 9, name: 'drop_student_schema', sql: SQL_009_DROP_STUDENT_SCHEMA },
  { version: 10, name: 'layout_document_color', sql: SQL_010_LAYOUT_DOCUMENT_COLOR },
];
