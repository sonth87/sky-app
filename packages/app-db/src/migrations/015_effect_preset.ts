// 2026-08-11 — bảng effect_preset: cấu hình hiệu ứng hậu kỳ cho audio TTS
// (reverb, delay, pitch shift...). Cấu hình ở app TTS Studio.
//
// Vì sao preset nằm ở ĐÂY chứ không ở tiến trình Python (nơi thật sự áp hiệu ứng):
// tiến trình Python của tts-service hoàn toàn CÁCH LY với DB này — nó không nhận đường
// dẫn ceremony.db nào (xem danh sách env ở python-server.ts) và không có driver SQL trong
// requirements. Renderer tra preset ở đây rồi gửi `effects_chain` đã resolve kèm mỗi
// request /synthesize; Python chỉ việc áp dụng, không biết khái niệm "preset".
// (voicebox — app tham chiếu — lưu trong SQLite của chính backend Python được vì bên đó
// backend và DB cùng một tiến trình.)
//
// effects_chain: JSON.stringify của mảng {type, enabled, params} — theo đúng quy ước
//   "cấu trúc lồng nhau thì lưu JSON trong cột TEXT" đã dùng cho tags_json/content_json.
//   Dạng chuỗi khớp `EFFECT_REGISTRY` ở apps/tts-service/server/effects.py.
// is_builtin: 1 = preset dựng sẵn, KHÔNG cho sửa/xoá (chỉ dùng làm điểm bắt đầu rồi
//   "Lưu thành preset mới"). Giống voicebox's services/effects.py.
// name UNIQUE: người dùng tự đặt tên, trùng tên thì không phân biệt được trong danh sách.
//
// 4 preset dựng sẵn seed ngay trong migration — tham số copy nguyên từ voicebox's
// BUILTIN_PRESETS (backend/utils/effects.py), giữ nguyên các giá trị đã tinh chỉnh.
// Test `apps/tts-service/tests/test_effects.py::test_4_preset_built_in_hop_le_va_chay_duoc`
// giữ bản sao của 4 chuỗi này và chốt rằng chúng hợp lệ với bảng hiệu ứng phía Python —
// seed một chuỗi sai vào đây thì lỗi chỉ lộ lúc người dùng bấm phát, mà migration đã chạy
// rồi thì sửa code không đủ, phải xử lý cả DB cũ.
export const SQL_015_EFFECT_PRESET = `
CREATE TABLE effect_preset (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  effects_chain TEXT NOT NULL,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

INSERT INTO effect_preset (id, name, description, effects_chain, is_builtin, sort_order, created_at) VALUES
  ('builtin-robotic', 'Giọng robot',
   'Giọng kim loại, máy móc (flanger LFO chậm, hồi tiếp cao)',
   '[{"type":"chorus","enabled":true,"params":{"rate_hz":0.2,"depth":1.0,"feedback":0.35,"centre_delay_ms":7.0,"mix":0.5}}]',
   1, 0, '2026-08-11T00:00:00.000Z'),

  ('builtin-radio', 'Giọng radio',
   'Giọng mỏng như đài AM — lọc băng hẹp kèm nén nhẹ',
   '[{"type":"highpass","enabled":true,"params":{"cutoff_frequency_hz":300.0}},{"type":"lowpass","enabled":true,"params":{"cutoff_frequency_hz":3500.0}},{"type":"compressor","enabled":true,"params":{"threshold_db":-15.0,"ratio":6.0,"attack_ms":5.0,"release_ms":50.0}},{"type":"gain","enabled":true,"params":{"gain_db":6.0}}]',
   1, 1, '2026-08-11T00:00:00.000Z'),

  ('builtin-echo-chamber', 'Phòng vang',
   'Không gian rộng, vang dày kèm tiếng vọng đuôi',
   '[{"type":"reverb","enabled":true,"params":{"room_size":0.85,"damping":0.3,"wet_level":0.45,"dry_level":0.55,"width":1.0}},{"type":"delay","enabled":true,"params":{"delay_seconds":0.25,"feedback":0.3,"mix":0.2}}]',
   1, 2, '2026-08-11T00:00:00.000Z'),

  ('builtin-deep-voice', 'Giọng trầm',
   'Hạ cao độ, thêm độ ấm',
   '[{"type":"pitch_shift","enabled":true,"params":{"semitones":-3.0}},{"type":"lowpass","enabled":true,"params":{"cutoff_frequency_hz":6000.0}},{"type":"compressor","enabled":true,"params":{"threshold_db":-18.0,"ratio":3.0,"attack_ms":10.0,"release_ms":150.0}}]',
   1, 3, '2026-08-11T00:00:00.000Z');
`;
