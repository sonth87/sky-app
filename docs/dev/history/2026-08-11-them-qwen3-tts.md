# 2026-08-11 — Thêm engine Qwen3-TTS 0.6B & 1.7B (GĐ D)

> GĐ D của [`docs/roadmap/plans/tts-engine-architecture.md`](../../roadmap/plans/tts-engine-architecture.md).
> Tiếp nối GĐ A-C (xem 2 file history trước cùng ngày).

## D0 — Xác minh tiếng Việt

Qwen3-TTS mã nguồn mở (`Qwen/Qwen3-TTS-12Hz-{0.6B,1.7B}-Base`) hỗ trợ 10 ngôn ngữ
`zh/en/ja/ko/de/fr/ru/pt/es/it` — **không có tiếng Việt**. Xác nhận qua model card
HuggingFace chính chủ, không chỉ dựa config phụ của app khác (voicebox) như lượt đầu.

Ban đầu đặt câu hỏi chặn "Qwen hơn MOSS ở điểm gì để biện minh dung lượng" — quyết định
thực tế của Sonth: **không cần trả lời câu đó**. Ceremony và TTS Studio đều đi qua TTS
server chung (`/engines`), không cột cứng theo VieNeu — Qwen chỉ là 1 lựa chọn giọng
thêm trong catalog, giống MOSS/VoxCPM đã tồn tại song song dù phạm vi ngôn ngữ chồng
lấn nhau. Không cần "thắng" MOSS mới đáng thêm.

## D1 — Spike ONNX: không đạt, số liệu đảo ngược giả định ban đầu

Kế hoạch gốc kỳ vọng ONNX (đặc biệt INT8) nhẹ hơn torch bf16. Đo dung lượng THẬT qua HF
API (không phải ước lượng):

| Ứng viên | Dung lượng thật | Vấn đề |
|---|---|---|
| `romara-labs/...0.6B-Base-ONNX` (FP32) | 4.18GB | Nặng hơn bf16 gốc (2.34GB) ~1.8x |
| `arubeh/...1.7b-base-onnx` (FP32, có "9 components parity-verified") | 14GB | Nặng hơn bf16 gốc (4.23GB) ~3.3x |
| `sivasub987/...0.6B-ONNX-INT8` | 1.6GB (nhẹ thật) | "Requires ConvInteger support... fail on standard CPU execution" |
| `xkos/...1.7B-ONNX` | Không công bố | 27 lượt tải/tháng, không tuyên bố parity |

Nguyên nhân: FP32 export chỉ đổi định dạng chứ không nén — nhẹ hơn CHỈ đúng với INT8, mà
bản INT8 duy nhất tìm được lại có nguy cơ không chạy được trên CPU thường (cần GPU hoặc
onnxruntime bản MLAS đặc biệt). 14GB cho 1.7B tự nó đã đủ loại bỏ đường ONNX.

→ Đi D2b (torch), dùng repo chính chủ.

## Đã làm (D2b)

### `apps/tts-service/server/engine_qwen.py` (mới)

Một class `QwenEngine` DÙNG CHUNG cho cả 0.6B và 1.7B (tham số hoá qua `engine_id`/
`label` truyền lúc khởi tạo) — khác VoxCPM/MOSS (mỗi file 1 engine cố định, hằng số
`_ENGINE_ID` module-level) vì Qwen chỉ khác nhau ở repo/kích thước, code inference giống
hệt nhau. Implement đúng Protocol `TTSEngine` (`encode_reference`, `synthesize`,
`synthesize_preset`, `capabilities`) theo khuôn `engine_voxcpm.py`.

