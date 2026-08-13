---
"@sky-app/tts-engine-ui": major
"@sky-app/device-shell": patch
---

Gộp 3 mục menu "Quản lý engine", "Thiết bị xử lý", "Xem log" thành 1 cửa sổ "Cấu hình" duy nhất, có tab dọc bên trái (Models/Engine, Hiệu ứng, Nhật ký, Cài đặt). Thêm tab "Hiệu ứng" quản lý preset đầy đủ — tạo mới, thêm/xoá/kéo-thả sắp xếp lại hiệu ứng, nghe thử trước khi lưu — thay vì chỉ chọn preset có sẵn như trước.

Breaking (nội bộ, không ảnh hưởng dữ liệu người dùng): `TtsStatusPanel`'s props đổi từ 3 callback riêng (`onManageEngine`/`onDeviceSettings`/`onViewLogs`) thành 1 callback `onOpenConfig`.
