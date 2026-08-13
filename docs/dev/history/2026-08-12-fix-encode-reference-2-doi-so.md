# 2026-08-12 — Sửa `encode_reference()` vỡ khi engine không nhận `ref_text`

**Bối cảnh:** Ngay sau khi backfill `ref_text` cho catalog (xem
[2026-08-12 — Backfill ref_text cho catalog + cho phép mp3](./2026-08-12-catalog-ref-text-va-mp3-clone.md)),
Sonth báo lỗi thật khi synthesize giọng clone bằng tier `bundled` (engine mặc định):

```
TypeError: MossNanoEngine.encode_reference() takes 2 positional arguments but 3 were given
```

## Nguyên nhân: Protocol optional ≠ mọi implementation đều nhận đối số đó

`TTSEngine` Protocol (`engine.py:143`) khai `encode_reference(self, wav_path, ref_text=None)`
với ý định optional — docstring gốc ghi rõ "engine nào chưa nhận tham số này vẫn gọi được
với 1 đối số như trước". Nhưng đây là hiểu nhầm về cách Protocol hoạt động: optional ở
Protocol chỉ có tác dụng nếu CHÍNH concrete class đó cũng khai tham số optional tương tự.
Python không tự "bỏ bớt" đối số thừa khi gọi 1 method không khai nhận nó — 3 trong 5 call
site ở `main.py` gọi `_engine.encode_reference(str(ref_path), ref_text)` **vô điều kiện**,
trong khi 2/5 class thật (`VieneuEngine`, `MossNanoEngine` — cả hai đều thuộc dạng
preset/embedding thuần, không phải in-context) chỉ khai `encode_reference(self, wav_path)`,
KHÔNG có `ref_text`. Chỉ Qwen×2 và VoxCPM (kiểu in-context, cần transcript để căn text↔codec)
mới thật sự khai tham số đó.

Bug này đã tồn tại từ trước phiên làm việc backfill catalog (xem git blame — cách gọi 2 đối
số đã có ở dạng `voice.get("ref_text")` từ trước, không phải do refactor `_resolve_voice_ref`
mới thêm). Lý do chưa lộ ra sớm hơn: catalog trước đó chưa có `ref_text` nào nên
`voice.get("ref_text")` luôn `None` — nhưng `None` vẫn là 1 đối số dư, đáng lẽ đã vỡ ngay cả
khi giá trị là `None`. Có thể tier `bundled` (MossNanoEngine) trước giờ ít được test với
giọng clone hơn tier khác — không truy được lý do chính xác, chỉ biết chắc: bug độc lập với
nội dung `ref_text`, chỉ phụ thuộc ENGINE đang chạy có khai tham số đó hay không.

## Sửa: kiểm signature thật trước khi gọi, không hard-code danh sách engine

Thêm `_encode_reference(engine, ref_path, ref_text)` (`main.py`, ngay trước
`_resolve_voice_ref`) — dùng `inspect.signature(engine.encode_reference).parameters` để
quyết định gọi 1 hay 2 đối số. Áp dụng cho cả 3 call site (`lifespan` pre-encode loop,
`_import_catalog_entry`, `_run_synthesis`) thay vì gọi `_engine.encode_reference(...)` trực
tiếp.

Chọn kiểm signature động thay vì thêm 1 field capability mới (kiểu `accepts_ref_text` cạnh
`requires_ref_text` đã có) vì: capability field phải nhớ khai đúng ở MỌI engine mới thêm sau
này — quên khai là tái diễn đúng bug này dưới dạng khác. Kiểm signature tự đúng theo code
thật của engine, không cần đồng bộ tay giữa "khai báo" và "implementation".

## Kiểm chứng

3 test mới (`test_encode_reference.py`) dùng class giả lập cả 2 kiểu signature. Quan trọng
hơn: xác nhận riêng bằng `inspect.signature()` trên **5 class engine thật** (không mock) —
`MossNanoEngine`/`VieneuEngine` chỉ có `wav_path`, `QwenEngine`/`QwenMlxEngine`/`VoxCpmEngine`
có cả `ref_text` — khớp đúng phân loại "preset/embedding thuần" vs "in-context" đã suy luận,
không chỉ tin vào test với fake class. 209/209 test Python qua (206 trước đó + 3 mới).
