# 2026-08-12 — `ConfigStore` bị 2 tiến trình ghi đè ngược engine đã chọn

**Bối cảnh:** Sonth báo: mỗi lần mở lại app dev, TTS luôn tự khởi động MOSS-TTS-Nano dù
trước khi tắt đã chọn Qwen 1.7B. Đọc thẳng file config thật
(`apps/shell-electron/resources/vieneu-config.json`, dev mode) xác nhận: `"engine":
"moss-tts-nano"` — không phải `"qwen-1.7b"` như Sonth nhớ đã chọn.

## Nguyên nhân: 2 tiến trình Python, 1 file config, mỗi bên giữ snapshot riêng

`python-server.ts` chạy 2 tier Python kiểu **blue-green**: khi đổi sang engine ở tier khác
(vd VieNeu/MOSS-TTS-Nano ở tier `bundled` → Qwen ở tier `ext`), tier CŨ **không bị kill** —
cố tình để lần quay lại sau nhanh, không phải nạp lại. Cả 2 tiến trình dùng CHUNG 1 file
(`VIENEU_CONFIG_PATH` truyền giống nhau cho cả 2 lúc spawn).

`config_store.py`'s `ConfigStore.__init__` nạp `self._data` **1 LẦN** lúc khởi động tiến
trình, giữ trong bộ nhớ. `update()` (cũ) ghi thẳng `self._data` (đã cũ) xuống đĩa mỗi lần
gọi — không đọc lại đĩa trước. Chuỗi sự kiện thật:

1. Tier `bundled` khởi động, nạp `engine: "moss-tts-nano"` (từ phiên trước) vào bộ nhớ.
2. Người dùng chọn Qwen → tier `ext` khởi động (tiến trình MỚI, nạp riêng), lưu đúng
   `engine: "qwen-1.7b"` xuống đĩa.
3. Tier `bundled` (vẫn sống, bộ nhớ còn `engine: "moss-tts-nano"`) tại một thời điểm nào đó
   gọi `_config.update({...})` cho lý do KHÁC hẳn (đổi `device`/`infer` qua Settings, hoặc
   nhánh nào đó tự chạm `/config`) → ghi ĐÈ CẢ FILE bằng `self._data` cũ, kéo theo `engine`
   về `"moss-tts-nano"` dù bản thân partial update đó không hề nhắc tới `engine`.

Đây là lỗi kiến trúc kinh điển: 2 tiến trình chia sẻ 1 file nhưng không đồng bộ trạng thái
qua lại — bất kỳ field nào KHÔNG đổi trong 1 lượt `update()` vẫn có thể bị ghi đè về giá trị
CŨ trong bộ nhớ của tiến trình đang gọi, nếu tiến trình khác đã đổi field đó sau khi tiến
trình này khởi động.

## Sửa: nạp lại từ đĩa NGAY TRƯỚC khi merge

`ConfigStore.update()` giờ gọi `self._data = self._load()` ở đầu, trước khi áp `partial` —
đảm bảo field không đổi trong lượt update này luôn giữ giá trị MỚI NHẤT trên đĩa (do tiến
trình khác lưu), không phải giá trị snapshot cũ của tiến trình đang gọi. Còn 1 khoảng hở
TOCTOU rất hẹp (2 tiến trình `update()` gần như đồng thời) nhưng đây là settings người dùng
thao tác tay, tần suất thấp — chấp nhận được, khác hẳn bug cũ là **luôn luôn** tái diễn cho
BẤT KỲ field nào đổi sau khi 1 tiến trình khởi động.

Sửa kèm: file config dev hiện tại (`apps/shell-electron/resources/vieneu-config.json`,
gitignored — state runtime cục bộ) đổi tay `engine` về `"qwen-1.7b"` để khớp đúng ý định
gần nhất của Sonth, không chờ code fix tự sửa qua lần chọn lại kế tiếp.

## Kiểm chứng

3 test mới (`test_config_store.py`), quan trọng nhất: `test_2_tien_trinh_gia_lap_khong_ghi_de_nguoc_engine`
dựng 2 `ConfigStore` RIÊNG trỏ cùng 1 file (đúng mô hình 2 tiến trình thật) tái hiện chính
xác chuỗi sự kiện ở trên. Đã tự xác nhận sức mạnh phân biệt của test: mô phỏng lại logic
`update()` CŨ (không nạp lại đĩa) trong 1 script riêng, chạy đúng kịch bản — FAIL đúng như dự
đoán (`engine` bị kéo về `"moss-tts-nano"`), xác nhận test không pass giả. 217/217 test qua
(214 trước đó + 3 mới).
