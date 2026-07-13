---
status: in_progress
owner: sonth87
created: 2026-07-12
target_version: chưa gán (chờ xếp lịch sau GĐ7.5)
supersedes: null
implemented_doc: null
---

# Kế hoạch: Chiến lược cập nhật OTA (Web + Electron)

> **Trạng thái: In progress.** Phase A (electron-builder), Phase B (renderer OTA — Loại 1a) và Phase C (electron-updater + GitHub Releases — Loại 2a) đã code xong và verify được (Phase A/B full end-to-end bằng local build + local static server; Phase C chỉ verify build/typecheck, chưa test full flow vì chưa có GitHub repo thật — xem "Việc còn mở" cập nhật bên dưới). Chưa `done` vì còn phụ thuộc infra thật (GitHub repo, hosting cho renderer bundle) trước khi coi là hoàn tất. Khi đó, cập nhật `status: done`, viết tài liệu chính thức vào `docs/architecture/` hoặc `docs/guides/`, trỏ `implemented_doc` về đó.
>
> Chi tiết implementation: `docs/dev/versioning.md`'s mục "OTA Update (GĐ8)" (quy tắc quyết định Loại 1 vs Loại 2), `apps/shell-electron/electron/slide/renderer-updater.ts`, `apps/shell-electron/electron/update-checker.ts`, `apps/shell-electron/electron-builder.yml`.

## 1. Mô tả & mong muốn của user (nguyên văn/paraphrase từ hội thoại)

> "tôi vừa có 1 vấn đề cần hỏi liên quan đến đồng bộ giữa web và app (electron) ví dụ tôi có thêm tính năng mới, hoặc fix bug thì để deliver nhanh cho cả web và app thì phải làm thế nào? để app không phải build lại và tải lại hay gửi lại cho user."

Làm rõ thêm qua trao đổi:
- Phạm vi thay đổi không cố định — có đợt chỉ sửa UI/renderer, có đợt phải đụng cả main process Electron: **"cả 2, tùy từng đợt release"**.
- Quy trình hiện tại: **"hiện tại tôi phải chạy build tay, xong mới gửi lại cho user để chạy, khá là phiền phức, mỗi lần cần sửa gì là lặp lại các bước như vậy"**.
- Về hạ tầng: **"muốn nghiên cứu các thức triển khai trước, 1 vài option để đánh giá và chọn giải pháp phù hợp, cả có phí lẫn miễn phí, cả tự động lẫn thủ công"**.
- Điểm quan trọng nhất định hướng giải pháp: **"thủ công có thể theo kiểu gói update chứ không phải là gửi cho user bản cài mới, trừ khi phải cập nhật cả shell"** — user đã tự phân biệt sẵn 2 loại thay đổi (nội dung/app-package thường xuyên vs. shell/installer hiếm khi), muốn tối ưu cho loại phổ biến hơn (nội dung) mà không cần cài lại toàn bộ.

## 2. Hỏi đáp đã trao đổi (Q&A)

**Q1 — Phạm vi thay đổi chủ yếu nằm ở đâu?**
Lựa chọn đưa ra: (a) chỉ UI/renderer, (b) cả main process/native, (c) cả 2 tùy đợt.
→ User chọn **(c) cả 2, tùy từng đợt release**.

**Q2 — Điều kiện mạng khi app chạy thật (ảnh hưởng tính khả thi của "tải bản mới khi mở app")?**
→ Không trả lời trực tiếp câu hỏi trắc nghiệm, mà làm rõ luôn vấn đề gốc: quy trình hiện tại là build tay + gửi lại toàn bộ cho user — đây mới là nỗi đau chính, không phải vấn đề mạng lúc chạy buổi lễ.

**Q3 — Sẵn sàng dùng hạ tầng ký số + server phát hành (GitHub Releases/S3) hay muốn tối giản?**
→ User: muốn **khảo sát nhiều phương án trước** (có phí lẫn miễn phí, tự động lẫn thủ công), chưa chốt ngay; đồng thời làm rõ định nghĩa "thủ công" mong muốn = gói cập nhật nội dung (không phải gửi lại installer), trừ khi bắt buộc phải đổi shell.

## 3. Kết quả research — hiện trạng hệ thống (đã khảo sát trực tiếp qua Explore agent)

