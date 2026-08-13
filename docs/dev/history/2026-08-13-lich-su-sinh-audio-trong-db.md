# 2026-08-13 — Lịch sử sinh audio trong DB dùng chung (Phase 3)

> Tiếp theo [Phase 2 — một giọng nhiều mẫu audio](./2026-08-12-mot-giong-nhieu-mau-multi-sample.md),
> vốn đã chốt: *"Phase 3 (lịch sử sinh audio trong DB) là bước tiếp theo trong kế hoạch"*.

Chuyển "lịch sử tạo audio" từ chỗ rời rạc (IndexedDB riêng của TTS Studio, chỉ thấy trên đúng
máy/cửa sổ đã tạo, cap cứng 30 bản) sang bảng SQLite dùng chung (`tts_generation_history`,
migration 019) — do tiến trình Python của tts-service ghi, đúng nguyên tắc "một chủ ghi mỗi
bảng" (AGENTS.md §2.1).

## Phát hiện lúc research: caller thứ 4, không nằm trong phạm vi đã chốt ban đầu

Trước khi code, đã hỏi Sonth 3 câu để chốt phạm vi: ghi TẤT CẢ lượt `/synthesize` (Ceremony
thật + TTS Studio + warmup), CÓ lưu WAV thật (không phải BLOB), và làm CẢ UI đọc lại trong lần
này luôn (thay hẳn IndexedDB).

Lúc rà code mới phát hiện **`pregen-queue.ts` cũng gọi thẳng `/synthesize`** — không qua
`vieneu-tts.ts` nên bị bỏ sót khi liệt kê caller ban đầu. Đây mới là nguồn gọi **nhiều nhất
trên thực tế**: `docs/roadmap/plans/ga7.5-audit/04-tong-hop-va-fix.md:402` xác nhận quy mô sự
kiện thật có thể **500-1000+ sinh viên** — 1 lượt pregen trước buổi lễ = 500-1000+ lời gọi dồn
dập. Audio pregen đã lưu vĩnh viễn riêng ở `ttsPregenWavPath(batchId, studentCode)` (không có
cơ chế dọn) — nếu lưu thêm 1 bản WAV nữa vào thư mục lịch sử cho MỖI lượt pregen thì tốn gấp
đôi dung lượng cho đúng nguồn tốn nhiều nhất, và một cap nhỏ sẽ bị 1 batch nuốt sạch ngay.

**Quyết định (lệch so với 3 câu trả lời gốc, ghi lại rõ ràng):** vẫn ghi 1 dòng lịch sử cho
nguồn `pregen` (đúng tinh thần "ghi TẤT CẢ", có giá trị audit) nhưng **KHÔNG lưu file WAV
trùng lặp** — cột `audio_file` để trống, vì audio thật đã có sẵn ở `ttsPregenDir`. Cap dung
lượng nhờ vậy chỉ cần bảo vệ các dòng thật sự có audio (Ceremony on-stage cache-miss, TTS
Studio, warmup) — số này nhỏ trong thực tế.

## Thiết kế

`tts_generation_history` (migration 019): `id, source, text, voice_id, voice_label, speed,
sample_rate, duration_ms, engine_id, quality_score, quality_flags_json, audio_file, error,
created_at`. `voice_id`/`voice_label` là SNAPSHOT lúc tạo, không FK tới `tts_voice` — lịch sử
phải vẫn đọc được sau khi giọng clone bị xoá.

`apps/tts-service/server/history_store.py` (mới) — mô phỏng `voice_registry.py`'s lớp SQL
nhưng ĐƠN GIẢN HƠN: không có lớp JSON dự phòng (mất lịch sử không phải mất dữ liệu nghiêm
trọng như mất giọng đã clone) — `db.connect()` trả `None` thì `create_history_store()` cũng
trả `None`, `main.py` tự bỏ qua việc ghi log, không có fallback nào khác. Retention: prune sau
mỗi lần ghi, 2 tiêu chí độc lập — quá `max_rows` (mặc định 5000) HOẶC quá `max_age_days` (mặc
định 90 ngày), kèm unlink file WAV tương ứng.

