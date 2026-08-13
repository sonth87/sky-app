# 2026-08-11 — Thêm MLX cho Qwen3-TTS trên Apple Silicon

> Tiếp nối [2026-08-11 — Thêm Qwen3-TTS 0.6B & 1.7B](./2026-08-11-them-qwen3-tts.md).
> Yêu cầu của Sonth: Qwen hiện chỉ chạy torch (cần CUDA — không có trên Mac). Thêm luồng
> MLX (luồng runtime thứ 3 cạnh onnx/torch) để Qwen dùng được thật trên Mac, và cho engine
> nào có bản MLX thì tự dùng MLX.

## Đối chiếu với voicebox TRƯỚC KHI viết code (theo yêu cầu "tránh nghĩ nhiều, tránh thiếu case")

Đọc thẳng `backend/backends/mlx_backend.py` thật của voicebox (không chỉ dựa README/web
search) — phát hiện 3 điểm tài liệu công khai (README GitHub của mlx-audio) SAI/THIẾU so
với thực tế đã chạy production:

1. **Import**: README ghi `from mlx_audio.tts.utils import load_model`; voicebox dùng
   `from mlx_audio.tts import load` — đã verify THẬT: đường của voicebox đúng, README sai/cũ.
2. **`result.sample_rate`**: README không nhắc field này trên `GenerationResult`; voicebox
   đọc trực tiếp `result.sample_rate` trong code production — đã verify thật: **có**, giá
   trị 24000.
3. **`lang_code`**: README's ví dụ voice-clone không truyền tham số ngôn ngữ nào; voicebox
   LUÔN truyền `lang_code=lang` (mặc định `"auto"` nếu không map được) — đã verify thật qua
   `inspect.signature`: `generate()` có tham số `lang_code: str = 'auto'`.

Ngoài ra, đối chiếu 1 rủi ro tưởng cần xử lý nhưng hoá ra KHÔNG áp dụng cho sky-app:
voicebox phải tự viết `hf_offline_patch.py` để ép offline vì process của họ sống lâu,
đôi khi quyết định offline-state SAU KHI module đã import `huggingface_hub` (cache nhầm
state cũ). sky-app không cần patch tương tự — mỗi tier là process MỚI, `HF_HUB_OFFLINE=1`
set ngay lúc `spawn()` (xác nhận tại `python-server.ts:664`), có sẵn trong env TRƯỚC khi
Python chạy dòng import đầu tiên.

## Đã làm

### `apps/tts-service/server/engine_qwen_mlx.py` (mới)

`QwenMlxEngine` — dùng chung cho cả 0.6B/1.7B (giống `QwenEngine` bên torch), qua package
`mlx-audio` (Blaizzy/mlx-audio, MIT). Viết theo 3 điểm đã đối chiếu ở trên (import đúng,
đọc `result.sample_rate` trực tiếp, truyền `lang_code`). API đơn giản hơn đường torch: MLX
hỗ trợ `"auto"` thật cho lang_code, nên `_guess_lang_code()` fallback về `"auto"` thay vì
ép "English" như `engine_qwen.py`'s `_guess_language()` phải làm (không có bằng chứng
`qwen-tts` torch hỗ trợ "auto").

Thêm so với bản torch: validate `ref_audio` tồn tại trước khi gọi `generate()` (giống
voicebox), nối MỌI chunk từ generator thay vì chỉ lấy chunk đầu (text dài có thể sinh
nhiều đoạn — voicebox cũng làm vậy), `del self._model` tường minh trong `close()` (dọn
unified memory chủ động thay vì chỉ đổi tên biến chờ GC).

### `engine_registry.py`

`_is_apple_silicon()` (kiểm cả `platform.system()=='Darwin'` LẪN `machine()=='arm64'` —
Intel Mac cũng là Darwin nhưng không chạy được MLX). `_qwen_runtime_variant(model_id)`
tính 1 LẦN lúc import module (platform không đổi giữa chừng 1 phiên) — trả `runtime_kind`/
`repo`/`pip_packages`/`needs_gpu` khác nhau theo nền tảng, giống voicebox's
`get_backend_type()` nhưng không cần gọi lại mỗi lần vì `_ENGINES` vốn là dict tĩnh.
`_make_qwen_06b`/`_17b` tự chọn `QwenMlxEngine` hay `QwenEngine` theo `_is_apple_silicon()`
— `engine_id`/`label` giữ nguyên, người dùng chỉ thấy 1 "Qwen3-TTS 0.6B" bất kể nền tảng.

Bug nhỏ tự phát hiện lúc viết: dùng `.capitalize()` để viết hoa chữ đầu câu mô tả — Python's
`.capitalize()` viết hoa chữ ĐẦU nhưng HẠ CHỮ THƯỜNG toàn bộ phần còn lại, làm hỏng
"MLX"/"CUDA"/"Metal" thành "mlx"/"cuda"/"metal". Sửa: viết hoa sẵn chữ đầu trong chuỗi
`note`, bỏ `.capitalize()`.

