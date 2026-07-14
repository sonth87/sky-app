---
"@sky-app/module-tts-studio": minor
"@sky-app/service-contracts": minor
"@sky-app/platform-web": minor
"@sky-app/platform-electron": minor
"@sky-app/slide-shared": minor
"@sky-app/shell-electron": minor
"@sky-app/shell-web": minor
---

Thêm app `tts-studio`: chọn giọng đọc, chỉnh tốc độ, nhập text, tạo & tải audio, xem lịch sử các bản đã tạo (lưu IndexedDB local). Đăng ký cho cả Electron và Web.

Mở rộng `TtsPort` thêm `synthesizeBuffer()` (trả buffer audio thô, không tự phát) và `getPreviewUrl()` (URL nghe thử giọng) — dùng bởi app mới, không ảnh hưởng `speak()`/`listVoices()` hiện có. `Voice` thêm field `gender` (optional).
