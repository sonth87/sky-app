// Giai đoạn 2.5 — variable_registry, theo docs/roadmap/plans/layout-designer/
// 09-quy-dinh-variable.md §2.6. Bảng gợi ý toàn cục (dùng chung cho TOÀN BỘ layout-designer,
// KHÔNG gắn với 1 layout cụ thể) — ghi nhận mỗi lần user chèn 1 token `@key` mới ở BẤT KỲ
// layout nào, để autocomplete gợi ý "đã từng dùng" sắp theo usage_count. KHÔNG phải nơi định
// nghĩa/validate biến (không có kind/format/rule) — chỉ là lịch sử gõ để tránh gõ sai/trùng lặp.
export const SQL_003_VARIABLE_REGISTRY = `
CREATE TABLE IF NOT EXISTS variable_registry (
  key            TEXT PRIMARY KEY,
  first_used_at  TEXT NOT NULL,
  last_used_at   TEXT NOT NULL,
  usage_count    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_variable_registry_usage ON variable_registry(usage_count DESC);
`;