### 3.1 Build/release hiện tại — không có công cụ đóng gói

- `apps/shell-electron/package.json` chỉ có 3 script: `dev` (`electron-vite dev`), `build` (`electron-vite build`), `typecheck`. **Không có** script `dist`/`package`/`make`.
- Không tồn tại `electron-builder.yml/json`, `forge.config.js`, hay field `"build"` trong bất kỳ `package.json` nào trong repo.
- `electron-builder`/`electron-forge`/`electron-packager` — không phải dependency ở đâu cả.
- `electron-vite build` (`apps/shell-electron/electron.vite.config.ts`) chỉ build ra bundle JS/CSS thô (`dist-electron/main`, `dist-electron/preload`, `dist`) — **không phải installer** (.dmg/.exe/.AppImage). Việc "build tay + gửi file cài đặt" user mô tả nằm ngoài phạm vi tooling hiện có trong repo.
- **Auto-update: không có gì được cấu hình** — không `electron-updater`, không `update-electron-app`, không logic tự viết kiểm tra version.
- **Code signing: không có.**

### 3.2 Cách renderer được load — quyết định độ khó của giải pháp renderer-only

`apps/shell-electron/electron/main.ts:98-102`:
```ts
if (process.env.ELECTRON_RENDERER_URL) {
  mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
} else {
  mainWindow.loadFile(join(__dirname, '../../dist/index.html'));
}
```
- Production luôn `loadFile` từ `dist/index.html` **nhúng cứng trong app đã đóng gói**. `ELECTRON_RENDERER_URL` chỉ tồn tại lúc `electron-vite dev`.
- Kết luận: hiện tại renderer **không có cơ chế tải bản mới từ xa** — đổi UI/logic renderer bắt buộc build lại `dist` + đóng gói lại app, đúng như user mô tả.

### 3.3 Main process — gắn chặt native, không thể "deliver qua web"

Main process bootstrap trong `app.whenReady()`: socket server local (port 8765), HTTP server local (port 8080), Python TTS server (binary đóng gói theo app, xem `apps/tts-service`), custom protocol `ceremony-asset://`/`sky-wallpaper://`. Đây là code Node + native chạy trong runtime đã cài trên máy user — **không thể** tải qua mạng như renderer JS. Mọi thay đổi main process (IPC mới, quyền mới, binary TTS mới) bắt buộc phải đóng gói lại + cài lại.

### 3.4 shell-web hiện chưa dùng chung bundle với Electron

- `apps/shell-web/package.json` chỉ có dependency `@sky-app/module-mock-app`, **không có** `@sky-app/module-ceremony`.
- Chỉ `apps/shell-electron/src/main.tsx` (và `backdrop-main.tsx`) mount `ceremonyModule`.
- Nghĩa là: ý tưởng "1 CDN serve chung bundle cho cả web lẫn Electron `loadURL`" **chưa có nền tảng sẵn** cho phần ceremony — muốn làm phải wire ceremony vào shell-web trước, và cần backend thật cho các port web-adapter (`TtsPort`, `DataPort`...) theo bảng tại `docs/architecture/web-vs-electron.md` — hiện các backend đó chưa xác nhận đã deploy.

### 3.5 Không có Service Worker / PWA

Không có `vite-plugin-pwa`, không `manifest.json`, không cấu hình cache nào ở `apps/shell-web`.

### 3.6 Không có CI/CD

Không có thư mục `.github/workflows`. `turbo.json` chỉ có 5 task chuẩn (`build`, `dev`, `typecheck`, `test`, `lint`), không có `release`/`publish`/`package`. Có `@changesets/cli` nhưng quy trình (`docs/dev/versioning.md`) chỉ dừng ở bump version + CHANGELOG, không đụng tới build/sign/upload installer.

### 3.7 Kích thước bundle renderer (đo trực tiếp trên `apps/shell-electron/dist` đã build)

Tổng `dist` = 14MB, `dist-electron` (main+preload) = 204KB.

| Thành phần | Kích thước |
|---|---|
| `assets/index-*.js` (bundle chính) | 1.5MB |
| `assets/styles-*.js` | 1.3MB |
| CSS (2 file) | 204K + 104K |
| Code-split chunks nhỏ | ~50K |
| Font Montserrat (7 file .otf) | ~1.6MB |
| Wallpaper mẫu (10 ảnh) | ~9MB |

