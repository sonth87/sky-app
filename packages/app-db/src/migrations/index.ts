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
import { SQL_011_EVENT_COLOR } from './011_event_color.js';
import { SQL_012_LAYOUT_DOCUMENT_CATEGORY_TAGS } from './012_layout_document_category_tags.js';
import { SQL_013_LAYOUT_DOCUMENT_TRASH } from './013_layout_document_trash.js';
import { SQL_014_LAYOUT_COMPONENT } from './014_layout_component.js';
import { SQL_015_EFFECT_PRESET } from './015_effect_preset.js';
import { SQL_016_TTS_TABLE_PREFIX } from './016_tts_table_prefix.js';
import { SQL_017_TTS_VOICE } from './017_tts_voice.js';
import { SQL_018_TTS_VOICE_SAMPLE } from './018_tts_voice_sample.js';
import { SQL_019_TTS_GENERATION_HISTORY } from './019_tts_generation_history.js';

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
  { version: 11, name: 'event_color', sql: SQL_011_EVENT_COLOR },
  { version: 12, name: 'layout_document_category_tags', sql: SQL_012_LAYOUT_DOCUMENT_CATEGORY_TAGS },
  { version: 13, name: 'layout_document_trash', sql: SQL_013_LAYOUT_DOCUMENT_TRASH },
  { version: 14, name: 'layout_component', sql: SQL_014_LAYOUT_COMPONENT },
  { version: 15, name: 'effect_preset', sql: SQL_015_EFFECT_PRESET },
  { version: 16, name: 'tts_table_prefix', sql: SQL_016_TTS_TABLE_PREFIX },
  { version: 17, name: 'tts_voice', sql: SQL_017_TTS_VOICE },
  { version: 18, name: 'tts_voice_sample', sql: SQL_018_TTS_VOICE_SAMPLE },
  { version: 19, name: 'tts_generation_history', sql: SQL_019_TTS_GENERATION_HISTORY },
];
