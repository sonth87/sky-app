// Query cho bảng `effect_preset` — cấu hình hiệu ứng hậu kỳ audio TTS (migration 015).
//
// Preset nằm ở đây (TypeScript/ceremony-db) chứ không ở tiến trình Python — nơi thật sự
// áp hiệu ứng — vì Python của tts-service hoàn toàn cách ly với DB này. Renderer tra
// preset qua các hàm dưới đây rồi gửi `effects_chain` đã resolve kèm request /synthesize.
// Xem đầu file 015_effect_preset.ts cho lý do đầy đủ.

import type { SqlExecutor } from '../sql-executor.js';

/** Một hiệu ứng trong chuỗi. `params` khớp `EFFECT_REGISTRY` ở tts-service/server/effects.py. */
export interface EffectConfig {
  type: string;
  enabled: boolean;
  params: Record<string, number>;
}

export interface EffectPreset {
  id: string;
  name: string;
  description: string | null;
  effectsChain: EffectConfig[];
  /** true = preset dựng sẵn, không cho sửa/xoá (chỉ dùng làm điểm bắt đầu). */
  isBuiltin: boolean;
  sortOrder: number;
  createdAt: string;
}

interface EffectPresetRow {
  id: string;
  name: string;
  description: string | null;
  effects_chain: string;
  is_builtin: number;
  sort_order: number;
  created_at: string;
}

function toPreset(row: EffectPresetRow): EffectPreset {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    // Chuỗi hỏng (sửa tay ngoài app) không được làm sập cả danh sách — preset đó hiện
    // rỗng, các preset khác vẫn dùng được.
    effectsChain: safeParseChain(row.effects_chain),
    isBuiltin: row.is_builtin === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

function safeParseChain(raw: string): EffectConfig[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as EffectConfig[]) : [];
  } catch {
    return [];
  }
}

export function listEffectPresets(ex: SqlExecutor): EffectPreset[] {
  const rows = ex.query<EffectPresetRow>(
    'SELECT * FROM tts_effect_preset ORDER BY sort_order, name',
  );
  return rows.map(toPreset);
}

export function getEffectPreset(ex: SqlExecutor, id: string): EffectPreset | null {
  const rows = ex.query<EffectPresetRow>('SELECT * FROM tts_effect_preset WHERE id = ?', [id]);
  return rows.length > 0 ? toPreset(rows[0]!) : null;
}

/**
 * Tạo preset của người dùng. Ném lỗi nếu trùng tên (cột UNIQUE) — bắt trước để trả thông
 * báo đọc được thay vì để lỗi ràng buộc SQLite nổi lên renderer.
 *
 * `sortOrder` cố định 100: mọi preset tự tạo xếp SAU 4 preset dựng sẵn (sort_order 0-3),
 * trong nhóm đó thì sắp theo tên (xem listEffectPresets).
 */
export function createEffectPreset(
  ex: SqlExecutor,
  id: string,
  name: string,
  effectsChain: EffectConfig[],
  description?: string,
): EffectPreset {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Tên preset không được để trống');

  const dup = ex.query<{ id: string }>('SELECT id FROM tts_effect_preset WHERE name = ?', [trimmed]);
  if (dup.length > 0) throw new Error(`Đã có preset tên "${trimmed}"`);

  const createdAt = new Date().toISOString();
  ex.run(
    `INSERT INTO tts_effect_preset (id, name, description, effects_chain, is_builtin, sort_order, created_at)
     VALUES (?, ?, ?, ?, 0, 100, ?)`,
    [id, trimmed, description ?? null, JSON.stringify(effectsChain), createdAt],
  );
  return {
    id, name: trimmed, description: description ?? null,
    effectsChain, isBuiltin: false, sortOrder: 100, createdAt,
  };
}

/** Sửa preset người dùng. Preset dựng sẵn KHÔNG sửa được — ném lỗi. */
export function updateEffectPreset(
  ex: SqlExecutor,
  id: string,
  patch: { name?: string; description?: string; effectsChain?: EffectConfig[] },
): EffectPreset | null {
  const current = getEffectPreset(ex, id);
  if (!current) return null;
  if (current.isBuiltin) throw new Error('Không sửa được preset dựng sẵn — hãy lưu thành preset mới');

  const name = patch.name?.trim() ?? current.name;
  if (!name) throw new Error('Tên preset không được để trống');
  if (name !== current.name) {
    const dup = ex.query<{ id: string }>('SELECT id FROM tts_effect_preset WHERE name = ?', [name]);
    if (dup.length > 0) throw new Error(`Đã có preset tên "${name}"`);
  }

  const description = patch.description ?? current.description;
  const chain = patch.effectsChain ?? current.effectsChain;
  ex.run(
    'UPDATE tts_effect_preset SET name = ?, description = ?, effects_chain = ? WHERE id = ?',
    [name, description, JSON.stringify(chain), id],
  );
  return { ...current, name, description, effectsChain: chain };
}

/** Xoá preset người dùng. Preset dựng sẵn KHÔNG xoá được — ném lỗi. */
export function deleteEffectPreset(ex: SqlExecutor, id: string): boolean {
  const current = getEffectPreset(ex, id);
  if (!current) return false;
  if (current.isBuiltin) throw new Error('Không xoá được preset dựng sẵn');
  ex.run('DELETE FROM tts_effect_preset WHERE id = ?', [id]);
  return true;
}
