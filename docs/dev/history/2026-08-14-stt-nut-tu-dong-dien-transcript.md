# 2026-08-14 — Nút "Tự động điền transcript" (GĐ 2, tiếp [GĐ 1](./2026-08-14-stt-nen-tang-giai-doan-1.md))

Nút mic cạnh mỗi ô "bản chép lời" trong `VoiceCloneModal` (packages/voice-catalog-ui) — bấm
là nghe audio mẫu qua STT rồi tự điền, hỏi xác nhận trước khi ghi đè nếu ô đã có nội dung
(cải tiến so với voicebox, app tham chiếu — KHÔNG có bước xác nhận này, ghi đè thẳng).

## Phát hiện giữa chừng: plan gốc không tính tới sự khác biệt giữa "file mới" và "file đã có"

Plan gốc (GĐ 2) giả định cả 2 vị trí nút (form thêm giọng mới + panel sửa giọng đã có) đều
gọi thẳng `sttPort.transcribe(s.filePath, ...)` — đúng cho vị trí ĐẦU (mẫu vừa chọn, client
đang giữ nguyên file: string path ở Electron, `File` object ở Web), nhưng SAI cho vị trí THỨ
HAI: mẫu của 1 voice clone ĐÃ CÓ chỉ tồn tại dưới dạng file đã upload xong, nằm trên server
(`_ref_dir`) — client không còn giữ bản gốc, `ExistingSample` (kiểu TS trong
`VoiceCloneModal.tsx`) chỉ có `{id, ref_file, ref_text}`, không có filePath/File nào để đưa
vào `transcribe()`.

2 hướng cân nhắc:
1. Thêm 1 endpoint GET trả raw audio bytes của sample, client tải về rồi upload lại qua
   `/stt/transcribe` sẵn có.
2. Thêm 1 endpoint server-side transcribe-theo-tham-chiếu — server tự đọc file nó đã có
   sẵn, không cần client động vào bytes.

Chọn (2): (1) tốn 1 vòng round-trip vô ích (tải về rồi upload lại NGUYÊN VẸN cùng 1 file),
và Web's `SttPort.transcribe()` còn đòi hỏi `File` object — không thể tự dựng 1 `File` từ
bytes tải về mà không qua thêm 1 lớp chuyển đổi. (2) là 1 lệnh HTTP, JSON thuần, không cần
đọc/build multipart ở tầng Electron main process.

## Thiết kế

- **`main.py`**: refactor `/stt/transcribe`'s lõi (chọn engine + guard category + `_stt_
  lock` + gọi model + log) thành hàm dùng chung `_transcribe_with_stt(audio_path, language,
  engine_id)`. `/stt/transcribe` (file upload) giờ chỉ lo phần validate + ghi tempfile rồi
  gọi hàm chung. Thêm mới `POST /voices/{voice_id}/samples/{sample_id}/transcribe` (JSON
  body `{language?, engine_id?}`, KHÔNG multipart) — tra `sample.ref_file` qua
  `_registry.list_samples(voice_id)`, đọc thẳng từ `_ref_dir`, gọi `_transcribe_with_stt()`
  y hệt đường cũ. Cùng guard category, cùng lazy-activate mặc định `whisper-base`, cùng
  reason-code lỗi (`wrong_category`/`unavailable_in_process`/`unknown_engine`/`load_failed`)
  — không phải 1 đường lỗi riêng phải học thêm.
- **`packages/service-contracts/src/stt.ts`**: `SttPort` thêm `transcribeVoiceSample?
  (voiceId, sampleId, opts?)` — optional, tách khỏi `transcribe()` (đã có docstring giải
  thích lý do tách ngay tại chỗ khai báo).
- Electron: `stt:transcribe-voice-sample` — kênh IPC MỚI (Loại 2), riêng khỏi
  `stt:transcribe` vì hình dạng request khác hẳn (JSON thuần, không đọc file/build
  multipart) dù cùng gọi 1 route Python phía sau khi có upload. `platform-electron`/
  `platform-web`'s `SttPort` adapter đều implement — Web thậm chí ĐƠN GIẢN HƠN
  `transcribe()` (không cần `File`, JSON POST thẳng).
- **`VoiceCloneModal.tsx`**: `sttPort?: SttPort` prop mới (platform-agnostic, truyền từ nơi
  gọi — giống `ttsPort`, xem app-spec.md §4). 2 hàm xử lý riêng: `transcribeSample(index)`
  (form thêm mới, dùng `sttPort.transcribe`) và `transcribeEditingSample()` (panel sửa giọng
  đã có, dùng `sttPort.transcribeVoiceSample` — chỉ áp dụng cho mẫu CHÍNH/`i===0`, đúng giới
  hạn đã có sẵn của `saveEditingRefText` — server chỉ có API sửa transcript cho mẫu đầu).
  Nút ẩn hẳn (không phải disabled) khi `sttPort`/`transcribeVoiceSample` undefined — Web
  chưa chắc đã đăng ký port này, hoặc engine STT chưa cài.
- Xác nhận ghi đè: `if (refText.trim() && !confirm(OVERWRITE_CONFIRM_MSG)) return;` — dùng
  CHUNG 1 hằng số thông báo cho cả 2 vị trí, tránh lệch câu chữ.
- `language` hint: vị trí form-mới dùng đúng ngôn ngữ đang chọn trong form đó (map 'vi-VN'→
  'vi'). Vị trí sửa giọng đã có KHÔNG ép `language` — `Voice.language` là tên hiển thị
  ("Vietnamese"...), không phải mã ngắn STT cần; để trống cho engine tự nhận diện (đã verify
  đáng tin cậy ở GĐ 1's kiểm chứng thật).
- Wiring `sttPort` tại 2 nơi gọi `VoiceCloneModal`: `TtsSettingsContent.tsx` (module
  ceremony) và `TtsStudioApp.tsx` (module tts-studio) — cả 2 thêm
  `platform.services.get<SttPort>('stt')`, cùng pattern đã có sẵn cho `tts`.

## Versioning

Đụng `apps/shell-electron/electron/` (kênh IPC `stt:transcribe-voice-sample` mới) → Loại 2,
dù bản thân tính năng chỉ là UI renderer — kênh backend mới đã đủ điều kiện. Bump
`shell-electron` 0.14.0 → **0.15.0** (MINOR, breaking: true, tương thích ngược — không đổi/
xoá kênh cũ nào).

## Kiểm chứng

`pnpm typecheck` toàn repo xanh (kể cả 2 vòng rebuild dist trung gian —
`service-contracts`/`slide-shared`/`voice-catalog-ui` — cần thiết vì các package tiêu thụ
đọc `.d.ts` đã build, không phải source trực tiếp). Test Python: 285/285 xanh, gồm 6 test
mới cho `/voices/{voice_id}/samples/{sample_id}/transcribe` (thành công, voice/sample không
tồn tại → 404, file bị thiếu trên đĩa → 404, guard category dùng chung vẫn đúng qua đường
mới).

**Chưa kiểm bằng Electron thật** (không có công cụ mở app trong phiên code) — cần Sonth tự
mở `dev:app`, thử nút mic ở CẢ 2 vị trí (thêm giọng mới, sửa giọng đã có), xác nhận dialog
xác nhận ghi đè hiện đúng lúc, và transcript điền vào đúng ô.

## Còn phải làm

- GĐ 3: app "Speech to Text" riêng — vẫn chỉ phác thảo trong plan gốc, thiết kế chi tiết ở
  phiên sau.
