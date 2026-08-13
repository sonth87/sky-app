# 2026-08-12 — Backfill `ref_text` bỏ sót voice catalog ĐÃ import trước đó

**Bối cảnh:** Ngay sau khi sửa `encode_reference()` (xem
[2026-08-12 — Sửa encode_reference() vỡ khi engine không nhận ref_text](./2026-08-12-fix-encode-reference-2-doi-so.md)),
Sonth chuyển sang engine Qwen rồi thử lại — vẫn nhận đúng lỗi ban đầu:
`Qwen3-TTS 1.7B cần bản chép lời của audio mẫu để clone giọng`, dù `catalog.json` đã có
`ref_text` cho toàn bộ 46 giọng vi-VN từ trước đó trong cùng phiên làm việc.

## Nguyên nhân: backfill chỉ chạy trên 1 trong 2 đường tìm voice

`_ensure_voice_ready(speaker_id)` có 2 đường trả về voice:

1. `_registry.get_voice(speaker_id)` tìm thấy NGAY — khi `speaker_id` đã là id REGISTRY
   (vd `"clone-d0f05071"`). Đây là đường **phổ biến hơn hẳn** trong thực tế: UI, lịch sử,
   giá trị mặc định của client đều nhớ/gửi id registry, không phải id catalog gốc.
2. Không tìm thấy → tra catalog theo id gốc (vd `"giang_narrator"`) → `_import_catalog_entry`.

Bug thật (đã sửa 1 lần ở phiên trước, xem
[2026-08-12 — Backfill ref_text cho catalog](./2026-08-12-catalog-ref-text-va-mp3-clone.md)):
logic "đồng bộ lại `ref_text` từ catalog nếu voice đã import từ trước mà còn thiếu" CHỈ nằm
trong nhánh idempotent của `_import_catalog_entry` — tức chỉ chạy ở đường (2). Đường (1),
đường được dùng trong ĐA SỐ request thật, hoàn toàn bỏ qua bước backfill này.

**Xác nhận trên dữ liệu thật** (không chỉ suy luận): đọc thẳng `sky-app.db`, voice
`clone-d0f05071` (nhãn "Giang") có `source_catalog_id = giang_narrator`,
`source_lang = vi-VN`, sample `ref_text` RỖNG — trong khi `catalog.json`'s `giang_narrator`
đã có transcript đầy đủ. Đúng khớp giả thuyết trước khi viết fix.

## Sửa: tách backfill thành helper dùng chung, gọi ở CẢ 2 đường

Thêm `_backfill_ref_text_from_catalog(voice: dict)` — nhận voice dict (không phải catalog
entry), tự tra catalog qua `voice["source_catalog_id"]` + `voice["source_lang"]`. Gọi ở:
- `_ensure_voice_ready`'s nhánh `get_voice()` tìm thấy ngay (MỚI thêm).
- `_import_catalog_entry`'s nhánh idempotent (giữ hành vi cũ, chỉ đổi cách gọi).

Voice không có `source_catalog_id` (người dùng tự clone, không qua catalog) hoặc catalog
chưa có `ref_text` → no-op an toàn, không raise.

## Kiểm chứng

5 test mới (`test_ensure_voice_ready.py`), dùng `_FakeRegistry` + catalog thật ghi ra
`tmp_path` (không mock `find_catalog_entry`, chạy qua code đọc file JSON thật). Tái hiện
đúng kịch bản đã xác nhận trên DB thật: voice import trước, catalog có transcript sau →
backfill đúng lần synthesize kế tiếp. Kèm test không ghi đè transcript người dùng đã tự sửa
(giữ đúng bất biến cũ), và test voice không thuộc catalog không bị đụng tới.

214/214 test Python qua (209 trước đó + 5 mới). Không thử ghi trực tiếp vào `sky-app.db`
thật đang chạy cùng `pnpm dev` — rủi ro tranh chấp khoá không cần thiết khi test giả lập đã
đủ tin cậy; xác nhận thật sẽ tới tự nhiên khi Sonth khởi động lại dev server và synthesize
lại giọng "Giang".
