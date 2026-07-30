---
"@sky-app/module-ceremony": minor
"@sky-app/kernel": patch
---

Menu Develop > "Dùng dữ liệu mẫu" giờ là công tắc bật/tắt (có dấu check phản ánh trạng thái thật) thay vì chỉ tạo 1 lần. Tắt sẽ ẩn Event mẫu khỏi danh sách Event (không xoá dữ liệu, bật lại là thấy ngay), tự thoát ra danh sách nếu đang xem chính Event đó. Event mẫu cũng không còn nút "Sửa", nút kích hoạt đổi thành "Xem", và không hiện tag trạng thái — nhấn mạnh đây chỉ là dữ liệu xem thử.

`@sky-app/kernel`: `AppMenuBarItem` thêm field `checked?: boolean` (dấu check kiểu checkbox menu item), khớp `@sonth87/device-layout` ≥0.5.3.
