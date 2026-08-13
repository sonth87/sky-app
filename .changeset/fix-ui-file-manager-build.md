---
"@sky-app/ui-file-manager": patch
---

Sửa lỗi package không build được: thiếu khai báo `@types/react`/`react`/`typescript` ở devDependencies khiến toàn bộ file dùng JSX/`React.ReactNode` báo lỗi type hàng loạt. Kèm 2 lỗi type thật phát hiện sau khi build sạch trở lại: thiếu field `onDelete` trong `FileLibraryConfig`, và `containerRef` khai kiểu không khớp React 19 (`useRef(null)` trả về ref có thể `null`).
