# 2026-07-30 — "Dùng dữ liệu mẫu" thành công tắc bật/tắt, không xoá DB

## Quyết định

Menu Develop > "Dùng dữ liệu mẫu" trước đây chỉ tạo 1 lần (bấm lại báo "đã có sẵn"). Theo phản
hồi thật, đổi thành **công tắc bật/tắt** — dữ liệu mẫu chỉ để xem thử app hoạt động ra sao khi có
data, cần ẩn/hiện được:

- **Tắt** KHÔNG xoá Event/DataSource mẫu khỏi DB. Đã khảo sát kỹ: `EventPort`/`DataSourcePort`
  chưa có `delete()` nào — không có sẵn ở `ceremony-db`, Electron IPC (`electron/ipc.ts`), lẫn
  REST của `apps/data-service` (web). Thêm delete() đầy đủ 2 nền tảng là việc LỚN hơn nhiều giá
  trị tính năng này (schema FK `event.data_source_id` cũng thiếu `ON DELETE CASCADE`, cần thêm
  migration nếu làm thật). Chọn giải pháp nhẹ: 1 cờ `sampleDataEnabled` (localStorage, xem
  `eventStore.ts`) chỉ ẨN dòng Event mẫu khỏi `EventGate.tsx`'s danh sách — bật lại hiện NGUYÊN
  data cũ, không tạo lại (trừ lần bật đầu tiên, lúc Event/DataSource thật sự chưa tồn tại).
- Đang xem chính Event mẫu (`ControlApp.tsx`'s dashboard) mà tắt → tự `exitToGate()` (chỉ điều
  hướng UI cục bộ, không đổi status DB — giống nút X sẵn có).
- `EventGate.tsx`: Event mẫu ẩn nút "Sửa" (không phải Event thật cần cấu hình), nút kích hoạt đổi
  nhãn "Kích hoạt" → "Xem", và không hiện Badge trạng thái (draft/active/...) — tất cả nhấn mạnh
  đây chỉ là xem thử, không phải vận hành thật.

## Dấu check trên menu — cần sửa `@sonth87/device-layout` (repo ngoài sky-app)

Yêu cầu thêm: menu item "Dùng dữ liệu mẫu" hiện dấu check khi đang bật. Khảo sát phát hiện
`menuBarMenus` (device-layout's `MenuBar.tsx`) đã đọc **reactive** từ store (`useStore((s) =>
s.apps)`) — không phải mảng tĩnh không thể đổi như tưởng ban đầu (comment cũ ở
`modules/ceremony/src/index.ts`/`ControlApp.tsx` nói sai lý do: "không hỗ trợ đổi label theo state
runtime" — thực ra CHỈ thiếu 1 store action để patch lại `apps[id]` sau `registerApps()`, cơ chế
reactive đã có sẵn). 2 việc thật sự thiếu, cả hai đã tự sửa ở repo `device-layout` riêng
(`/Users/skyline/PROJECTS/device-layout`, KHÔNG nằm trong sky-app):

- `AppSlice.updateAppConfig(appId, patch)` (`src/store/app-slice.ts`) — patch 1 field bất kỳ của
  `AppConfig` đã đăng ký, dùng lại được cho bất kỳ config động nào khác sau này (không chỉ menu).
- `MenuBarItem.checked?: boolean` (`src/types/app.ts`) + render dấu check trong `MenuItem`/
  `MenuItemRow` (`src/components/menubar/MenuItems.tsx`).

Đã tag+push `v0.5.3`, cập nhật pin ở `pnpm-workspace.yaml` (`catalog:`). `packages/kernel/src/
app-module.ts`'s `AppMenuBarItem` (bản structural-typing riêng, cố tình không import type từ
device-layout — xem comment tại chỗ) thêm field `checked` khớp để không mất khi qua
`toDeviceAppConfig()` (`packages/device-shell`).

`modules/ceremony/src/menuBarMenus.ts` (file MỚI) — tách `buildCeremonyMenuBarMenus(sampleDataEnabled)`
khỏi `index.ts` để tránh circular import (`index.ts` export lại `ControlApp.js`, nên `ControlApp.tsx`
không thể import ngược `index.ts` để lấy hàm build menu lúc cần patch lại `checked` runtime).
`ControlApp.tsx` gọi `updateAppConfig` trong 1 `useEffect` mỗi khi `sampleDataEnabled` đổi.

## Quy trình sửa 1 dependency git ngoài repo, KHÔNG kéo theo WIP khác

`device-layout` đang có sẵn việc dở khác chưa commit (Taskbar.tsx, AppleMenuDropdown.tsx,
CustomOSIconContext.tsx — tính năng custom Apple-menu icon, không liên quan). Quy trình đã dùng để
publish CHỈ phần của mình, không đụng WIP người khác:

1. `git stash push -u -- <chỉ các file KHÔNG liên quan>` (giữ 3 file mình sửa + `dist-lib` cũ trên
   working tree).
2. `rm -rf dist-lib && npm run build:lib` — build lại SẠCH, chỉ phản ánh 3 file của mình (vì source
   không liên quan đã bị stash khỏi đĩa).
3. Commit CHỈ 3 file nguồn + `package.json` (version) + `dist-lib` mới build.
4. `npm run tag` (script sẵn có ở device-layout, tự build lại + tag annotated + `git push origin
   <tag>` — CHỈ push tag, không push nhánh `main`, đúng quy ước sẵn có của repo đó).
5. `git stash pop` — khôi phục WIP người khác nguyên trạng, không conflict (vì bước 3 không đụng gì
   tới các file đó).

Bài học: **KHÔNG** stash `dist-lib` cùng lúc với source cần giữ lại — `dist-lib` là output build
nội dung thay đổi liên tục theo hash tên file, stash rồi pop lại dễ conflict vô nghĩa với bản mới
build. Chỉ stash SOURCE không liên quan, để `dist-lib` tự rebuild sạch từ tree đã lọc.

## Đã kiểm chứng

`device-layout`: `build:lib` sạch, `tsc --noEmit` sạch (trừ 1 lỗi vitest-types có sẵn, không liên
quan). `sky-app`: `pnpm typecheck` 35/35 sạch (sau khi cập nhật pin `v0.5.3`), `module-ceremony`
test 73/73, `dev:app` boot sạch + HMR không lỗi qua nhiều lần sửa.

**Chưa kiểm chứng bằng mắt:** bấm menu Develop > "Dùng dữ liệu mẫu" bật/tắt thật trong GUI (dấu
check xuất hiện/biến mất đúng lúc), Event mẫu ẩn/hiện đúng trong danh sách Gate, tự thoát ra Gate
khi tắt lúc đang xem Event mẫu, nút "Xem"/ẩn "Sửa"/ẩn Badge trạng thái hiển thị đúng cho riêng dòng
Event mẫu.
