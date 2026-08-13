# 2026-07-29 — Màu tag cho Event + ModeSwitch theo màu theme ceremony

## Bối cảnh

Phản hồi thật từ Sonth: cần phân biệt nhanh các Event trong danh sách (giống cách
`LayoutDocument` đã có màu tag từ PHỤ LỤC "Event Hub", 2026-07-22), và nút Auto/Manual
(`ModeSwitch.tsx`) phải theo đúng màu giao diện ceremony đang chọn thay vì màu cố định.

## Quyết định 1 — `EventDocument.color`, tách biệt hoàn toàn khỏi màu layout

Thêm `color?: string` vào `EventDocument` (`packages/slide-shared/src/layout/event.ts`) +
migration `011_event_color.ts` (`ALTER TABLE event ADD COLUMN color TEXT`, nullable, không
DEFAULT — Event cũ chưa có màu vẫn hợp lệ). Đây là màu của CHÍNH Event, không liên quan gì tới
`LayoutDocument.color` (màu của layout đang gán cho Event) — 2 khái niệm độc lập, cùng tồn tại
song song trong `EventGate.tsx` (chấm màu Event cạnh tên, badge màu layout cạnh nút "Chọn
layout" — đã có từ trước).

Không cần thêm method mới vào `EventPort` — khác `LayoutPort` (cần `updateDocumentMeta` riêng vì
API layout là publish/draft, không có "lưu nguyên document" chung) — `EventPort.save(doc)` đã ghi
NGUYÊN `EventDocument`, `color` tự động đi qua khi thêm vào interface + cột SQL + row-mapping
(`queries/event.ts`).

UI chọn màu: `EventColorPicker.tsx` (`modules/ceremony/src/control/components/`) — component
MỚI, KHÔNG import `ColorTagPicker` từ `module-layout-designer` (vi phạm "không import chéo giữa
app", AGENTS.md §2.5) — viết lại tương đương, cùng bảng 8 màu cố định để nhất quán cảm giác "tag
màu" trong toàn app. Đặt trong view `'info'` của `EventHubModal.tsx` (view sửa tên/ngày thêm hôm
qua) — cùng chỗ, không tạo màn riêng.

## Quyết định 2 — ModeSwitch dùng `--primary` thay `--info`

Khảo sát `modules/ceremony/src/styles.css`: `--info` chỉ khai trong `:root`/`.dark` (2 khối), KHÔNG
xuất hiện trong bất kỳ khối nào trong số 42 khối `[data-theme="..."]` (mỗi palette 1 khối) — nghĩa
là `--info` LUÔN LÀ 1 MÀU XANH CỐ ĐỊNH bất kể palette nào đang chọn ở Cài đặt giao diện. `--primary`
ngược lại được override theo từng palette. `ModeSwitch.tsx`'s nút Auto/Manual đổi
`bg-info text-info-foreground` → `bg-primary text-primary-foreground`.

## Đã kiểm chứng

- `pnpm typecheck` — 33/33 sạch.
- `pnpm --filter @sky-app/ceremony-db test` — 59/59 (thêm 1 test round-trip `color` qua
  `createEvent`/`saveEvent`/xoá màu).
- `pnpm --filter @sky-app/module-ceremony test` — 73/73, không hồi quy.
- `dev:app` khởi động sạch, migration 011 áp dụng đúng lên DB thật đã có sẵn trên máy (không phải
  DB mới toanh) — xác nhận không lỗi ALTER TABLE trên dữ liệu cũ.
- `electron-vite build` (production) sạch.

**Sự cố môi trường gặp phải lúc verify (không phải bug code, ghi lại cho lần sau):** chạy tay
`npm run db:rebuild:node` (bỏ qua wrapper `scripts/ensure-db-addon.js`) làm lệch file đánh dấu
`node_modules/.better-sqlite3-target` (vẫn ghi "electron" dù binary thật đã bị build lại cho
Node) — lần `dev:app` kế tiếp thấy marker khớp "electron" nên bỏ qua rebuild, chạy nhầm binary
ABI Node trong Electron → `ERR_DLOPEN_FAILED`. Sửa bằng chạy `pnpm db:rebuild:electron` (đúng cơ
chế `@electron/rebuild` qua `electron-builder install-app-deps`) rồi đồng bộ lại marker. Bài học:
**luôn dùng `node scripts/ensure-db-addon.js <node|electron>` (hoặc `npm run test`/`npm run
dev:app` — đã tự gọi đúng script), KHÔNG gọi thẳng `db:rebuild:node`/`db:rebuild:electron` khi
target hiện tại chưa rõ**, vì 2 script `db:rebuild:*` không tự cập nhật marker.

**Chưa kiểm chứng bằng mắt:** chọn màu Event qua `EventColorPicker`, chấm màu hiện đúng ở
`EventGate.tsx`, nút Auto/Manual đổi màu đúng khi đổi palette trong Cài đặt.
