# 01 — Yêu cầu

## A. Yêu cầu gốc (từ mô tả của Sonth)

1. **App mới = thiết kế trước layout cho ceremony.**
   Dựng sẵn các layout backdrop trước, không phải sửa trực tiếp lúc chạy lễ.

2. **Lưu layout lâu dài (Supabase) hoặc tạm (local) trước.**
   Ưu tiên làm tính năng thiết kế trước, database sau. → cần tách phần lưu trữ khỏi phần thiết kế.

3. **Ceremony đọc layout đã thiết kế** để lấy ra "màn hình thiết kế", rồi **chọn layout theo điều kiện.**
   Ví dụ điều kiện:
   - Nhân viên xuất sắc / sinh viên xuất sắc → layout khác với phần còn lại.
   - Layout 2026 ≠ layout 2025.

4. **Layout là TEMPLATE có biến (`@var@`).**
   Nhiệm vụ của ceremony: dùng layout + điền giá trị biến → layout tự hiển thị tương ứng.
   Ví dụ: `full_name` → ceremony fill `"Nguyễn Văn A"`.

5. **Cần một bộ ADAPTER map các trường**, vì data của ceremony đến từ nhiều nguồn, nhiều dạng:
   - Danh sách nhân viên: `fullname | full_name | first_name + last_name`, `userId`…
   - Danh sách sinh viên: `ten_sv | full_name`, `masv | ma_sv`…
   - → Data linh hoạt, nhưng app phải đưa về **một kiểu chuẩn** (hoặc định nghĩa các loại tương ứng).

## B. Yêu cầu BỔ SUNG (chốt 2026-07-15)

6. **Mỗi layout hỗ trợ nhiều tỷ lệ màn hình.**
   Cho phép add thêm lựa chọn tỷ lệ: `4:3`, `16:9`, `21:9`, `25:9`, … và **custom**.
   Lý do: mỗi tỷ lệ → **vị trí item khác nhau**, **ảnh background khác nhau**.

7. **Không neo theo pixel tuyệt đối.**
   Vì màn hình thật khác nhau: độ phân giải khác, tỷ lệ khác. Toạ độ phải co giãn được.
   (Đây là lý do bác bỏ mô hình px thuần trong prototype editor.)

## C. Phân tích từng yêu cầu → hệ quả thiết kế

### YC1 + YC3 — "thiết kế trước, ceremony tiêu thụ"
→ **2 app, 1 chiều phụ thuộc.** Editor sinh ra artifact; ceremony chỉ đọc.
Editor KHÔNG được là dependency runtime của ceremony. Giao tiếp qua **file/record JSON**.
Đây đã đúng pattern hiện tại: ceremony `fetch(ceremony.backdrops_config).json()`.

### YC2 — "local trước, Supabase sau"
→ Tách **storage** thành một **port** (`LayoutStore`) có nhiều adapter.
Editor & ceremony code theo interface, không biết đằng sau là localStorage/file/Supabase.
Đổi backend lưu trữ = thêm 1 adapter, không sửa app. Xem [06](06-luu-tru-va-giao-tiep.md).

### YC3 — "chọn layout theo điều kiện"
→ Cần một **lớp resolve điều kiện**: `(record, context) → layoutId`.
Ceremony đã có tiền lệ: `resolveTemplate(award_content)`. Nhưng điều kiện tương lai đa dạng hơn
(xếp loại, năm, loại đối tượng nhân viên/sinh viên) → cần **rule engine nhỏ**, không hardcode.
Tái dùng ý tưởng `CustomVariableRule` (op: equals/contains/in/gt/lt…). Xem [05](05-he-bien-va-adapter.md).

### YC4 — "template có biến"
→ Layout lưu **token biến**, không lưu giá trị. Giá trị đến từ record lúc render.
Cần định nghĩa: cú pháp token, danh sách biến hợp lệ, biến ảnh vs biến text, escape.
Xem [05](05-he-bien-va-adapter.md).

### YC5 — "adapter map trường" ⭐ mảnh thiếu thật sự
→ Đây là phần ceremony CHƯA có. Hiện ceremony giả định input đã đúng shape `Student`.
Cần **FieldMappingProfile**: hồ sơ ánh xạ `nguồn thô → canonical key`, hỗ trợ:
- Đổi tên đơn: `full_name ← ho_ten`
- Ghép nhiều cột: `full_name ← [first_name, last_name]`
- Hằng số: `award_type ← "KHENTHUONG"`
- (tương lai) transform: trim, uppercase, format ngày…
Xem [05](05-he-bien-va-adapter.md).

### YC6 — "multi-aspect-ratio mỗi layout"
→ Schema layout phải là **đa biến thể theo tỷ lệ**: một "logical layout" chứa nhiều
"variant" (mỗi tỷ lệ 1 variant), mỗi variant có **background riêng** + **vị trí item riêng**.
Ceremony đã có mầm mống: `BackdropTemplate.variants: Partial<Record<BackdropAspectRatio, ...>>`
NHƯNG bị đóng cứng `'16:9' | '25:9'` và variant chỉ override một phần. Cần tổng quát hóa.
Xem [04](04-schema-layout-document.md).

### YC7 — "không pixel tuyệt đối"
→ Toạ độ theo **phần trăm (%) của khung variant** (như ceremony đang làm), HOẶC
theo hệ **viewport-relative** co giãn. Chốt: **% theo khung của chính variant đó** —
vì mỗi tỷ lệ có khung riêng nên % nội bộ variant là ổn định, không phụ thuộc độ phân giải.
Editor hiển thị px cho dễ thao tác nhưng **lưu ra %**. Xem [04](04-schema-layout-document.md).

## D. Ngoài phạm vi (tạm thời chưa làm — ghi để khỏi quên)

- Xuất hàng loạt ảnh PNG từ editor (prototype có nút "Xuất hàng loạt") — nice-to-have, không phải core.
- Animation/hiệu ứng chuyển cảnh trong layout (ceremony đã có confetti/motion riêng).
- Đa ngôn ngữ trong chính layout (label song ngữ) — cân nhắc sau.
- Versioning layout (lịch sử chỉnh sửa) — để khi lên Supabase.
- Real-time collab nhiều người sửa 1 layout — không cần cho use case hiện tại.
