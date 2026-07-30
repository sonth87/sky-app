# 2026-07-28 — Nối backdrop trao giải + màn chờ sang LayoutRenderer thật

**Quyết định:** `BackdropApp.tsx` (`modules/ceremony/src/backdrop/`) giờ đọc Event đang active
(`kernel:event:getCurrentActive` + lắng nghe `state:activeEventChanged`), dùng `resolveLayout` +
hàm mới `applyFieldMap` (`packages/slide-shared/src/layout/apply-field-map.ts`) + `eventToIdleRecord`
để render qua `LayoutRenderer` (hệ layout-designer) thay vì `BackdropView`/`DynamicBackdropView`
(hệ cũ) — cho cả layout trao giải (người đang lên sân khấu) lẫn màn chờ.

Đây là giai đoạn đã được ghi nhận nhưng cố tình hoãn từ 2026-07-22 (xem phụ lục "giữ BackdropView
tạm, hoãn LayoutRenderer" trong plan `layout-designer + Event`, lúc đó đang làm dở việc lớn hơn
"bỏ Student"). Kế hoạch triển khai chi tiết ở
`~/.claude/plans/starry-fluttering-unicorn.md` (máy dev, không nằm trong repo).

**Lý do các quyết định chính:**
- **Fallback đối xứng award/idle**: Event/vai trò nào chưa cấu hình layout mới (không có award
  ref nào, hoặc `resolveLayout()` trả `null`; hoặc không có `idleLayoutRef`) → giữ nguyên
  `BackdropView` cũ cho ĐÚNG vai trò đó, không phải màn đen — an toàn khi hành lễ, không breaking
  ceremony/Event đã tồn tại trước khi có thay đổi này.
- **Không xoá `BackdropView`/`DynamicBackdropView`/`canonicalToStudent`** — vẫn cần làm fallback
  ở trên. Để dành 1 đợt dọn dẹp riêng sau khi hệ mới chạy ổn định thật qua ít nhất 1 lễ.
- **`window.sky.invoke(...)` gọi thẳng (không qua PlatformContext/port)** cho 2 lời gọi mới —
  `BackdropApp.tsx` vốn không có `PlatformContext` nào (khác `control/`), và 100% lời gọi IPC
  hiện có của file này đều theo quy ước này (socket, `window.slide.*`) — sửa riêng 2 lời gọi mới
  trong khi để nguyên phần còn lại là nửa vời. Đã thêm type tối thiểu cho `window.sky` vào
  `modules/ceremony/src/global.d.ts` (không import từ `@sky-app/platform-electron` để tránh
  module phụ thuộc ngược 1 package adapter cụ thể). Ghi nhận đây là nợ kiến trúc đã tồn tại từ
  trước, không phải phát sinh mới — dọn cùng đợt xoá `BackdropView` sau này.
- **`applyFieldMap` không xử lý field-per-member của `LoopItem`** — chỉ áp vào `extra` cấp
  `CanonicalGroup` cha, trong khi `LoopItemView` đọc field từng `member` trực tiếp (không qua
  `extra` nhóm cha). Token trong `itemTemplate` của LoopItem vì vậy chưa được map qua fieldMap —
  giới hạn đã biết, không mở rộng phạm vi ở đợt này.

**Đã kiểm chứng:**
- `pnpm --filter @sky-app/slide-shared test` — 6 test mới cho `applyFieldMap` + 112/112 tổng.
- `pnpm typecheck` — 33/33 package sạch.
- `pnpm --filter @sky-app/module-ceremony test` — 73/73 pass, không hồi quy.
- `dev:app` khởi động thật sạch (SocketServer port 8765, TTS engine warm-up đủ giọng, không lỗi
  ABI/IPC/module resolve).
- `apps/shell-electron`: `electron-vite build` (production, main+preload+renderer bao gồm
  `backdrop.html`) sạch — xác nhận bundle thật qua esbuild/rollup, không chỉ typecheck.

**CHƯA kiểm chứng — cần Sonth tự tay xác nhận trên máy có màn hình thật** (agent không thao tác
chuột/xem GUI được): Event có layout theo điều kiện + Mặc định hiện đúng khi trao giải; Event có
màn chờ hiện đúng token; Event KHÔNG cấu hình layout vẫn fallback đúng về hệ cũ; đổi Event active
giữa chừng chuyển cảnh mượt (key `AnimatePresence` đã gộp `layoutId`).

**Liên quan:** `docs/roadmap/plans/layout-designer/13-ceremony-mo-rong.md`,
`~/.claude/plans/lazy-tinkering-goblet.md` (phụ lục "giữ BackdropView tạm", dòng ~345-389).