→ **Phần JS+CSS thực sự hay đổi khi sửa bug/feature chỉ ~3.1MB**; 9MB còn lại là asset tĩnh (wallpaper mẫu) hiếm khi đổi — nếu tách riêng, phần cần tải lại mỗi lần update nhỏ, khả thi kể cả mạng yếu (bối cảnh: app chạy tại chỗ trong buổi lễ tốt nghiệp, mạng trường học không đảm bảo).

Dependency renderer khá "rich" nhưng không bất thường: `framer-motion`, `@tanstack/react-virtual`, `radix-ui`, `i18next`, `socket.io-client`, `zustand`, `canvas-confetti`, `sonner`, `lucide-react` (`modules/ceremony/package.json`). Các package nền tảng (`kernel`, `service-contracts`, `slide-shared`, `licensing`, `platform-electron`, `platform-web`) gọn nhẹ, build bằng `tsc` thuần.

## 4. Phân loại vấn đề — 2 loại thay đổi cần chiến lược khác nhau

| Loại | Ví dụ thay đổi | Có thể update mà không cài lại? |
|---|---|---|
| **Loại 1 — Renderer/UI** | `modules/ceremony` (React, style, business logic thuần JS/TS không đụng Node) | **Có** — chỉ cần `BrowserWindow` load HTML/JS khác |
| **Loại 2 — Main process/native** | `apps/shell-electron/electron/*`, IPC mới, quyền OS mới, binary TTS Python mới | **Không** — code Node chạy trong runtime đã cài, bắt buộc cài lại |

## 5. Các phương án đã khảo sát

### 5.1 Cho Loại 1 (renderer) — không cần cài lại

| # | Phương án | Chi phí | Độ phức tạp | Đánh giá |
|---|---|---|---|---|
| 1a | **Electron tự kiểm tra + tải bundle renderer mới từ server khi mở app**, giữ `loadFile` cục bộ làm fallback offline (check version → tải `dist.zip` mới về `userData` nếu có mạng → giải nén → `loadFile` từ bản mới) | Miễn phí (GitHub Releases/Cloudflare Pages/S3 static host) | Trung bình — tự viết ~100-200 dòng version-check + download + swap | **Khớp nhất** với yêu cầu "gói update" của user; giữ offline-first vì bản cũ vẫn chạy nếu không có mạng |
| 1b | Dùng chung engine `electron-updater` nhưng chỉ publish bản vá renderer (kiểu ASAR patch) | Miễn phí/rẻ | Cao hơn 1a dù chỉ đổi renderer | Không tận dụng lợi thế nhẹ/nhanh của renderer-only, phải qua toàn bộ pipeline update như installer |
| 1c | Đổi `loadFile` → `loadURL` trỏ thẳng vào 1 web server luôn chạy | Cần server thật (~$5/tháng VPS, hoặc Vercel/Cloudflare Pages miễn phí) | Thấp nhất | **Mất offline-first** — mạng rớt giữa buổi lễ = app trắng trang; rủi ro cao cho use-case ceremony tại chỗ |

### 5.2 Cho Loại 2 (main process/native) — bắt buộc cài lại, nhưng có thể tự động hóa việc cài

| # | Phương án | Chi phí | Độ phức tạp | Đánh giá |
|---|---|---|---|---|
| 2a | **electron-updater + GitHub Releases** (chuẩn công nghiệp) | Miễn phí (GitHub Releases); code signing có phí nếu muốn hết cảnh báo OS — Windows cert ~$100-400/năm, Apple Developer $99/năm | Trung bình — thêm `electron-builder` config + publish step | Chuẩn, nhiều tài liệu, nhưng cần đầu tư signing để trải nghiệm cài đặt mượt |
| 2b | **electron-updater + tự host** (S3/Cloudflare R2) | R2 gần miễn phí (egress free) | Tương tự 2a + tự vận hành endpoint | Kiểm soát hoàn toàn, không phụ thuộc GitHub, vẫn cần signing riêng |
| 2c | **Thủ công có tổ chức**: chỉ tự động hóa bước build (`electron-builder` config, 1 lệnh ra installer ký sẵn hoặc chưa ký), KHÔNG auto-update — gửi link tải cho user tự cài đè | Miễn phí | Thấp — chỉ cần thêm `electron-builder` config | Chưa giải quyết "không phải gửi lại cho user", nhưng giảm mạnh công sức build tay hiện tại; bước đệm hợp lý trước khi đầu tư 2a/2b |

