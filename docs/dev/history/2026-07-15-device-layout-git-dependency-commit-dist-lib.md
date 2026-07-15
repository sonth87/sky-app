# 2026-07-15 — device-layout: chuyển sang git dependency (commit dist-lib + git tag), bỏ tarball local

**Bối cảnh:** Đảo ngược quyết định [2026-07-14](./2026-07-14-danh-gia-device-layout-git-dependency.md) ("giữ tarball") sau khi người dùng yêu cầu đánh giá lại kỹ hơn. Lần đánh giá trước loại git dependency dựa trên con số "583MB node_modules" — nhưng đó là chi phí của **cách B (prepare script tự build khi install)**, không phải của **cách A (commit dist-lib sẵn vào git)**. Cách A không dính chi phí đó.

**Phát hiện quyết định (kiểm chứng thực tế):** `dist-lib/index.js` chỉ `import` từ `react`, `react-dom`, `react/jsx-runtime` — mọi dependency khác (radix, motion, zustand, lucide, next-pwa...) đã được Vite **bundle thẳng vào** các file trong `dist-lib/`. Nghĩa là bản build 1.8MB tự chứa mọi thứ runtime cần, chỉ peer react/react-dom (sky-app đã có). 28 `dependencies` của device-layout chỉ cần lúc BUILD, không cần lúc consume.

**Rào cản thật (khác con số 583MB lần trước nêu):** `dist-lib/` bị `.gitignore` ở repo device-layout → git dependency clone về sẽ thiếu `dist-lib/`, `"main": "./dist-lib/index.js"` trỏ vào hư vô. Đây mới là lý do trước đó git-dep "không chạy được", không phải vì chi phí cài đặt.

**Quyết định: cách A — commit `dist-lib/` vào git device-layout, sky-app trỏ `github:sonth87/device-layout#<tag>`.**

So sánh A vs B (2 phương án hợp lệ duy nhất — tarball local + "clone repo về trỏ đường dẫn" đều thất bại mục tiêu "sky-app không phải bận tâm device-layout"):
- **A (chọn):** pnpm install nhanh (chỉ tải dist-lib ~1.8MB đã build), KHÔNG cài devDeps device-layout, CI nhẹ. Đổi lại: mỗi release device-layout phải build + commit binary `dist-lib` + tag; quên → sky-app kéo bản cũ (giảm rủi ro bằng git **tag** cố định thay vì `#main`).
- **B (bỏ):** không commit binary, luôn khớp source. Đổi lại: mọi máy/CI cài sky-app phải cài ~583MB devDeps device-layout để chạy `vite build` lúc install — phản đúng mục tiêu "sky-app không quan tâm device-layout".

**Đã làm:**
- **device-layout** (`~/PROJECTS/device-layout`, repo riêng): bỏ `/dist-lib/` khỏi `.gitignore`, `pnpm build:lib`, commit `dist-lib/` (202 file, 1.8MB) + `.gitignore`, tạo tag `v0.1.0`, push commit + tag lên `github.com/sonth87/device-layout`.
- **sky-app**: đổi **4** `package.json` (không phải 3 — `modules/ceremony` cũng khai trực tiếp, ban đầu bị sót) từ `file:../../.vendor/*.tgz` → `github:sonth87/device-layout#v0.1.0`. Xóa `pnpm-lock.yaml` + `node_modules` cài lại sạch (install incremental để lẫn cả tarball cũ lẫn git-dep trong lockfile — phải cài từ đầu để lockfile chỉ còn git-dep). Repo device-layout là **public** nên `github:` shorthand resolve qua HTTPS không cần token.
- Dọn: xóa `scripts/vendor-device-layout.sh`, `.vendor/` (tgz + README), dòng `.vendor/*.tgz` trong `.gitignore`. Cập nhật `docs/dev/tooling.md` + `docs/architecture/overview.md` §6.

**Quy trình cập nhật device-layout từ nay** (làm ở repo device-layout): sửa source → `pnpm build:lib` → commit cả `dist-lib/` → tag mới → push tag. Ở sky-app: đổi số tag trong 4 `package.json` + `pnpm install`.

**Kết quả verify:** `pnpm install` sạch (lockfile 0 dòng tarball, chỉ git-dep `codeload.github.com/.../f48a07c`), `dist-lib/index.js`+`style.css` link đúng vào cả shell-electron/shell-web. `pnpm -r run typecheck` sạch 15/15. `pnpm -r run build` sạch (chunk device-layout bundle đúng vào 2 shell). `pnpm -r run test` toàn bộ pass (bao gồm device-shell 11 test render device-layout thật).

**Liên quan:** [2026-07-14 — Đánh giá lại (đã bị thay thế)](./2026-07-14-danh-gia-device-layout-git-dependency.md), [2026-07-11 — Giai đoạn 2: device-layout thành lib](./2026-07-11-giai-doan-2-device-layout-lib.md), `docs/dev/tooling.md`, `docs/architecture/overview.md` §6.
