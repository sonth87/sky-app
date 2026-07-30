// applyFieldMap — nối backdrop trao giải/màn chờ sang LayoutRenderer thật (2026-07-28). Áp
// `EventLayoutRef.fieldMap` vào 1 CanonicalRecord thật để ra record "đã ghép field": LayoutRenderer
// chỉ biết tra `record.extra[token]` (qua `resolveCanonicalField`), KHÔNG biết gì về fieldMap/
// CustomVariable — đây là hàm cầu nối DUY NHẤT giữa 2 tầng đó, dùng chung cho cả layout trao giải
// (record thật đang lên sân khấu) lẫn màn chờ (record giả từ `eventToIdleRecord`).
//
// Giới hạn đã biết: với `CanonicalGroup` (LoopItem, trao giải tập thể), fieldMap chỉ áp vào field
// của CHÍNH nhóm (`extra` cấp group) — `LoopItemView` (renderer.tsx) đọc field của TỪNG member qua
// `resolveCanonicalField(member, key)` thẳng từ member, không đi qua `extra` nhóm cha. Token trong
// `itemTemplate` của LoopItem vì vậy KHÔNG được map qua fieldMap. Không mở rộng phạm vi ở đợt này.

import type { CanonicalRecord } from './canonical.js';
import { flattenCanonicalRecord } from './canonical.js';
import type { FieldMapSource } from './event.js';
import { resolveCustomVariables } from './event.js';
import type { CustomVariable } from '../types.js';

export function applyFieldMap(
  record: CanonicalRecord,
  fieldMap: Record<string, FieldMapSource>,
  customVariables: CustomVariable[],
): CanonicalRecord {
  const flat = flattenCanonicalRecord(record);
  const computed = resolveCustomVariables(flat, customVariables);
  const extra: Record<string, string | number> = { ...record.extra };
  for (const [token, source] of Object.entries(fieldMap)) {
    if (source.kind === 'raw') extra[token] = flat[source.sourceKey] ?? '';
    else if (source.kind === 'computed') extra[token] = computed[source.variableKey] ?? '';
    // 'unmapped' → bỏ qua, token resolve rỗng ở LayoutRenderer (fail-soft, đúng hành vi resolveTokens).
  }
  return { ...record, extra };
}
