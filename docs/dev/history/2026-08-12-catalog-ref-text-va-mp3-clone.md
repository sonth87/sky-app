# 2026-08-12 — Backfill ref_text cho catalog + cho phép mp3 khi Clone Voice

**Bối cảnh:** Sau Phase 2 (một giọng nhiều mẫu), Sonth báo lỗi thật khi dùng các giọng dựng
sẵn (catalog) với engine Qwen: `HTTP 500 ... Qwen3-TTS 1.7B cần bản chép lời của audio mẫu`.
Đúng — 46 giọng vi-VN + 23 giọng en-US trong `resources/voice-ref/` chưa từng có `ref_text`
nào từ khi catalog được tạo, engine in-context (Qwen bắt buộc) không dùng được với chúng.

## Backfill transcript bằng Whisper — 2 lần chạy, đổi model giữa chừng

`scripts/bootstrap_ref_text.py` đã có sẵn từ trước, chưa từng chạy thật. Chạy với
`DEFAULT_MODEL = whisper-base-mlx` (mặc định script) cho kết quả **29/46 giọng vi-VN hỏng
nặng** — token ngôn ngữ lạ (`<|zh|>`, `<|ar|>`...), lặp từ, ký tự Cyrillic/CJK chen vào, do
model quá nhỏ hallucinate khi audio mẫu có nhạc nền/hiệu ứng. Đổi sang
`whisper-large-v3-mlx` (~3GB, tải qua `huggingface_hub`) cho **0/46 giọng còn dấu hiệu lỗi**
(kiểm bằng heuristic: token đặc biệt, lặp từ liên tiếp, ký tự ngoài Latin/Việt, dấu chấm than
dồn dập) — chênh lệch quá lớn để coi model mặc định là đủ dùng cho việc này, dù docstring
gốc của script có ghi chú "nâng lên small/medium nếu bản nháp sai quá nhiều".

**Sự cố kỹ thuật gặp phải khi chạy (đã xử lý, không ảnh hưởng kết quả cuối):**
- Lỡ cài `mlx-audio==0.4.8` thẳng vào `apps/tts-service/venv` (venv build production) thay
  vì venv cô lập, làm `numpy` tự nâng `1.26.4` → `2.5.2`, vi phạm pin `requirements.txt`
  (tránh vỡ ABI với `onnxruntime`). Sửa bằng `rm -rf venv && ./build.sh`; xác nhận lại
  bằng cách liệt kê toàn bộ dependency then chốt (`onnxruntime`, `soundfile`, `fastapi`...)
  sau khi rebuild, không chỉ mỗi `numpy`. Từ sự cố này xác nhận lại kiến trúc đúng: engine
  runtime (kể cả `mlx-audio`) được cài qua `pip install --target <runtimeDir>/site-packages`
  RIÊNG (xem `engine-installer.ts:679`), không bao giờ đụng `venv/` chính — venv Whisper
  dùng cho script này phải là venv cô lập trong scratchpad, không phải venv app.
- Cache HuggingFace local của `mlx-community/whisper-*-mlx` (cả `base` lẫn `large-v3`) chỉ
  có `config.json` + `weights.npz`, thiếu file cho `WhisperProcessor.from_pretrained()` (tag
  chuẩn `openai/whisper-*` mới có). Vá bằng cách nạp processor từ repo `openai/whisper-*`
  tương ứng rồi `save_pretrained()` đè vào đúng thư mục snapshot cache local.

**Rà tay trước khi apply:** theo đúng cảnh báo trong docstring script ("bản nháp sai còn tệ
hơn không có, vì không ai biết mà nghi ngờ nó"), Sonth tự đọc lại + sửa
`catalog.ref-text-draft.json` (vi-VN) trước khi `--apply`. en-US áp thẳng sau khi xác nhận
22/23 giọng dùng chung 1 câu demo chuẩn là thiết kế catalog thật (hash + kích thước 22 file
audio khác nhau hoàn toàn, thời lượng khớp với việc đọc cùng 1 câu — không phải Whisper lặp
cố định do lỗi).

## Clone Voice: WAV-only → WAV + MP3

Khi rà lại luồng upload, phát hiện `Clone Voice` (tạo giọng mới từ file người dùng tự đưa
vào) chặn cứng WAV-only ở **3 lớp riêng biệt**: dialog Electron
(`ipc.ts`'s `extensions: ['wav']`), `<input accept=".wav">` (nhánh Web của
`VoiceCloneModal.tsx`), và server (`main.py`'s check `content[:4] != b"RIFF"` → 400). Đáng
chú ý: chính catalog vendor (cả vi-VN lẫn en-US) lại có sẵn nhiều file `.mp3` — pipeline nội
bộ vốn đã đọc mp3 được ở chỗ khác, chỉ có đường upload của người dùng là bị chặn.

Kiểm chứng trước khi sửa: `soundfile 0.14.0` + `libsndfile 1.2.2` (bản đang cài) giải mã mp3
trực tiếp, không cần thư viện phụ. `_validate_ref_audio` vốn đã `sf.read()` rồi ghi đè lại
thành WAV chuẩn (`sf.write(..., format="WAV")`) — decode bằng **nội dung file**, không quan
tâm đuôi file, xác nhận bằng thực nghiệm (ghi byte mp3 thật vào file đuôi `.wav`, `sf.read()`
vẫn đọc đúng). Nghĩa là chỉ cần nới bước kiểm magic byte đầu vào
(`_looks_like_audio()` mới, nhận cả `RIFF` và mp3 — tag `ID3` hoặc frame sync MPEG thô khi
không có tag), toàn bộ phần xử lý phía sau (làm sạch, chuẩn hoá RMS, ghi lại WAV) không cần
đổi gì.

**Không tin đuôi file** — `_looks_like_audio()` đọc magic byte thật của nội dung, không dùng
`file.filename`, vì người dùng đổi tên file tuỳ ý trước khi upload không phải chuyện hiếm.

## Kiểm chứng

206/206 test Python (thêm 7 so với 199 cuối Phase 2: `TestLooksLikeAudio` 6 case biên +
1 test HTTP `test_clone_file_mp3_duoc_chap_nhan`), cộng 1 kiểm chứng thủ công không nằm
trong suite: chạy `_validate_ref_audio()` KHÔNG mock qua 1 file mp3 catalog thật (đổi đuôi
`.wav`) để xác nhận decode → làm sạch → ghi lại WAV chuẩn hoạt động đúng trên dữ liệu thật,
không chỉ magic byte giả trong test. `pnpm typecheck` 35/35.
