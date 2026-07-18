// variable_registry — theo docs/roadmap/plans/layout-designer/09-quy-dinh-variable.md §2.6.

import type { SqlExecutor } from '../sql-executor.js';

export interface VariableRegistryEntry {
  key: string;
  firstUsedAt: string;
  lastUsedAt: string;
  usageCount: number;
}

interface VariableRegistryRow {
  key: string;
  first_used_at: string;
  last_used_at: string;
  usage_count: number;
}

function rowToEntry(row: VariableRegistryRow): VariableRegistryEntry {
  return { key: row.key, firstUsedAt: row.first_used_at, lastUsedAt: row.last_used_at, usageCount: row.usage_count };
}

/**
 * Ghi nhận 1 token vừa được chèn — INSERT nếu key chưa có, UPDATE usage_count+1/last_used_at
 * nếu đã có (file 09 §2.6). Gọi mỗi khi user chèn xong 1 token mới ở BẤT KỲ layout nào.
 */
export function recordTokenUsage(executor: SqlExecutor, key: string): void {
  const now = new Date().toISOString();
  executor.transaction(() => {
    const changes = executor.run('UPDATE variable_registry SET usage_count = usage_count + 1, last_used_at = ? WHERE key = ?', [now, key]).changes;
    if (changes === 0) {
      executor.run('INSERT INTO variable_registry (key, first_used_at, last_used_at, usage_count) VALUES (?, ?, ?, 1)', [key, now, now]);
    }
  });
}

/** Gợi ý autocomplete — sắp theo usage_count giảm dần (file 09 §2.6 "gợi ý cái hay dùng lên trước"). */
export function listTopVariables(executor: SqlExecutor, limit = 50): VariableRegistryEntry[] {
  const rows = executor.query<VariableRegistryRow>('SELECT * FROM variable_registry ORDER BY usage_count DESC LIMIT ?', [limit]);
  return rows.map(rowToEntry);
}
