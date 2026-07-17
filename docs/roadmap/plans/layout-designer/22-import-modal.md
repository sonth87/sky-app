# 22 — Import Modal (confirm chi tiết + màn kết quả kiểu git-diff + khóa tự nhiên)

> Yêu cầu MỚI (2026-07-16, xem [20](20-rasoat-2026-07-16.md) §A2): re-import data không được
> chỉ "chạy check rồi hỏi có import không" như hiện tại — cần **modal rõ ràng** cho user chọn
> cách xử lý bản ghi trùng, và **màn kết quả** hiển thị đã import/ghi đè/xóa bao nhiêu, dạng
> **bảng highlight màu kiểu git**. Đây cũng là chỗ giải lỗ hổng "người đã nhận bằng xuất hiện
> lại ở đợt sau" (id ổn định theo khóa tự nhiên).

## 1. Bối cảnh: 2 tình huống re-import (Sonth nêu)

- **2 đợt riêng, data riêng:** import vào 1 DataSource mới hoàn toàn — không đụng data cũ.
- **Chạy trên chính đợt trước + import thêm:** import vào 1 DataSource ĐÃ CÓ data → cần quyết
  định từng bản ghi: ghi đè / thêm mới / bỏ qua / xóa.

→ Modal import phải phục vụ cả 2, phân biệt rõ "tạo DataSource mới" vs "cập nhật DataSource cũ".

## 2. Khóa tự nhiên — nền tảng để re-import đúng

