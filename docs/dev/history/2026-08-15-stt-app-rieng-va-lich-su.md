# 2026-08-15 — App "Speech to Text" riêng + lịch sử phiên âm (GĐ 3)

GĐ 3 (cuối) của sáng kiến STT — tiếp [GĐ 1](./2026-08-14-stt-nen-tang-giai-doan-1.md) (engine
Whisper + port nền tảng) và [GĐ 2](./2026-08-14-stt-nut-tu-dong-dien-transcript.md) (nút tự
điền transcript trong VoiceCloneModal). App mới: chọn/kéo-thả 1 file audio bất kỳ, phiên âm
ra văn bản, sửa/sao chép/tải về `.txt`, có lịch sử (chỉ text, không lưu audio gốc — theo yêu
cầu Sonth xác nhận khi lập kế hoạch).

## Quyết định #1 — `stt_history` ghi TẬP TRUNG, `source` là DỮ LIỆU không phải suy ra từ file

`/stt/transcribe` đã có 2 caller thật TRƯỚC KHI app này tồn tại: nút mic "thêm mẫu mới" trong
`VoiceCloneModal` (GĐ 2) và giờ thêm app Speech to Text. Khác TTS (mỗi caller có 1 file
Electron riêng nên gắn `source` cứng theo file — `vieneu-tts.ts` → `'ceremony'`,
`tts-studio.ts` → `'tts_studio'`), STT dùng CHUNG 1 kênh IPC/HTTP cho nhiều caller, nên
`source` phải truyền THEO REQUEST, xuyên suốt `TranscribeOptions.source` (service-contracts)
→ `SlideApi.sttTranscribe`'s opts → `stt:transcribe`'s FormData → `_transcribe_with_stt()`'s
tham số. Sửa kèm 1 dòng ở `VoiceCloneModal.tsx` (đã ship từ GĐ 2) để gắn đúng
`source: 'voice_clone'` — không sửa thì mọi dòng lịch sử từ đó rơi vào `'unknown'`, mất hết
giá trị phân biệt của cột `source`.

Chỉ ghi lịch sử ở 2 nhánh THẬT SỰ "đã thử phiên âm" trong lõi dùng chung
`_transcribe_with_stt()`: thành công, và exception runtime lúc gọi `_stt_engine.transcribe()`
— KHÔNG ghi lỗi guard trước đó (category sai, engine chưa cài, file rác...), đúng nguyên tắc
lịch sử TTS (Phase 3) đã áp dụng ("lỗi 400 do speaker_id sai KHÔNG ghi dòng lịch sử").

`/voices/{voice_id}/samples/{sample_id}/transcribe` (panel Sửa mẫu, GĐ 2) chỉ có 1 caller đã
biết — `source="voice_clone_edit"` gắn CỨNG server-side, không cần thêm field client.

## Quyết định #2 — `stt_history` KHÔNG lưu audio, bảng + store đơn giản hơn hẳn TTS

Bảng mới (migration 020, `packages/app-db/src/migrations/020_stt_history.ts`): `id, source,
text, language, duration_sec, engine_id, source_filename, error, created_at` — KHÔNG có cột
tương đương `audio_file`. Kết quả của 1 lần phiên âm CHÍNH LÀ văn bản (khác TTS, nơi audio
CHÍNH LÀ kết quả cần giữ) nên không cần giữ lại file gốc để "xem lại". `stt_history_store.py`
mirror `history_store.py` (TTS) nhưng bớt hẳn `_write_wav`/`audio_dir`/prune-kèm-unlink-file —
đơn giản hơn đáng kể. `db.py`'s `REQUIRED_SCHEMA_VERSION` bump 19 → 20 CÙNG COMMIT với migration
020 — đúng bài học đã trả giá ở lần bump 17→19 (Phase 2→3, xem doc 2026-08-13).

## Quyết định #3 — KHÔNG tái dùng `EngineManagerContent` cho picker engine trong app mới

Verify trực tiếp trong code trước khi quyết định: `EngineManagerContent`
(`packages/tts-engine-ui/src/EngineManager.tsx`) hard-type `port: TtsEnginePort`, và
`useTtsStatus(port)` bên trong đòi `port.getHealth()` — không có trong `SttEnginePort` (cố ý
bỏ ở GĐ 1). Text mô tả cũng hardcode "VieNeu"/"buổi lễ" — sai ngữ cảnh cho STT. Xây
`EnginePicker.tsx` mới, nhỏ (list + switch, `<select>` HTML thuần), KHÔNG preflight/install —
cài đặt Whisper vẫn qua đúng UI Quản lý engine hiện có (không đổi từ GĐ 1).

## Quyết định #4 — Capability chỉ `'stt'`, không `'stt-local'`

Khác phác thảo GĐ 1 ban đầu (`'stt'`/`'stt-local'`): `'tts-local'` tồn tại vì cài đặt/quản lý
engine TTS chỉ chạy được trên Electron; STT không có UI cài đặt riêng nào (dùng lại UI TTS),
nên không có gì để 1 capability "-local" thứ hai gate riêng. Thêm `'stt'` vào
`packages/kernel/src/capability.ts`'s union + cả 2 mảng capabilities
(`create-electron-platform.ts`, `create-web-platform.ts`) cạnh `'tts'` đã có — cả 2 nền tảng
đều đăng ký `stt`/`stt-engine` service hoạt động thật từ GĐ 1.

## Quyết định #5 — App không dùng Zustand/i18next, kéo-thả chỉ hoạt động ĐẦY ĐỦ trên Web

