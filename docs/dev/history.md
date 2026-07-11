# History — Nhật ký kỹ thuật

> Nhật ký **quyết định kỹ thuật + LÝ DO**, theo thứ tự thời gian (mới nhất trên cùng). Đây KHÔNG phải changelog (thứ đó cho người dùng, do Changesets sinh) — đây là ngữ cảnh cho **dev/AI tương lai** hiểu *vì sao* làm thế.
>
> **Cách ghi:** mỗi mục = ngày + tiêu đề + quyết định + lý do + (liên kết). Ghi khi có quyết định đáng kể (kiến trúc, đổi contract, chọn công nghệ, bỏ hướng đã cân nhắc).

---

## 2026-07-11 — Khởi tạo repo + chốt kiến trúc nền tảng

**Quyết định:** Dựng Sky-App làm nền tảng multi-app đa môi trường (web+electron, online+offline) có licensing, thay vì chỉ port Trao Bằng vào device-layout.

**Lý do:** Người dùng định hình tầm nhìn lớn hơn — device-layout + Trao Bằng + TTS chỉ là phần đầu; cần nền tảng mở rộng được, tích hợp nhiều app/service, hỗ trợ cả web lẫn electron, có license theo tính năng.

**Các quyết định con:**
- **Ports & Adapters ở tâm** — vì học từ khảo sát `sdk-hub` + `mfe-shell-app`: cả 2 đều thiếu lớp tách môi trường và lifecycle contract tường minh. Sky-App đặt 2 thứ đó làm trung tâm để chạy được web+electron từ 1 codebase.
- **KHÔNG Module Federation** (dù sdk-hub/mfe dùng) — vì offline-first, static bundle đơn giản & tin cậy hơn micro-frontend runtime.
- **device-layout giữ repo riêng, tích hợp dạng dependency** — vì device-layout tái dùng cho nhiều dự án khác; không submodule/copy để tránh lệch nhánh.
- **device-layout giữ song song Next.js + thêm pipeline Vite lib** — xác minh rẻ: chỉ 2/130 file dùng Next API, 96/130 đã 'use client'. Không cần bỏ Next.
- **Licensing Ed25519 offline verify** — hợp offline-first; chấp nhận không chống crack tuyệt đối.
- **Monorepo pnpm+Turbo, React 19/shadcn/Tailwind v4/TanStack** — công nghệ mới, phổ biến, đồng bộ device-layout.

**Facts kỹ thuật quan trọng (dùng khi code):**
- Trao Bằng bridge tên **`window.slide`** (không phải electronAPI), 117 call-site/30 file, 78 IPC channel + 7 event-listener trả unsubscribe. 2 renderer: Control (trong shell) + Backdrop (kiosk riêng, state Socket.IO). Main giữ WS8765+HTTP8080+Python TTS.
- Trao Bằng React 18 → cần nâng 19. Cả Slide + device-layout đều Tailwind v4 `@theme` global → rủi ro style leakage.
- Điểm nối device-layout nhận app ngoài: `AppRegistry.tsx` (AppContent/AppViewportProvider), `ThemeProvider.tsx` (bỏ hardcode registerApps), `types/app.ts` (thêm `render?`).

**Trạng thái:** chốt tài liệu kiến trúc + khởi tạo repo docs. CHƯA viết code. Lộ trình 7 GĐ ở [architecture/overview.md](../architecture/overview.md) §5.

**Liên quan:** dự án gốc `trao-bang-tot-nghiep-2026` `docs/multi-verse.md`, `docs/multi-app-roadmap.md`.

---

<!-- Thêm mục mới PHÍA TRÊN dòng này, giữ mới-nhất-trên-cùng -->
```
## YYYY-MM-DD — <tiêu đề>
**Quyết định:** ...
**Lý do:** ...
**Liên quan:** ...
```
