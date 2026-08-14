# 2026-08-14 — STT (Speech-to-Text): nền tảng engine + port (GĐ 1)

> Nền móng cho quyết định này đã đặt sẵn có chủ đích từ
> [2026-08-11](./2026-08-11-fix-chat-luong-audio-qwen.md) — field `category: 'tts'|'stt'|'llm'`
> đã có trong `engine_registry.py`, đã type sẵn trong `slide-api.ts`, `EngineManager.tsx`'s
> `groupByCategory()` đã gom nhóm theo category, locale "Nhận dạng giọng nói" đã dịch sẵn.

Yêu cầu gốc: nút "Tự động điền transcript" ở màn Clone Voice (bấm là nghe audio mẫu rồi điền
`ref_text`, có xác nhận trước khi ghi đè — voicebox, app tham chiếu, KHÔNG có bước xác nhận
này), một app "Speech to Text" riêng, và engine STT nền tảng cho cả hai — với yêu cầu tường
minh tránh lặp lại kiểu "sửa lên sửa xuống" đã xảy ra lúc dựng kiến trúc multi-engine TTS lần
đầu. GĐ 1 (bài này) chỉ dựng engine + port; nút transcript (GĐ 2) và app riêng (GĐ 3) làm sau
trên nền đã ổn định.

## Quyết định #1: `runtime_kind: "onnx-ext"`, KHÔNG phải `onnx-bundled`

Giả định ban đầu lúc research là đóng băng Whisper cứng vào binary PyInstaller
(`onnx-bundled`, như VieNeu) để chạy CHUNG process với TTS không cần tier mới — nhưng
`onnx-bundled` phình installer cho MỌI người dùng kể cả ai không đụng STT, đi ngược đúng
phương án dự phòng Sonth đã đồng ý ("nếu ONNX làm app to quá thì chuyển sang tải về").
`onnx-ext` (torch-free, tải theo nhu cầu, nạp trong-process vào tier đang chạy sẵn qua
`sys.path.append` — đúng cơ chế MOSS-TTS-Nano đã dùng) đạt được cùng lợi ích (không cần tier/
process mới, `/stt/*` tự có mặt ở tier đang chạy vì cả 2 tier Electron chạy chung 1 file
`main.py`) MÀ KHÔNG phình installer. Thư viện chọn: `sherpa-onnx` (k2-fsa) — verify thật bằng
spike (tải model, phiên âm 1 file WAV tiếng Việt thật, xác nhận kết quả hợp lý) trước khi viết
chính thức, đúng kỷ luật đã áp dụng cho Qwen.

## Quyết định #2: state STT tách hẳn khỏi state TTS trong `main.py`

`_engines`/`_engine_lru`/`_evict_engines()`/`_ref_codes_cache` gắn chặt ngữ nghĩa TTS (bucket
RAM torch/onnx, cache embedding voice-clone). STT không cần tương đương — không clone giọng,
dùng theo yêu cầu chứ không cần hot-swap độ trễ thấp giữa buổi lễ. Block global riêng:
`_stt_engine`, `_current_stt_engine_id`, `_stt_lock` (tách khỏi `_synth_lock` — verify bằng
test concurrency thật, đo `asyncio.gather()` 2 tác vụ giữ từng lock ≈ `max()` thời gian, không
phải `sum()`, để chứng minh STT không chờ TTS và ngược lại). Registry Python vẫn dùng CHUNG 1
dict `_ENGINES` trong `engine_registry.py`, chỉ phân biệt qua `category` — không tách file
riêng (tách sẽ nhân đôi ~150 dòng logic đã đúng, kể cả bản vá `engine_dir_name()` sanitization
từ sự cố Qwen, mà không được gì).

## Quyết định #3: chặn chéo category ở endpoint — sửa NGAY từ đầu

