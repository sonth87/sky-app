---
"@sky-app/tts-engine-ui": minor
"@sky-app/service-contracts": minor
"@sky-app/platform-electron": minor
"@sky-app/platform-web": minor
"@sky-app/module-ceremony": minor
"@sky-app/module-tts-studio": minor
"@sky-app/shell-electron": minor
---

Đưa việc quản lý engine TTS và chọn CPU/GPU thành cơ chế dùng chung cho cả TTS Studio lẫn Ceremony: chọn engine đang dùng, tải thêm engine khi cần, chỉnh số luồng CPU hoặc bật tăng tốc GPU. Trước đây các tuỳ chọn này chỉ có trong phần Cài đặt của Ceremony.

Thêm engine **VoxCPM** (tải theo nhu cầu): đọc được 30 ngôn ngữ trong đó có tiếng Việt, chất lượng giọng cao hơn — đổi lại tốc độ tạo chậm hơn nhiều lần so với engine mặc định, phù hợp khi ưu tiên chất lượng hoặc cần ngôn ngữ khác.

Bản cài đặt sẵn nay tải và cài được engine mở rộng cùng thư viện tăng tốc GPU (trước đây chỉ bản chạy từ mã nguồn mới làm được).
