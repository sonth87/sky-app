import { SQL_001_CEREMONY_CORE } from './001_ceremony_core.js';
import { SQL_002_LAYOUT_VERSIONING } from './002_layout_versioning.js';
import { SQL_003_VARIABLE_REGISTRY } from './003_variable_registry.js';

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
];