Trước khi import vào DataSource đã có, phải biết "bản ghi nào là CÙNG người với bản ghi cũ".
→ Mỗi DataSource khai báo **1 trường làm khóa tự nhiên** (Sonth: "lấy theo 1 trường user quy
định — masv, manv, id... hoặc tự sinh id ổn định theo khóa tự nhiên"):

```ts
export interface DataSource {
  // ...(field cũ)
  naturalKeyField: string;   // MỚI — tên cột dùng làm khóa định danh bản ghi, VD "student_code",
                              // "manv". record.id được sinh ỔN ĐỊNH từ giá trị trường này (VD
                              // hash hoặc dùng thẳng giá trị) → re-import cùng người = cùng id.
}
```

**Hệ quả giải lỗ hổng A2:** `consumedIds` trỏ theo `record.id` (ổn định theo khóa tự nhiên) →
đợt 1 trao xong người X (id sinh từ mã SV của X); đợt 2 re-import danh sách cập nhật, X vẫn có
cùng mã SV → cùng id → `consumedIds` cũ vẫn trỏ đúng X → **X không xuất hiện lại**. Chỉ khi
khóa tự nhiên đổi (đổi mã SV — hiếm) mới mất liên kết, và đó là đúng ngữ nghĩa "người khác".

## 3. Luồng modal import (thay cho "hỏi có import?" hiện tại)

```
Bước 1 — Chọn file + đích
  ├─ File nguồn (Excel/CSV/JSON)
  ├─ Đích: (a) Tạo DataSource mới  ·  (b) Cập nhật DataSource đã có [chọn từ list]
  └─ Chọn/xác nhận FieldMappingProfile (map cột → canonical) + trường khóa tự nhiên

Bước 2 — Xem trước & chọn chiến lược trùng (chỉ khi đích = DataSource đã có)
  Hệ thống so khớp theo khóa tự nhiên, phân loại từng bản ghi nguồn:
    ┌─ Bảng preview, highlight màu kiểu git ──────────────────────────────┐
    │ 🟢 THÊM MỚI (nn)   — khóa chưa có trong DataSource                    │
    │ 🟡 GHI ĐÈ (nn)     — khóa đã có, giá trị khác → cập nhật              │
    │ ⚪ KHÔNG ĐỔI (nn)  — khóa đã có, giá trị y hệt → bỏ qua               │
    │ 🔴 SẼ XÓA (nn)     — khóa CÓ trong DataSource nhưng KHÔNG có trong    │
    │                      file nguồn (chỉ hiện nếu chọn chế độ "đồng bộ    │
    │                      hoàn toàn" — xem chiến lược dưới)                 │
    └─────────────────────────────────────────────────────────────────────┘
  Chiến lược trùng (user chọn 1):
    ├─ "Gộp (merge)"      — thêm mới + ghi đè bản trùng, GIỮ bản cũ không có trong file
    ├─ "Chỉ thêm mới"     — chỉ nhận bản khóa chưa tồn tại, bỏ qua mọi bản trùng
    └─ "Đồng bộ hoàn toàn"— thêm/ghi đè theo file, XÓA bản cũ không có trong file (kích hoạt
                            nhóm 🔴; cảnh báo rõ vì có thể xóa nhầm)

Bước 3 — Xác nhận & thực thi (transaction SQL — all-or-nothing)

Bước 4 — MÀN KẾT QUẢ (trên chính modal)
  ┌─ Kết quả import ────────────────────────────────────────────┐
  │ ✅ Đã thêm mới:   45                                          │
  │ ✅ Đã ghi đè:     12                                          │
  │ ✅ Không đổi:    243                                          │
  │ ⚠️ Đã xóa:         3   (nếu chế độ đồng bộ hoàn toàn)          │
  │ ❌ Lỗi/bỏ qua:     0                                          │
  │                                                              │
  │ [Bảng chi tiết — cùng highlight màu, cuộn xem từng dòng]      │
  └──────────────────────────────────────────────────────────────┘
```

## 4. Ảnh hưởng consumedIds khi import (quan trọng cho consumable)

- **Ghi đè bản ghi đã consumed:** giữ nguyên trạng thái consumed (cùng id → `consumedIds` không
  đổi). Chỉ cập nhật nội dung (tên/ảnh), không "trao lại".
- **Xóa bản ghi đã consumed** (chế độ đồng bộ hoàn toàn): cảnh báo rõ "người này đã được đánh dấu
  đã xử lý — xóa sẽ mất dấu vết đó". Không tự động xóa consumedIds tương ứng trừ khi user xác nhận.
- Màn kết quả nên thống kê riêng "trong số ghi đè/xóa, có N người đã consumed" để user thấy tác động.

## 5. Đặt ở đâu / dùng lại gì

- **UI:** modal trong `modules/ceremony/src/control/` — dùng ở **Bước 2 wizard tạo Event**
  (import lần đầu) VÀ ở màn quản lý DataSource độc lập (re-import cập nhật).
- **Logic so khớp:** hàm thuần trong `ceremony-db` (hoặc slide-shared): `diffImport(existing,
  incoming, naturalKeyField) → { added, overwritten, unchanged, removed }` — test được tách
  khỏi UI, tái dùng cho cả preview lẫn thực thi.
- **Tận dụng tiền lệ:** logic này gần giống `applyMerge` hiện tại (merge students theo
  `student_code`, giữ trường vận hành) — nhưng `applyMerge` không có modal/preview/chiến lược
  chọn. Có thể tổng quát hóa `applyMerge` thành `diffImport` + apply, dùng chung.

## 6. Phạm vi triển khai (đưa vào plan)

- **GĐ4a (Bước 2 wizard):** import lần đầu tạo DataSource + màn preview/kết quả (chưa cần re-import
  cập nhật phức tạp — DataSource mới nên chỉ có nhóm 🟢 THÊM MỚI).
- **GĐ4a hoặc GĐ5:** re-import cập nhật DataSource đã có (đủ 4 nhóm màu + 3 chiến lược) — cân
  nhắc để GĐ5 (cùng đợt import/export) nếu GĐ4a quá tải, vì re-import không chặn luồng tạo Event
  lần đầu. Ghi rõ trong plan.
- **Khóa tự nhiên** (`DataSource.naturalKeyField`): schema từ GĐ3 (khi tạo bảng `data_source`).

## 7. Câu hỏi mở
- Định dạng file nguồn: hỗ trợ Excel (.xlsx) ngay hay chỉ CSV/JSON trước? (.xlsx cần thư viện
  parse — SheetJS; cân nhắc effort). Đề xuất: CSV/JSON trước, .xlsx sau nếu cần.
- Khi khóa tự nhiên trùng NHAU trong chính file nguồn (2 dòng cùng mã SV) → báo lỗi hay lấy dòng
  cuối? Đề xuất: báo lỗi ở màn preview (highlight đỏ "trùng khóa trong file"), buộc user sửa file.
