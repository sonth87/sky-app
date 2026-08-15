# History — Nhật ký kỹ thuật

> Nhật ký **quyết định kỹ thuật + LÝ DO**, mỗi mục 1 file (mới nhất trên cùng). Đây KHÔNG phải changelog (thứ đó cho người dùng, do Changesets sinh) — đây là ngữ cảnh cho **dev/AI tương lai** hiểu *vì sao* làm thế.
>
> **Cách ghi:** tạo 1 file mới `YYYY-MM-DD-slug.md` trong thư mục này = ngày + tiêu đề + quyết định + lý do + (liên kết), rồi thêm 1 dòng vào mục lục bên dưới (trên cùng). Ghi khi có quyết định đáng kể (kiến trúc, đổi contract, chọn công nghệ, bỏ hướng đã cân nhắc).

## Mục lục (mới nhất trên cùng)

- [2026-08-15 — App "Speech to Text" riêng + lịch sử phiên âm (GĐ 3)](./2026-08-15-stt-app-rieng-va-lich-su.md)
- [2026-08-14 — Nút "Tự động điền transcript" (GĐ 2)](./2026-08-14-stt-nut-tu-dong-dien-transcript.md)
- [2026-08-14 — STT (Speech-to-Text): nền tảng engine + port (GĐ 1)](./2026-08-14-stt-nen-tang-giai-doan-1.md)
- [2026-08-13 — Lịch sử sinh audio trong DB dùng chung (Phase 3)](./2026-08-13-lich-su-sinh-audio-trong-db.md)
- [2026-08-12 — Gộp 3 mục menu TTS thành 1 cửa sổ "Cấu hình" 4 tab](./2026-08-12-gop-cua-so-cau-hinh-tts.md)
- [2026-08-12 — `ConfigStore` bị 2 tiến trình ghi đè ngược engine đã chọn](./2026-08-12-config-store-ghi-de-engine-2-tien-trinh.md)
- [2026-08-12 — Backfill `ref_text` bỏ sót voice catalog ĐÃ import trước đó](./2026-08-12-backfill-ref-text-bo-sot-voice-da-import.md)
- [2026-08-12 — Sửa `encode_reference()` vỡ khi engine không nhận `ref_text`](./2026-08-12-fix-encode-reference-2-doi-so.md)
- [2026-08-12 — Backfill ref_text cho catalog + cho phép mp3 khi Clone Voice](./2026-08-12-catalog-ref-text-va-mp3-clone.md)
- [2026-08-12 — Một giọng nhiều mẫu audio (Phase 2)](./2026-08-12-mot-giong-nhieu-mau-multi-sample.md)
- [2026-08-12 — Python nối vào DB dùng chung (Phase 1)](./2026-08-12-python-noi-vao-db-dung-chung.md)
- [2026-08-12 — DB dùng chung cho toàn app: đổi tên + nền móng (Phase 0)](./2026-08-12-db-dung-chung-doi-ten-va-nen-mong.md)
- [2026-08-11 — Sửa lỗi Hủy cài engine TTS âm thầm xoá dữ liệu + UI kẹt "đang cài" dù đã xong](./2026-08-11-fix-huy-cai-dat-am-tham-xoa-du-lieu.md)
- [2026-08-05 — MOSS codec stereo (2 kênh) → future conversation/podcast mode (stereo panning L/R)](./2026-08-05-stereo-tts-conversation-mode.md)
- [2026-07-30 — "Dùng dữ liệu mẫu" thành công tắc bật/tắt, không xoá DB](./2026-07-30-toggle-du-lieu-mau.md)
- [2026-07-29 — Màn hình chờ chỉ hiển thị từ layout đã chọn, không còn fallback](./2026-07-29-man-hinh-cho-chi-tu-layout-design.md)
- [2026-07-29 — Dựng packages/ui dùng chung, dọn trùng lặp UI giữa các module](./2026-07-29-package-ui-dung-chung.md)
- [2026-07-29 — Màu tag cho Event + ModeSwitch theo màu theme ceremony](./2026-07-29-event-color-tag-va-modeswitch-theme.md)
- [2026-07-28 — Sửa 6 lỗi/UX từ đợt QA thủ công đầu tiên của Event Hub + LayoutRenderer](./2026-07-28-fix-event-live-sync-va-ux.md)
- [2026-07-28 — Nối backdrop trao giải + màn chờ sang LayoutRenderer thật](./2026-07-28-backdrop-layout-renderer.md)
- [2026-07-15 — device-layout: chuyển sang git dependency (commit dist-lib + git tag), bỏ tarball local](./2026-07-15-device-layout-git-dependency-commit-dist-lib.md)
- [2026-07-14 — Đánh giá lại: device-layout giữ tarball local (⚠️ đã bị thay thế 2026-07-15)](./2026-07-14-danh-gia-device-layout-git-dependency.md)
- [2026-07-14 — App mới `tts-studio`: mở rộng TtsPort thay vì port riêng](./2026-07-14-tts-studio-app-moi.md)
- [2026-07-12 — Giai đoạn 7: Web parity — TtsPort + Licensing thật cho web](./2026-07-12-giai-doan-7-web-parity.md)
- [2026-07-12 — Tinh chỉnh Wallpaper picker + fix fullscreen thật + dock size slider](./2026-07-12-tinh-chinh-wallpaper-fullscreen-dock.md)
- [2026-07-12 — Wallpaper Settings kiểu macOS (Pictures/Colors/Custom + Shuffle) + fix nền trắng](./2026-07-12-wallpaper-settings-macos.md)
- [2026-07-12 — Built-in demo apps trở lại + true macOS fullscreen trong device-layout](./2026-07-12-demo-apps-fullscreen-macos.md)
- [2026-07-12 — Giai đoạn 6 (phần 1): Licensing thật — packages/licensing + gate dock hoạt động end-to-end](./2026-07-12-giai-doan-6-licensing.md)
- [2026-07-12 — Dọn nốt việc treo của Giai đoạn 5: Backdrop port + fix bug `getControlWindow` luôn null + venv Python](./2026-07-12-don-viec-treo-giai-doan-5.md)
- [2026-07-12 — Giai đoạn 5: Ceremony UI thật thành module, mở được trong device-layout (bug hit-test xuyên suốt đã fix)](./2026-07-12-giai-doan-5-ceremony-module.md)
- [2026-07-11 — Giai đoạn 4: Port backend Ceremony thật vào sky-app, chạy thật (WS/HTTP/Python/window.slide)](./2026-07-11-giai-doan-4-port-backend-ceremony.md)
- [2026-07-11 — Giai đoạn 3: platform-electron + platform-web + 2 shell mỏng, chạy thật cả Electron lẫn browser](./2026-07-11-giai-doan-3-platform-shells.md)
- [2026-07-11 — Giai đoạn 2: device-layout thành lib + device-shell nối kernel, verify xanh](./2026-07-11-giai-doan-2-device-layout-lib.md)
- [2026-07-11 — Giai đoạn 1: Kernel + contract implement xong, verify xanh](./2026-07-11-giai-doan-1-kernel-contracts.md)
- [2026-07-11 — Khởi tạo repo + chốt kiến trúc nền tảng](./2026-07-11-khoi-tao-repo-chot-kien-truc.md)

## Mẫu file mới

```markdown
# YYYY-MM-DD — <tiêu đề>

**Quyết định:** ...
**Lý do:** ...
**Liên quan:** ...
```