Đúng bài học đã trả giá 1 lần với `_ref_codes_cache`: `POST /engines/switch`/`/engines/unload`
(TTS) từ chối 400 nếu `engine_category(id) != 'tts'`; `/stt/engines/switch` và
`/stt/transcribe` (khi `engine_id` được truyền tường minh) từ chối chiều ngược lại — tránh 1
dòng UI tương lai vô tình đẩy id STT vào switch TTS, cướp mất engine đang phục vụ buổi lễ.

**Bug phát hiện lúc viết test, vá ngay:** `engine_category()` mặc định trả `'tts'` cho CẢ id
không tồn tại LẪN entry thật không khai category (hành vi có chủ đích, tài liệu riêng) — guard
ban đầu gọi thẳng `engine_category(id) != expected` nên vô tình chặn 400 "wrong_category" cho
id thật sự KHÔNG TỒN TẠI, trước khi nó kịp rơi xuống `create_engine()`'s đường lỗi đúng (404).
Thêm `engine_exists(engine_id)` vào `engine_registry.py`, đổi mọi guard thành
`engine_exists(id) and engine_category(id) != expected`.

## Quyết định #4: phạm vi `SttEnginePort` nhỏ hơn `TtsEnginePort` — cài đặt tái dùng UI có sẵn

Phát hiện giữa chừng: Whisper đăng ký trong CÙNG registry Python với TTS, và `GET /engines`
(không lọc category) + `EngineManager.tsx` (đã gom nhóm theo category) đã cho tải/cài được
Whisper NGAY qua đúng UI Quản lý engine hiện có — không cần dựng thêm 1 bộ kênh
`stt:engine-install-*` chỉ để làm lại việc `tts:engine-install-*` đã làm được. Vì vậy
`SttEnginePort` GĐ 1 CHỈ khai `listEngines`/`switchEngine?` (không có `preflight`/`install*`/
`onInstallProgress` như `TtsEnginePort`) — không giảm khả năng người dùng (cài đặt vẫn chạy
đầy đủ qua UI có sẵn), chỉ giảm bề mặt code phải viết/bảo trì.

## Thiết kế

- `apps/tts-service/server/stt_engine.py` — `Protocol SttEngine`: `capabilities() -> dict`,
  `transcribe(audio_path, language=None) -> {text, language, duration_sec}`. Tách hẳn
  `TTSEngine` (không overlap — audio→text vs text→audio).
- `engine_whisper_onnx.py` — `WhisperOnnxEngine`, dùng `OfflineRecognizer.from_whisper()`.
  Rebuild recognizer khi đổi `language` (~0.4s sau warm-up, đo thật, không giả định miễn phí).
- `engine_registry.py` — entry `"whisper-base"`: `category: "stt"`, `bundled: False`,
  `runtime_kind: "onnx-ext"`, `install.model.files` lọc đúng 3 file int8 cần dùng (repo HF
  `csukuangfj/sherpa-onnx-whisper-base` có cả bản fp32 không dùng tới) — cần thêm hỗ trợ lọc
  file chọn lọc mới vào `engine-installer.ts`'s `resolveHfFiles()` (trước đây field
  `install.model.files` có khai nhưng chưa thực sự dùng).
- `main.py` — `GET /stt/engines`, `POST /stt/engines/switch`, `POST /stt/transcribe`
  (multipart, ghi tempfile + dọn trong `finally`, KHÔNG ghi vào `_ref_dir` — input tạm thời
  không phải voice reference cần giữ). `target_id` rỗng → dùng engine đang giữ ấm, hoặc
  lazy-activate `whisper-base` mặc định — khớp UX "bấm là chạy luôn" cho nút tự điền transcript
  (GĐ 2), không bắt người dùng tự chọn engine trước khi dùng lần đầu.