`main.py`'s `/synthesize` ghi lịch sử ở CẢ 2 nhánh: thành công (sau hiệu ứng, dùng đúng audio
cuối cùng đã trả cho client — trả kèm `X-History-Id` header) và lỗi thật (audio_file NULL,
`error` set). Lỗi 400 do speaker_id sai KHÔNG ghi dòng lịch sử — giữ đúng ý nghĩa "lịch sử các
lần đã thử sinh audio", không trùng lặp với `_write_log` đã có. Ghi lịch sử bọc try/except
riêng ở cả 2 nhánh — lỗi ghi log không bao giờ được làm hỏng response TTS thật.

**Bug có sẵn vá kèm:** `db.py`'s `REQUIRED_SCHEMA_VERSION` vẫn là 17, chưa từng bump lên 18 khi
`tts_voice_sample` ra đời ở Phase 2 — DB đứng đúng v17 + Python bản mới hơn thì `connect()`
tưởng đủ điều kiện nhưng `VoiceRegistrySqlite` query nhầm bảng chưa tồn tại →
`sqlite3.OperationalError` không bắt được. Bump thẳng lên 19 (đáp ứng luôn yêu cầu bảng mới).

4 caller gắn `source`: `vieneu-tts.ts` → `'ceremony'`, `tts-studio.ts` → `'tts_studio'`,
`python-server.ts`'s `warmupSessions()` → `'warmup'`, `pregen-queue.ts` → `'pregen'`.
`platform-web`'s `fetchSynthesize()` → `'web'` (cho nhất quán dữ liệu, dù Web chưa có UI đọc
lại lịch sử trong phase này).

`TtsPort` (packages/service-contracts) thêm 4 method OPTIONAL: `listHistory?`,
`getHistoryAudioUrl?`, `deleteHistoryEntry?`, `clearHistory?` — theo đúng pattern
`listVoiceSamples?`/`cloneVoice?` đã có, Web adapter không implement (degrade đúng AGENTS.md
§2 rule Isomorphic). `SynthesizeResult` thêm `historyId?` — client dựng entry lịch sử NGAY TẠI
CHỖ từ dữ liệu đã có (text/voiceLabel/speed/duration) + id từ header, không cần round-trip gọi
lại `listHistory()` sau mỗi lần generate.

TTS Studio: xoá hẳn `lib/history-db.ts` (IndexedDB) + test của nó, `HistoryList.tsx` giờ nhận
`ttsPort` prop, nghe lại/tải về qua `getHistoryAudioUrl()` (URL trỏ thẳng Python server, giống
`getTtsPreviewUrl`) thay vì blob từ IndexedDB.

## Kiểm chứng

`pnpm typecheck` toàn repo, `pnpm -w test` (platform-web/platform-electron/module-tts-studio
xanh — 2 test `create-web-platform.test.ts` phải cập nhật body request thêm `source: 'web'`
theo đúng thay đổi thật). `python3 -m py_compile` cho `main.py`/`history_store.py`/`db.py`.

**Chưa kiểm bằng Electron + Python thật** (không có công cụ mở app trong phiên code) — cần
Sonth tự làm: mở `dev:app`, generate vài lượt ở TTS Studio (xác nhận xuất hiện trong "Các bản
ghi gần đây", nghe lại + tải về hoạt động qua URL mới), phát thật 1-2 lượt ở Ceremony (xác nhận
dòng `source="ceremony"` xuất hiện trong DB), chạy 1 batch pregen nhỏ (xác nhận có dòng
`source="pregen"` nhưng KHÔNG tạo file WAV trùng trong `tts-history/`).

## Còn phải làm

- Chưa kiểm end-to-end thật schema 2 phía (TypeScript migrate → Python đọc) như Phase 1 đã làm
  thủ công cho `tts_voice` — nên lặp lại quy trình đó cho `tts_generation_history` trước khi
  phát hành.
- Cap mặc định 5000 dòng/90 ngày là suy luận từ quy mô sự kiện thật tìm được trong tài liệu,
  chưa phải số đã Sonth xác nhận — có thể chỉnh qua `VIENEU_HISTORY_MAX_ROWS`/
  `VIENEU_HISTORY_MAX_DAYS` nếu cần khác.
- Ceremony chưa có UI riêng để xem lại lịch sử (chỉ TTS Studio có `HistoryList`) — dữ liệu vẫn
  được ghi đầy đủ cho mọi nguồn, chỉ là chưa có nơi hiển thị cho Ceremony, để dành cho nhu cầu
  sau nếu phát sinh.
