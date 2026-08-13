---
"@sky-app/module-tts-studio": patch
"@sky-app/tts-engine-ui": minor
"@sky-app/device-shell": patch
---

TTS Studio: chỉ phát 1 audio cùng lúc trong toàn app (phát cái mới tự dừng cái đang phát), nút Play đổi thành Dừng/Pause khi đang phát để tự tắt được. Icon trạng thái TTS trên menu bar hiện rõ trạng thái "đang mở" khi bấm vào. Màu hover trong popover khớp với các menu khác trong app.

"Quản lý engine" và "Thiết bị xử lý" giờ mở như cửa sổ ứng dụng thật (kéo-thả, resize được) thay vì hộp thoại giữa màn hình cố định — dùng `FloatingWindow` nâng cấp mới của `@sonth87/device-layout`. Cửa sổ xem log cũng resize được, kích thước mặc định lớn hơn.