- `packages/service-contracts` — `stt-engine.ts` (`SttEnginePort`, xem Quyết định #4),
  `stt.ts` (`SttPort.transcribe()` + `pickAudioFile?` — delegate được thẳng kênh
  `tts:pick-audio-file` có sẵn, chọn file không có gì riêng STT).
- `packages/slide-shared/src/slide-api.ts` — `SttEngineInfo`/`SttEngines` (raw shape, mirror
  cách `TtsEngineInfo`/`TtsEngines` đã làm) + 3 method trên `SlideApi`.
- Electron: `preload.ts`/`ipc.ts` thêm đúng 3 kênh `stt:list-engines`, `stt:engine-switch`,
  `stt:transcribe` (tên riêng dù cài đặt gọi lại `engine-installer.ts` chung — tên kênh rõ
  ràng quan trọng hơn tiết kiệm vài dòng). `stt:transcribe` đọc file, build multipart, POST
  `/stt/transcribe`, mirror cách `tts:clone-voice` đã làm.
- `platform-electron`/`platform-web` — `createElectronSttPort()`/`createElectronSttEnginePort()`
  bọc `window.slide`; `createWebSttPort()`/`createWebSttEnginePort()` gọi thẳng HTTP tới cùng
  tts-service (không có nhánh cắt bớt cài đặt như `TtsEnginePort`'s Web adapter phải làm — GĐ 1
  của `SttEnginePort` vốn đã không khai nhóm đó). Web `switchEngine` có hiệu lực NGAY (không
  cần restart service như TTS's Web `switchEngine` phải chờ) vì STT chỉ giữ 1 instance đơn
  giản, không có state on-stage nào cần bảo vệ.
- Đăng ký `platform.services.register('stt', ...)`/`('stt-engine', ...)` ở cả
  `create-electron-platform.ts` và `create-web-platform.ts`. KHÔNG thêm capability
  `'stt'`/`'stt-local'` mới vào `packages/kernel/src/capability.ts` ở GĐ 1 — chưa có module
  nào khai `requiredCapabilities` cần tới nó (để dành GĐ 3 khi app Speech to Text riêng ra
  đời).

## Kiểm chứng

`pnpm typecheck` xanh cho `shell-electron`, `platform-electron`, `platform-web` (chạy riêng
từng package trong phiên code — chưa chạy lại toàn repo). Test Python mới (`test_stt_engine.py`,
`test_stt_transcribe_endpoint.py`, `test_engine_registry.py`) xanh, gồm cả test concurrency lock
thật (không chỉ so identity 2 lock khác nhau).

**Chưa kiểm bằng Electron thật** (không có công cụ mở app trong phiên code) — cần Sonth tự mở
`dev:app`, cài thử engine Whisper qua UI Quản lý engine (đã tự động gom đúng nhóm "Nhận dạng
giọng nói"), xác nhận preflight/cài đặt hoạt động đúng, và gọi thử `sttPort.transcribe` (có
thể tạm qua DevTools console trước khi GĐ 2 có UI thật) để xác nhận STT chạy song song không
làm treo TTS.

## Còn phải làm

- GĐ 2: nút "Tự động điền transcript" + xác nhận ghi đè trong
  `packages/voice-catalog-ui/src/VoiceCloneModal.tsx` (2 vị trí: form thêm giọng mới, panel
  sửa giọng đã có). Nếu GĐ 1 đã ổn định đúng như thiết kế, GĐ 2 không đụng
  `apps/shell-electron/electron/` → Loại 1, không cần bump version.
- GĐ 3: app "Speech to Text" riêng (`modules/speech-to-text/`) — chỉ phác thảo trong plan gốc,
  cần thiết kế chi tiết ở phiên sau (bao gồm quyết định `EngineManagerContent` có parametrize
  theo category hay mount instance riêng cho STT, và có thêm bảng `stt_history` hay không).
- Chưa `curl` thật `/stt/transcribe` với file WAV tiếng Việt qua đúng HTTP path (spike Python
  trực tiếp đã xác nhận sherpa-onnx hoạt động, nhưng chưa xác nhận lại qua FastAPI endpoint).
