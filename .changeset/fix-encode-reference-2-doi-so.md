---
"@sky-app/shell-electron": patch
"@sky-app/tts-service": patch
---

Sửa lỗi tạo audio bằng giọng đã sao chép (clone) báo lỗi 500 khi engine đang chạy là VieNeu hoặc engine mặc định (bundled) — trước đây các engine này bị gọi nhầm với tham số bản chép lời mà chúng không hỗ trợ.
