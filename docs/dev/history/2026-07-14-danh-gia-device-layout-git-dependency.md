# 2026-07-14 — Đánh giá lại: device-layout vẫn giữ tarball local, không chuyển sang git dependency

> ⚠️ **ĐÃ BỊ THAY THẾ (2026-07-15):** quyết định "giữ tarball" dưới đây bị đảo ngay hôm sau — chuyển sang git dependency (cách A: commit `dist-lib/` + git tag). Lý do đảo: đánh giá lần này bỏ sót rằng `dist-lib/` chỉ import react/react-dom từ ngoài (mọi dep khác đã bundle sẵn), và cách A commit `dist-lib` KHÔNG dính chi phí 583MB (đó là chi phí của cách B — prepare script). Xem [2026-07-15-device-layout-git-dependency-commit-dist-lib.md](./2026-07-15-device-layout-git-dependency-commit-dist-lib.md). Giữ lại file này làm lịch sử phân tích, không xóa.

**Bối cảnh:** Người dùng hỏi có nên đổi `@sonth87/device-layout: "file:../../.vendor/*.tgz"` (cả 3 chỗ: `apps/shell-electron`, `apps/shell-web`, `packages/device-shell`) sang trỏ thẳng `github:sonth87/device-layout` — vì đây chính là link GitHub thật của workspace `device-layout` (repo riêng, `~/PROJECTS/device-layout`), và `docs/architecture/overview.md` liệt kê "publish/version device-layout lib" ở mục "Còn mở" (chưa chốt), không phải quy định bắt buộc dùng file local.

**Quyết định: KHÔNG đổi, giữ tarball local.** Không phải vì "quy định cấm" (không có), mà vì đánh giá kỹ thuật thực tế:

`device-layout/package.json`: `"private": true`, không có `prepare`/`postinstall`/`prepublishOnly` script nào tự chạy `build:lib`. `"main": "./dist-lib/index.js"` chỉ tồn tại SAU KHI build — source thô từ git không có sẵn file này. Nếu trỏ `github:sonth87/device-layout`, pnpm sẽ clone nguyên repo Next.js (source + mọi devDependencies khi install — đo thực tế: `node_modules` của device-layout nặng **583MB**) chỉ để build ra `dist-lib/` **1.7MB** (thời gian build `vite build` ~4s) — phần lớn 583MB đó bị vứt bỏ ngay sau build, chỉ tốn băng thông/thời gian `pnpm install` ở mọi máy dev + CI.

So sánh: tarball hiện tại (`scripts/vendor-device-layout.sh` — build `dist-lib/` rồi `pnpm pack`) chỉ tải/cài đúng 1.7MB đã build sẵn, không cần cài Next.js/React của device-layout vào sky-app.

**Không cần sửa `vendor-device-layout.sh`** — đã đúng chuẩn (build → pack → nhắc `pnpm install`), không có gì để "khép kín" thêm.

**Nếu muốn giải quyết triệt để "còn mở" này trong tương lai** (không phải việc của lần đánh giá này): cách đúng là thêm `"prepare": "pnpm build:lib"` vào `device-layout/package.json` rồi mới cân nhắc git dependency — nhưng vẫn phải chấp nhận đánh đổi 583MB `node_modules`/lần install trừ khi cấu hình lại `installConfig`/sparse checkout để tránh cài toàn bộ devDependencies Next.js chỉ để chạy Vite build. Chưa đủ động lực để làm — tarball hiện tại rẻ hơn nhiều và không có vấn đề thực tế nào đang gặp phải.

**Cập nhật docs:** `docs/architecture/overview.md` §6 — chuyển "publish/version device-layout lib" ra khỏi mục "Còn mở", thêm dòng "Chốt" ghi rõ quyết định + số liệu trên.

**Liên quan:** [2026-07-11 — Giai đoạn 2: device-layout thành lib](./2026-07-11-giai-doan-2-device-layout-lib.md) (quyết định gốc dùng tarball), `scripts/vendor-device-layout.sh`.
