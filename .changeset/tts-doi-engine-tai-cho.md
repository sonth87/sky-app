---
"@sky-app/tts-engine-ui": minor
"@sky-app/shell-electron": minor
"@sky-app/tts-service": minor
"@sky-app/service-contracts": minor
"@sky-app/slide-shared": minor
"@sky-app/platform-electron": minor
---

Đổi giọng đọc (engine TTS) giờ gần như tức thì thay vì phải chờ vài phút. Trước đây mỗi lần đổi engine, hệ thống tải mô hình lên tới ba lần liên tiếp (kiểm tra, kiểm tra lại, rồi khởi động lại dịch vụ) — với engine nặng như VoxCPM, mỗi lượt tải mất khoảng hai phút.

Nay engine đã dùng được giữ sẵn trong bộ nhớ: quay lại engine cũ không phải tải lại chút nào. Đổi giữa các engine nhẹ đo được ở mức vài mili giây thay vì hàng phút.

Thêm chức năng giải phóng bộ nhớ cho engine đang không dùng mà vẫn giữ nguyên dữ liệu đã tải về máy — lần dùng sau nạp lại ngay từ ổ đĩa, không cần tải lại từ mạng.

Tiến trình tạo giọng nói nay hiện tên **Sky App TTS** trong Activity Monitor (macOS) / Task Manager (Windows) thay vì tên kỹ thuật khó hiểu — dễ nhận ra khi cần theo dõi hoặc tắt thủ công.

Sửa lỗi: ở bản cài đặt sẵn, engine tải thêm (VoxCPM, MOSS) không khởi động được vì ứng dụng tìm sai chỗ đặt bộ thư viện Python đã tải về — nay đã trỏ đúng.

Màn hình quản lý engine được làm mới: danh sách gọn một dòng mỗi engine kèm dấu hiệu trạng thái, bấm vào để xem bảng chi tiết (mô tả, nguồn model trên HuggingFace, loại thư viện chạy, dung lượng chiếm đĩa, yêu cầu phần cứng) cùng toàn bộ thao tác. Đầu màn hình hiển thị nơi lưu trữ engine kèm nút mở thẳng thư mục đó bằng Finder/Explorer.
