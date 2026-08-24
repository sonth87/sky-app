---
"@sky-app/tts-service": patch
---

Nâng cấp thư viện VieNeu lên bản 3.3.0 (từ 3.0.9) — kèm sửa `VieneuEngine` theo contract mới của thư viện (`encode_reference`/`infer` đổi shape tham số), tránh lỗi âm thầm đọc nhầm giọng mặc định thay vì giọng đã sao chép (clone) khi chỉ bump version mà không sửa code gọi.