## 6. Hướng kết hợp được đề xuất (chưa chốt, chờ quyết định khi triển khai)

1. **Bước nền tảng bắt buộc dù chọn hướng nào**: thêm `electron-builder` (phương án 2c) để việc tạo installer không còn nhiều bước build tay — đây là điều kiện cần cho mọi phương án khác.
2. **Cho các đợt chỉ sửa renderer** (dự kiến chiếm đa số — God component ở `modules/ceremony`, TTS settings, confetti... đều là renderer theo khảo sát GĐ7.5): áp dụng **1a** (renderer self-update, giữ offline fallback).
3. **Cho các đợt đụng main process/IPC/binary TTS**: phát hành qua **2a hoặc 2b** (electron-updater) khi đã sẵn sàng đầu tư signing, hoặc tạm dùng **2c** (thủ công nhưng nhanh hơn hiện tại) nếu chưa muốn đầu tư ngay.

## 7. Quyết định đã chốt (2026-07-13) và việc còn mở

**Đã chốt, đã implement:**
- Renderer update: **1a** (renderer self-update, offline-first). Implement: `electron/slide/renderer-updater.ts`, `electron/slide/env.ts`, `scripts/build-renderer-bundle.mjs`. Verify end-to-end bằng local static server (tải, checksum verify, extract, swap, fallback offline, fallback checksum sai — tất cả PASS).
- Hạ tầng Loại 2: **2a** (GitHub Releases + electron-updater). Implement: `electron/update-checker.ts`, `publish` config trong `electron-builder.yml` (owner/repo còn placeholder). Build local verify OK (`app-update.yml` đóng gói đúng vào `Resources/`); **chưa test full flow thật** — cần GitHub repo thật (xem dưới).
- Code signing: **chưa đầu tư** — chấp nhận cảnh báo "unknown publisher". Hệ quả xác nhận khi implement: **electron-updater trên macOS không hoạt động đáng tin cậy nếu không ký code** (giới hạn Squirrel.Mac, không phải bug) — macOS dùng phân phối thủ công (2c, `.dmg` unsigned) cho Loại 2 cho tới khi đầu tư Apple Developer cert. Windows (NSIS) hoạt động được không cần ký.
- Bước nền tảng electron-builder: xong, `pnpm dist`/`dist:mac`/`dist:win` chạy được, verify ra `.dmg` hợp lệ.

**Còn mở, cần làm khi có điều kiện:**
- Điền `owner`/`repo` thật vào `electron-builder.yml`'s `publish` khi có GitHub repo — hiện là `PLACEHOLDER_OWNER`/`PLACEHOLDER_REPO`.
- Test full flow electron-updater thật (`electron-builder --publish always` cần `GH_TOKEN`, cài bản cũ hơn, xác nhận tự phát hiện+tải+cài khi quit) — chưa làm được vì thiếu repo/token thật.
- Chọn hosting tĩnh cho renderer bundle (`manifest.json` + zip) — GitHub Releases/S3/Cloudflare Pages, chưa chốt cụ thể; `scripts/build-renderer-bundle.mjs` sinh output local, upload là bước thủ công riêng.
- `apps/shell-electron/resources/` (TTS binary + voice data cho `extraResources`) chưa tồn tại — `pnpm dist` ra installer chạy được nhưng TTS không hoạt động đầy đủ; build `apps/tts-service` thật là việc riêng.
- Có kế hoạch wire `module-ceremony` vào `shell-web` không — không chặn GĐ8 (1a chỉ target Electron renderer) nhưng ảnh hưởng khả năng dùng chung pipeline deliver cho 2 target trong tương lai.

## 8. Khi triển khai xong

Cập nhật `status` ở front-matter thành `done`, điền `target_version` thực tế, và tạo tài liệu chính thức tương ứng ở `docs/architecture/` (thiết kế cơ chế update) và/hoặc `docs/guides/` (hướng dẫn phát hành 1 bản update) — trỏ `implemented_doc` về đó.