**Ngôn ngữ**: `qwen-tts` package's `generate_voice_clone()` cần tham số `language` tường
minh (không tự nhận diện như MOSS's "auto-detect"). Giải quyết bằng 2 lớp:
1. Client truyền `language` qua `engine_overrides[engineId]` — đúng cơ chế MOSS đã dùng
   cho `max_new_frames` (main.py's `_run_synthesis`, ưu tiên cao nhất).
2. Không truyền → heuristic theo Unicode script (`_guess_language`): CJK/Cyrillic nhận
   đúng (script riêng biệt, đáng tin), chữ Latin (en/de/fr/pt/es/it) đều rơi về
   "English" — hạn chế đã biết, không thêm dependency nhận diện ngôn ngữ thật
   (langdetect/fasttext) chỉ cho việc này.

**Clone giọng**: giống VoxCPM, đọc file `.txt` cùng tên cạnh ref audio làm transcript
tuỳ chọn (`_ref_text_for`) — nhưng CHƯA xác nhận `ref_text` là bắt buộc hay tuỳ chọn ở
API thật (chưa chạy thử được, xem phần "Chưa làm" bên dưới).

### `engine_registry.py`

2 entry mới `qwen-0.6b`/`qwen-1.7b`, `runtime_kind: 'torch'` — dùng chung
`ttsRuntimeDir('torch')` với VoxCPM (GĐ C), không nhân bản ~2.5GB torch runtime.
`install.model.total_mb` = 1750/3690, đo THẬT qua HF API (`model.safetensors`:
1744.6MB/3678.7MB) — không phải ước lượng như các engine trước.

**`needs_gpu: true`** — khác hẳn VoxCPM (`false`, có RTF CPU đo thật 4.5–9.5). Lý do:
package `qwen-tts` chính chủ có bug report công khai
([QwenLM/Qwen-Audio#85](https://github.com/QwenLM/Qwen-Audio/issues/85)): `device_map`
chỉ định GPU bị bỏ qua, luôn chạy CPU một cách KHÔNG chủ đích (không phải đường CPU được
thiết kế/hỗ trợ), và ép sang GPU thủ công gây lỗi tensor khác device. Không có số đo CPU
đáng tin như VoxCPM đã có — đăng ký trung thực thay vì hứa hẹn "chậm nhưng chạy được".

### 🔴 Bug thời phát hiện khi thêm engine torch thứ hai

`mustRespawn` trong `python-server.ts` (viết ở GĐ B — 2026-08-10, TRƯỚC khi GĐ C gộp
runtime theo kind) ép respawn toàn bộ process mỗi khi đổi engine trong tier `'ext'`,
dù engine đích cùng kind và giờ đã dùng CHUNG site-packages. Đúng lúc thêm engine torch
thứ hai (Qwen, cạnh VoxCPM) mới lộ ra: đổi Qwen ↔ VoxCPM đáng lẽ không cần respawn nữa
(PYTHONPATH set lúc spawn đã bao trọn cả hai vì dùng chung `ttsRuntimeDir('torch')`),
nhưng code cũ vẫn respawn như thể chúng còn site-packages riêng.

Sửa: so sánh `resolveEngineRuntimeLocation(engine).sitePackages` giữa engine đang phục
vụ và engine đích — chỉ respawn khi THẬT SỰ khác nhau (trường hợp còn lại: 1 trong 2
vẫn ở bố cục runtime riêng cũ, chưa cài lại từ sau GĐ C). Thêm `markTierEngine()` để
ghi nhận đúng engine đang phục vụ sau khi switch tại chỗ thành công — trước đó `st.engineId`
sẽ đứng yên ở giá trị lúc spawn, khiến lượt đổi engine TIẾP THEO tính sai có cần respawn
hay không.

### Test

`apps/tts-service/tests/test_engine_qwen.py` — 9 case, CHỈ phần thuần logic (đoán ngôn
ngữ, override, đọc transcript). Không test được `QwenEngine.__init__`/inference thật vì
cần torch + GPU CUDA + tải vài GB — không khả thi trong phiên làm việc này (máy dev
Apple Silicon, không CUDA).

Tổng `apps/tts-service/tests/`: 24/24 pass (15 cũ + 9 mới).

## Chưa làm / rủi ro còn mở

- **Chưa chạy inference thật** — không xác nhận được: có chạy được trên CPU hay không
  (bug report gợi ý "có nhưng cực chậm và không chủ đích"), `ref_text` có bắt buộc cho
  `generate_voice_clone()` không, chất lượng audio thực tế so với mô tả.
- Nếu sau này có máy có GPU CUDA thật, nên verify: cài thử qua UI (`installStart`),
  `verify_engine.py` dry-run, rồi nghe thử 1 câu qua từng ngôn ngữ trong 10 ngôn ngữ hỗ
  trợ trước khi coi là sẵn sàng dùng thật.
- `_guess_language` chỉ phân biệt được CJK/Cyrillic — 6/10 ngôn ngữ hỗ trợ (de/fr/pt/es/it,
  cộng en) đều rơi về "English" nếu client không tự truyền `language`. Chấp nhận được cho
  giai đoạn này (client TTS Studio có thể chọn ngôn ngữ tường minh trong UI sau), nhưng
  nên nhớ khi tích hợp UI chọn giọng Qwen.
