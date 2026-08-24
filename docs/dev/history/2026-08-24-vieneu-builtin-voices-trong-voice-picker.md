# 2026-08-24 — Đưa 20 giọng built-in của VieNeu 3.3.0 vào voice picker

**Quyết định:** Merge 20 preset voice built-in của VieNeu 3.3.0 (`Vieneu._preset_voices`, không
cần ref audio — xem [nâng cấp vieneu 3.3.0](./2026-08-24-nang-cap-vieneu-3-3-0.md)) vào
`voice_registry` như entry `type: "preset"` bình thường (KHÔNG dựng endpoint/luồng riêng), để
tái dùng nguyên vẹn `/voices`, `/synthesize`, `/preview` đã có — chỉ thêm mã build tagline/
category/accent để filter được giống catalog vendor. Frontend thêm field `builtin` trên
`VoiceListItem` để đổi màu dấu tích (xanh = built-in engine, cam = catalog vendor sky-app tự
curate) — cả 2 vẫn chung tab "Hệ thống" như yêu cầu.

**Lý do:** 20 giọng này đã nằm sẵn trong lib sau khi nâng vieneu lên 3.3.0 nhưng KHÔNG có
đường nào tới người dùng (đã audit kỹ trước khi làm — `hidden` mặc định + không có code
frontend nào đụng tới `synthesize_preset`). User muốn dùng luôn, coi như 1 nguồn giọng hệ
thống thứ 2 song song catalog vendor (`resources/voice-ref/`).

**Vì sao merge vào registry thay vì endpoint `/voices/builtin` riêng (phương án đầu tiên đã
cân nhắc):** `/synthesize` ĐÃ có nhánh generic xử lý mọi voice `type != "cloned"` (tra
`get_preset_id()` rồi gọi `synthesize_preset()`) — voice nào cũng qua path đó nếu nằm trong
registry, không cần biết nó tĩnh (`PRESET_VOICES` cũ, 10 giọng) hay động (giọng mới). Tạo
endpoint riêng sẽ phải lặp lại nguyên logic auto-ready/preview-fallback mà `_ensure_voice_ready`/
`get_preview` đã làm cho catalog vendor — không cần thiết vì preset không có bước "encode"
(không như cloned voice phải encode_reference trước).

**Bug thật gặp lúc verify (test bằng model thật, không phải đọc code suông):**
- `engine.list_presets()` đọc `self._model._preset_voices` — nhưng lib KHÔNG giữ field
  `region` trong dict runtime (dù JSON asset gốc `voices_v3_turbo.json` CÓ field này) —
  `_load_v3_voices()` của lib chỉ copy description/gender/style/speaker_emb/codes. Fix: parse
  lại `region` từ `description` (định dạng ổn định `"{Giới} · {Vùng} · {Phong cách}"`, đã verify
  cả 20 giọng) thay vì tin field `region` trực tiếp. Nếu không bắt bug này, mọi giọng builtin sẽ
  có `accent: null` → không lọc được theo vùng miền, và tagline thiếu chữ vùng miền.
- Template mô tả ban đầu bị lặp từ: style `doc_truyen` → nhãn "Đọc truyện" đã có sẵn chữ "đọc",
  cộng thêm tiền tố "phong cách đọc " cứng thành "phong cách đọc đọc truyện". Fix: bỏ tiền tố
  cứng, để nguyên nhãn style (đã tự nhiên có "đọc" hoặc không tuỳ trường hợp) hạ chữ thường chèn
  thẳng vào câu.

**Vì sao KHÔNG đặt `type: "builtin"` (tên rõ nghĩa hơn "preset"):** migration `017_tts_voice.ts`
có `CHECK (type IN ('cloned', 'preset'))` ở tầng SQLite — insert `type: "builtin"` sẽ FAIL
constraint này ngay (phát hiện được lúc đọc migration trước khi viết code, không phải lúc chạy
mới biết). Tái dùng `"preset"` còn khớp quy ước sẵn có ở `modules/ceremony/src/control/
components/voiceCatalog.ts:48` (`v.type === 'preset' → tag 'builtin'`) — code đó đã ngầm hiểu
`type: "preset"` = giọng built-in từ trước, không phải khái niệm tôi mới đặt ra.

**Cạm bẫy đặt tên đã tránh:** `modules/tts-studio/src/TtsStudioApp.tsx`'s `refreshVoices()` có
sẵn 1 field `type: 'preset'` CỤC BỘ (gán cho catalog vendor CHƯA import — chỉ để đánh dấu nội
bộ, không liên quan registry). Nếu giữ nguyên rồi suy `builtin = item.type === 'preset'` ở
`VoicePicker.tsx` sẽ khiến MỌI catalog vendor chưa import bị nhận nhầm thành giọng built-in
(dấu tích sai màu). Đã bỏ field cục bộ đó (không ai dùng tới, đã grep xác nhận) thay vì đổi tên
"preset" thật ở registry.

**Preview ("nghe thử"):** built-in không có bản ghi gốc để phát trực tiếp (khác catalog vendor)
— PHẢI tổng hợp bằng TTS. Mở rộng `generate_previews.py` (script build-time có sẵn, vốn đã xử
lý đúng tình huống này cho 2 giọng preset cũ) đọc thẳng `tts._preset_voices` (không phụ thuộc
`voice-registry.json` đã merge hay chưa — tránh phụ thuộc thứ tự chạy giữa script và server) để
sinh `builtin-{slug}.wav`. id slug (bỏ dấu tiếng Việt) dùng chung `slug.py` giữa `main.py` và
`generate_previews.py` — lệch nhau dù 1 ký tự cũng khiến `/preview/{id}` 404 câm lặng.

**Verify:** Chạy server thật (model bundled, offline) — `/voices` trả đủ 20 builtin voice với
accent/category/tagline đúng; `/synthesize` với `speaker_id=builtin-minh-duc` chạy được NGAY,
không cần sửa gì thêm ở endpoint đó (đúng như thiết kế); chạy `generate_previews.py` thật sinh
đủ 20 file, `/preview/builtin-adam` sau đó trả 200 đúng file. `pytest tests/` 404/404 xanh (14
test mới cho `merge_presets`/`list_presets`/`_builtin_registry_entries`, gồm cả 2 kho lưu
JSON/SQLite). Frontend: `pnpm turbo run typecheck` xanh cho `voice-catalog-ui`,
`module-tts-studio`, VÀ `module-ceremony` (dùng chung `VoiceListItem`, không đụng field mới nên
không ảnh hưởng). **Chưa verify bằng browser thật** (không có `chromium-cli`/Playwright sẵn
trong môi trường lúc làm) — badge/filter UI mới chỉ được trace tay qua code, chưa chụp màn hình
thật xác nhận hiển thị đúng.

**Liên quan:** [`apps/tts-service/server/main.py`](../../../apps/tts-service/server/main.py)
(`_builtin_registry_entries`, lifespan merge), [`voice_registry.py`](../../../apps/tts-service/server/voice_registry.py)
(`merge_presets`), [`engine.py`](../../../apps/tts-service/server/engine.py) (`list_presets`),
[`generate_previews.py`](../../../apps/tts-service/server/generate_previews.py),
[`packages/voice-catalog-ui/src/VoiceRow.tsx`](../../../packages/voice-catalog-ui/src/VoiceRow.tsx),
[`modules/tts-studio/src/components/VoicePicker.tsx`](../../../modules/tts-studio/src/components/VoicePicker.tsx),
[2026-08-24 — nâng cấp vieneu 3.3.0](./2026-08-24-nang-cap-vieneu-3-3-0.md).