State nhỏ (`selectedFile`, `resultText`, `history[]`) đủ gọn cho `useState` ở component gốc —
khác `modules/tts-studio` (nhiều panel con sâu, cần Zustand chia sẻ state). Không phụ thuộc
`@sky-app/tts-engine-ui` (không tái dùng EngineManagerContent) nên cũng không kéo theo
`i18next`.

Kéo-thả file: hoạt động ĐẦY ĐỦ trên Web (`File` object dùng thẳng được với
`SttPort.transcribe()`). Trên Electron, `transcribe()` đòi filePath dạng string (đọc qua Node
`fs`) — 1 `File` kéo-thả không tự có path đó. `webUtils.getPathForFile()` (Electron ≥32, bản
đang dùng là 43) CÓ THỂ giải quyết nhưng cần thêm 1 kênh preload MỚI chưa có tiền lệ trong repo
và CHƯA kiểm chứng được trong phiên này — cố tình KHÔNG làm để tránh đúng kiểu rủi ro "chưa
tính hết vấn đề" mà cả sáng kiến STT này được yêu cầu tránh. Trên Electron, thả file vẫn gọi
được `onFileSelected`, nhưng `transcribe()` ném lỗi rõ ràng ("requires a string filePath") mà
`SpeechToTextApp` bắt và dịch thành thông báo thân thiện, hướng người dùng dùng nút Chọn file
— KHÔNG giả vờ kéo-thả hoạt động đầy đủ trên Electron. Nếu cần kéo-thả thật trên Electron, làm
ở phiên sau (thêm `webUtils.getPathForFile()` qua preload, kiểm chứng bằng `dev:app` thật).

## Thiết kế

- `modules/speech-to-text/` (mới) — mirror cấu trúc `modules/tts-studio/`: `index.ts`
  (`AppModule`, `id: 'speech-to-text'`, icon `AudioLines` — khác `Speech` của tts-studio),
  `styles.css` (`.speech-to-text-root`, mirror 1:1 tts-studio's token remap),
  `SpeechToTextApp.tsx` (component gốc, degrade khi thiếu service `stt`), 4 component con:
  `FilePicker.tsx`, `EnginePicker.tsx`, `ResultPanel.tsx`, `TranscribeHistoryPanel.tsx` (mirror
  `HistoryList.tsx` nhưng bỏ hẳn play/download audio).
- Đăng ký ở CẢ HAI `apps/shell-electron/src/main.tsx` và `apps/shell-web/src/main.tsx` (bước
  hay bị bỏ sót nhất theo chính app-spec §8's cảnh báo) + `package.json` deps cả 2 shell.
- `SttPort` (service-contracts) thêm `listHistory?`/`deleteHistoryEntry?`/`clearHistory?` +
  `SttHistoryEntry` type — KHÔNG có `getHistoryAudioUrl` (text-only), bất đối xứng CHỦ Ý so
  với `TtsPort`. Web adapter implement ĐẦY ĐỦ cả 3 method lịch sử — KHÁC `TtsPort`'s Web
  adapter (cố tình bỏ lịch sử vì audio-URL phức tạp không hợp môi trường đa-client dùng chung
  server) — STT lịch sử chỉ text nên không có rào cản đó.

## Versioning

Đụng `apps/shell-electron/electron/` (kênh IPC `stt:history-*` mới + đổi payload
`stt:transcribe` thêm field `source`) → Loại 2. Bump `shell-electron` 0.15.0 → **0.16.0**
(MINOR, `breaking: true`, tương thích ngược hoàn toàn — không đổi/xoá kênh cũ nào).

## Kiểm chứng

`pnpm typecheck`/`pnpm -w test` toàn repo xanh — kể cả nhiều vòng rebuild dist trung gian
(`service-contracts`, `slide-shared`, `voice-catalog-ui`, `kernel`, `platform-electron`,
`platform-web` — mỗi package tiêu thụ đọc `.d.ts` đã build, không phải source trực tiếp, đã
biết từ GĐ 1/2). Python: 304/304 xanh (bao gồm test mới cho `stt_history_store.py` + assertion
ghi/không-ghi lịch sử đúng ở cả 2 endpoint transcribe). Module mới: 4/4 test xanh (degrade khi
thiếu service, render đúng các phần chính, luồng transcribe gọi đúng `source`, lỗi hiện đúng
thông báo không crash).

**Chưa kiểm bằng Electron/Web thật** (không có công cụ mở app trong phiên code) — cần Sonth tự
mở CẢ `dev:app` VÀ `dev:web` (app phải chạy được cả 2 nền tảng, đúng yêu cầu isomorphic
AGENTS.md), xác nhận: app "Speech to Text" xuất hiện trong dock, chọn/kéo-thả file hoạt động
(kéo-thả trên Electron sẽ hiện thông báo hướng dẫn dùng nút Chọn file — đây là hành vi ĐÚNG
theo thiết kế, không phải bug), phiên âm ra đúng text, sao chép/tải `.txt` hoạt động, lịch sử
hiện đúng và xoá được, và app ẩn đúng cách nếu build thiếu capability `'stt'`.

## Còn phải làm

- Kéo-thả file audio thật trên Electron (`webUtils.getPathForFile()` qua kênh preload mới) —
  cố tình hoãn, xem quyết định #5.
- Chưa có cách nào chọn ENGINE cài đặt riêng cho STT ngoài UI Quản lý engine chung của TTS —
  nếu sau này cần trải nghiệm cài đặt gọn hơn riêng cho app này, thiết kế thêm lúc đó (không
  phải thiếu sót, là phạm vi đã chốt từ GĐ 1).
