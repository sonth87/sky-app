// 2026-08-12 — đổi `effect_preset` → `tts_effect_preset` cho khớp quy ước tiền tố module.
//
// Bối cảnh: file SQLite này là DB DÙNG CHUNG của cả app (18 bảng từ 5 module), không phải
// của riêng Ceremony — package vừa được đổi tên `ceremony-db` → `app-db` cùng ngày. Quy ước
// đặt tên bảng từ nay: `<module>_<tên>` (xem AGENTS.md §"Quy ước đặt tên bảng").
//
// Quy ước này vốn đã tự hình thành ở các module thêm sau (`layout_*`, `event_*`,
// `data_source_*`); chỉ có nhóm bảng cũ nhất (`ceremony`, `app_config`, `asset`,
// `variable_registry`, `field_mapping_profile`) là để trần.
//
// **Cố ý CHỈ đổi `effect_preset`, không đụng nhóm cũ.** Bảng đó thêm hôm qua (migration 015)
// và chưa phát hành nên đổi tên là rẻ. Đổi tên bảng đang có dữ liệu thật của người dùng chỉ
// để cho đẹp là rủi ro không đáng: mỗi bảng như vậy kéo theo query, IPC handler, adapter, và
// một migration không thể rollback.
//
// `ALTER TABLE ... RENAME TO` giữ nguyên dữ liệu, index và ràng buộc UNIQUE của cột `name`.
export const SQL_016_TTS_TABLE_PREFIX = `
ALTER TABLE effect_preset RENAME TO tts_effect_preset;
`;
