/**
 * Nguồn chân lý duy nhất cho tên key localStorage dùng bởi zustand/persist (store.ts)
 * VÀ 2 module đọc trực tiếp localStorage TRƯỚC KHI React mount (i18n.ts, theme.ts) —
 * để tránh FOUC (ngôn ngữ/theme sai ngay frame đầu tiên).
 *
 * Lịch sử: bản gốc (trao-bang-tot-nghiep-2026) dùng `slide-control-storage`. Khi port
 * sang sky-app/Ceremony, key đổi thành `ceremony-control-storage` (rebrand) nhưng thiếu
 * migration — user nâng cấp từ app cũ mất toàn bộ cấu hình đã lưu (bug GĐ7.5 BUG-005).
 *
 * `readPersistedState()` là helper dùng chung: đọc theo key MỚI trước, nếu chưa có thì
 * fallback đọc theo key CŨ (đúng logic mà `persist()`'s `migrate` option áp dụng cho
 * store.ts — nhưng i18n.ts/theme.ts không đi qua zustand/persist nên phải tự làm y hệt).
 */

export const STORAGE_KEY = 'ceremony-control-storage';
export const OLD_STORAGE_KEY = 'slide-control-storage';

/**
 * Đọc `parsed.state` từ localStorage theo `STORAGE_KEY`; nếu chưa tồn tại (user chưa
 * từng chạy app mới), fallback đọc theo `OLD_STORAGE_KEY` (app cũ trao-bang-tot-nghiep-2026).
 * Trả về `null` nếu không có ở cả 2 nơi, hoặc JSON không hợp lệ.
 */
export function readPersistedState(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(OLD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.state ?? null;
  } catch {
    return null;
  }
}
