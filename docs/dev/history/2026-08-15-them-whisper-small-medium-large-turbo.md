# 2026-08-15 — Thêm 4 size Whisper (Small/Medium/Large v3/Turbo) bên cạnh Base

> Tiếp nối [2026-08-14 — STT nền tảng giai đoạn 1](./2026-08-14-stt-nen-tang-giai-doan-1.md):
> lúc đó chỉ dựng `whisper-base` để spike xem `sherpa-onnx` có chạy được tiếng Việt không.
> Sonth yêu cầu mở rộng đủ họ Whisper mà `sherpa-onnx` phân phối sẵn, kèm mô tả so sánh giữa
> các size để người dùng biết nên chọn cái nào.

## Thiết kế: 1 class dùng chung, không nhân bản code

`engine_whisper_onnx.py`'s `WhisperOnnxEngine` trước đây hard-code `size="base"` khắp nơi
(tên thư mục, tên 3 file model, `_ENGINE_ID` module-level). Sửa thành nhận `size` ở
constructor, dùng để build cả đường dẫn thư mục (`whisper-{size}/model/`) lẫn tên file
(`{size}-encoder.int8.onnx`/`{size}-decoder.int8.onnx`/`{size}-tokens.txt`).

Trước khi sửa, đã verify quy ước đặt tên file **giống hệt nhau trên mọi size** trong repo HF
gốc `csukuangfj/sherpa-onnx-whisper-{size}` — kể cả `large-v3`, bản int8 vẫn gộp gọn trong 1
file duy nhất (không cần các file `.weights` external-data chỉ dùng cho bản fp32 đầy đủ). Nếu
quy ước này lệch dù chỉ 1 size, cách làm 1-class-dùng-chung sẽ sai âm thầm — nên xác nhận từng
repo trên HuggingFace thật, không suy đoán từ size nhỏ rồi áp cho size lớn.

`engine_registry.py` thêm 4 factory (`_make_whisper_small/medium/large_v3/turbo`) — mỗi cái
chỉ khác đúng 1 tham số truyền vào `WhisperOnnxEngine(size)`, và 4 entry trong `_ENGINES` khai
`category: "stt"`, `runtime_kind: "onnx-ext"` giống `whisper-base` đã có.

## Mô tả so sánh cho từng size (theo yêu cầu)

Không chỉ liệt kê tên — mỗi `description` nói rõ đánh đổi và gợi ý dùng khi nào:

| Size | Dung lượng | Gợi ý |
|---|---|---|
| Small | ~375MB | Mặc định hợp lý nếu không chắc chọn gì — chính xác hơn Base, vẫn nhanh |
| Medium | ~946MB | Chấp nhận chậm hơn để đổi lấy chính xác cao hơn — audio nhiều tạp âm, giọng khó nghe |
| Large v3 | ~1.8GB | Chính xác nhất nhưng nặng/chậm nhất — chỉ khi ưu tiên tuyệt đối độ chính xác |
| Turbo | ~1GB | Bản Large v3 cắt bớt lớp giải mã (4 thay vì 32) — nhanh hơn ~8 lần, độ chính xác PHIÊN ÂM gần bằng Large v3, chỉ kém ở khả năng DỊCH sang tiếng Anh (không liên quan nếu chỉ cần phiên âm tiếng Việt) |

`total_mb` của từng entry đo thật qua HuggingFace 2026-08-15 (cộng dung lượng thật của
encoder + decoder + tokens, không phải số tròn suy đoán).

## Không cần sửa gì ở tầng UI/TypeScript

`EnginePicker.tsx` (module `speech-to-text`) và `EngineManagerContent.tsx` (tab Models/Engine)
đều liệt kê engine **động** qua `listEngines()` lọc theo `category` — không hard-code danh sách
id nào. 4 size mới tự xuất hiện ở cả màn cài đặt lẫn màn chọn engine để phiên âm, không đụng
dòng TypeScript nào. Đây là quả ngọt của groundwork category từ GĐ 1 (STT nền tảng).

## Kiểm chứng

Thêm `test_engine_registry.py`: parametrize theo 4 size, kiểm mỗi entry đúng
category/runtime_kind/repo/total_mb/tên file — và một test riêng xác nhận **mỗi size gọi đúng
factory của chính nó** (patch `WhisperOnnxEngine.__init__`, xác nhận `size` truyền vào constructor
khớp id đang tạo). Test này tồn tại để bắt đúng lớp lỗi copy-paste dễ xảy ra nhất khi có 5 factory
gần giống hệt nhau: 1 factory trỏ nhầm sang size khác mà không ai nhận ra cho tới khi người dùng
tải "Medium" nhưng nhận ra server đang chạy "Small".

`pytest` 312/312 (19 test riêng cho `engine_registry.py`, tăng từ 8). `pnpm typecheck` 38/38 —
không đổi dòng TS nào nhưng chạy lại để xác nhận không phá gì ở phía dùng `SttEngineInfo`.

**Chưa tải/chạy thử cả 4 size thật** (chỉ verify được cấu trúc registry + tên file khớp HF,
không tải model để tiết kiệm băng thông/thời gian phiên này) — Sonth nên tự thử tải ít nhất
1 size (khuyến nghị Turbo, cân bằng tốt nhất) qua UI thật trước khi coi tính năng này xong hẳn.
