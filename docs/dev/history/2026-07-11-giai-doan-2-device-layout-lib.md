# 2026-07-11 — Giai đoạn 2: device-layout thành lib + device-shell nối kernel, verify xanh

**Quyết định:** Refactor repo `device-layout` (riêng, `~/PROJECTS/device-layout`) để nó xuất bản một pipeline build **song song** với Next.js hiện có (giữ Next chạy y hệt), tạo `packages/device-shell` trong sky-app import bản build đó dạng dependency (tarball local, không submodule/copy source — đúng quyết định đã chốt).

**Thay đổi ở device-layout (2 commit: `7eee5b3` feat, `0f89f2f` fix):**
- `src/types/app.ts`: `AppConfig.component` chuyển thành optional, thêm `render?: ComponentType<AppContentProps>` — app ngoài truyền thẳng component, không cần đăng ký vào `APP_COMPONENTS` registry nội bộ. `AppContentProps` chuyển từ định nghĩa cục bộ trong `AppRegistry.tsx` sang nguồn chung ở `types/app.ts`.
- `AppRegistry.tsx`: `AppContent` ưu tiên `appConfig.render` nếu có, fallback logic cũ nếu không — additive, không phá app built-in (Finder/Terminal/...).
- `ThemeProvider.tsx`: nhận `apps?: AppConfig[]` qua prop, default `= APPS_CONFIG` — Next.js gọi `<ThemeProvider />` không tham số vẫn y hệt hành vi cũ; host lib truyền danh sách riêng.
- `src/lib/asset-base.ts` (mới): `AssetBaseProvider`/`useAssetBase`/`resolveAssetUrl` — cho phép override base URL wallpaper/icon, default `''` (giữ path tuyệt đối `/wallpapers/...` như Next hiện tại). Áp dụng ở `Wallpaper.tsx` + `LockScreen.tsx`.
- `Taskbar.tsx`: `next/image` → `<img>` (chỉ 28x28 icon, mất tối ưu không đáng kể) — cần thiết vì file này nằm trong lõi component mà lib import, `next/image` cần Next.js server không tồn tại trong Vite build.
- `src/lib.tsx` (mới): entry lib, export `<DeviceLayout>` (đổi tên public từ `ThemeProvider`) + types cần thiết. KHÔNG import gì từ `src/app/` — 2 pipeline hoàn toàn tách biệt.
- `vite.config.ts` (mới): `build.lib` → `dist-lib/` (ESM + `.d.ts` qua `vite-plugin-dts` + CSS qua `@tailwindcss/vite`). **`publicDir: false` bắt buộc** — mặc định Vite copy nguyên `public/` (wallpaper jpg + live-wallpaper mp4, hàng chục MB) vào output, phình gói từ 1.5MB lên 56MB; host tự cấp asset qua `assetBaseUrl`.
- `tsconfig.json`/`tsconfig.node.json`: loại `vite.config.ts` khỏi phạm vi typecheck Next (tránh Next `tsc` báo lỗi field lạ của config Vite — 2 pipeline, 2 tsconfig).

**Lỗi gặp khi dựng vite-plugin-dts:** dùng nhầm field cũ (`outDir` thay vì `outDirs`, và `rollupTypes` không tồn tại trong `unplugin-dts` v5 — API đổi giữa các major). Fix bằng cách đọc trực tiếp `.d.mts` của package đã cài thay vì đoán từ tài liệu/trí nhớ.

**Thay đổi ở sky-app:** `packages/device-shell` mới — `to-device-app-config.tsx` (bridge `AppModule` kernel → `AppConfig` device-layout, tiêm `platform: PlatformContext` vào component con qua closure vì `AppConfig.render` chỉ nhận `{appId, windowId}`), `SkyDeviceLayout.tsx` (component chính sky-app render). Cài `@sonth87/device-layout` qua `file:../../.vendor/*.tgz` — script `scripts/vendor-device-layout.sh` build + pack device-layout, `.vendor/*.tgz` gitignored (không commit binary từ repo khác).

**Bug nghiêm trọng phát hiện & fix: trùng phiên bản React.** `device-shell` test báo "Invalid hook call" — nguyên nhân: `kernel`/`mock-app` ghim `react@^19.2.4`, package khác resolve `19.2.7` mới nhất → 2 bundle React khác nhau cùng tồn tại trong `node_modules/.pnpm`, component từ bundle A gọi hook trong cây bundle B thì vỡ. Đây là bẫy kinh điển của monorepo dùng React làm peer dep — fix bằng `pnpm.overrides` ở root `package.json` ép toàn bộ workspace 1 version, cộng xóa sạch `node_modules`+lockfile cài lại (override không áp dụng cho resolution đã cache). Cũng phát hiện tôi ghi sai version cụ thể trong package.json vài chỗ (`@types/react-dom@^19.2.7` không tồn tại, bản thật `19.2.3`) — bài học: dù đã chọn "cài bản mới nhất" thay vì pin cứng, vẫn cần xác minh version ghi tay bằng `npm view <pkg> version` trước khi tin, không đoán số.

**Test bổ sung:** jsdom thiếu `ResizeObserver`/`window.matchMedia` (device-layout dùng thật ở `AppViewport`/`ThemeProvider`) → polyfill tối thiểu trong `vitest.setup.ts` của `device-shell`.

**Kết quả verify:** device-layout — `next build`/`next dev` không regression (HTTP 200), `pnpm build:lib` ra `dist-lib/` 1.5MB đầy đủ ESM+d.ts+CSS. sky-app — **10/10 turbo task xanh, 22/22 test pass** (14 kernel + 5 mock-app + 3 device-shell, trong đó có test render `mock-app` thật qua `SkyDeviceLayout` bằng `@testing-library/react` — chứng minh toàn bộ chuỗi kernel→device-shell→device-layout hoạt động end-to-end, không chỉ mock rời rạc).

**Còn thiếu ở GĐ2 (để GĐ3):** chưa có `apps/shell-electron`/`apps/shell-web` thật chạy `SkyDeviceLayout` trong Electron/browser thực — mới verify bằng jsdom test. Cơ chế publish device-layout vẫn là tarball thủ công (script), chưa CI/registry — theo đúng "quyết định còn mở" đã ghi ở lần trước.