### Electron: `tierOfEngine` tổng quát hoá

Trước đó (thêm Qwen-torch): `if (engineRuntimeKind(engineId) !== 'torch') return 'bundled'`
— chỉ đúng khi runtime tự chứa DUY NHẤT là 'torch'. Thêm 'mlx' thì sai (mlx cũng cần
process riêng, không nạp tại chỗ được). Đổi thành allowlist NGƯỢC: loại trừ 'onnx-ext'
(kind DUY NHẤT nạp tại chỗ được) thay vì liệt kê từng kind cần process riêng — kind runtime
tự chứa mới thêm sau này (nếu có) tự động rơi đúng nhánh mà không cần sửa hàm này lần nữa.

`mustRespawn` (đã tổng quát hoá từ trước, so sánh `sitePackages` thật thay vì hardcode
'torch') không cần sửa gì thêm — tự động hoạt động đúng cho 'mlx' vì đã generic sẵn.

### i18n + type

`runtime_kind` thêm `'mlx'` vào union type (`slide-shared/src/slide-api.ts`). Nhãn UI
"MLX (Apple Silicon)" (vi+en, `packages/tts-engine-ui/src/locales.ts`). `tts:runtime-disk-usage`
handler thêm `'mlx'` vào danh sách kind liệt kê dung lượng dùng chung.

## Verify THẬT trên Apple Silicon — khác hẳn đường torch (không verify được)

Máy dev hiện tại LÀ Apple Silicon — cài `mlx-audio` vào venv scratch riêng, tải model
0.6B thật (`mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16`, 1.71GB), chạy qua ĐÚNG
`engine_qwen_mlx.py` (không phải gọi thẳng thư viện):

| Bước | Kết quả |
|---|---|
| `import mlx.core as mx; mx.default_device()` | `Device(gpu, 0)` — xác nhận GPU thật, không phải CPU giả lập |
| Nạp model | ~4s |
| `capabilities()`/`encode_reference()` qua adapter | Đúng |
| `synthesize()` không clone, tiếng Anh | Audio hợp lệ (không NaN/Inf), 24000Hz → resample 48000Hz đúng contract |
| `synthesize()` CÓ clone (`ref_audio`+`ref_text=""`) | Chạy được, ~15s, audio hợp lệ |
| `synthesize()` text TIẾNG VIỆT | **Audio rỗng hoàn toàn** — đúng dự kiến vì tiếng Việt không nằm trong 10 ngôn ngữ hỗ trợ; nhánh `RuntimeError` phòng hờ trong `_run()` bắt đúng case này thay vì để lỗi khó hiểu |
| `synthesize(speed=0.8)` | Audio dài hơn `speed=1.0` đúng hướng |
| `synthesize_preset()` | Raise `RuntimeError` đúng thiết kế |
| `close()` | `_model` về `None` |

Kết luận: engine MLX cho Qwen **đã verify chạy đúng thật trên phần cứng**, không phải suy
đoán như đường torch (GĐ D, mục "Chưa làm") — do máy dev hiện tại tình cờ đúng là nền tảng
mà đường torch KHÔNG chạy được nhưng đường MLX CHẠY được.

Model tải về nằm ở cache HF chuẩn (`~/.cache/huggingface/hub/models--mlx-community--Qwen3-TTS-12Hz-0.6B-Base-bf16`,
~1.7GB) — CHƯA xoá, giữ lại phòng cần test tiếp; venv scratch riêng và thư mục
`VIENEU_ENGINES_DIR` giả lập dùng để test đã dọn sạch.

## Test tự động

`apps/tts-service/tests/test_engine_qwen_mlx.py` — 8 case, chỉ phần thuần logic (đoán
lang_code, override, đọc transcript) — không lặp lại việc tải model/chạy GPU thật trong
test suite (không phù hợp chạy thường xuyên, cần vài GB + vài chục giây mỗi lần).

Tổng `apps/tts-service/tests/`: 32/32 pass (24 cũ + 8 mới).

## Chưa làm / còn mở

- Chưa test bản 1.7B thật (chỉ test 0.6B để tiết kiệm băng thông/thời gian) — kỳ vọng
  hoạt động tương tự vì cùng code path, chỉ khác kích thước model.
- Chưa test trên máy Windows/Linux có GPU CUDA thật (đường torch) — vẫn là khoảng trống
  như đã ghi ở file history trước.
- Text tiếng Việt cho ra audio rỗng thay vì lỗi rõ ràng ngay từ đầu — có thể cân nhắc thêm
  1 bước validate ngôn ngữ SỚM hơn (trước khi gọi generate(), dựa trên lang_code resolve
  được) để báo lỗi "ngôn ngữ không hỗ trợ" thay vì để model tự trả rỗng rồi mới bắt qua
  nhánh `RuntimeError` chung — cải tiến nhỏ, chưa cấp thiết vì đã có chặn ở tầng
  `_run()` không để lọt audio rỗng ra ngoài.
