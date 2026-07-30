# 2026-07-29 — Dựng `packages/ui` dùng chung, dọn trùng lặp UI giữa các module

## Bối cảnh

Phản hồi từ Sonth khi thấy `EventColorPicker` (bảng 8 swatch tự viết cho `EventDocument.color`,
xem lịch sử ngay trước file này): `modules/layout-designer` đã có sẵn `@uiw/react-color-colorful`
— lẽ ra nên tái dùng thay vì viết trùng, và yêu cầu audit rộng hơn xem còn gì đang bị khai
báo/viết trùng ở nhiều module để gộp về 1 chỗ.

Đây **không phải việc phát sinh ngoài kế hoạch** — `docs/architecture/shared-vs-per-app.md` dòng
32 đã xếp "shadcn primitives, design tokens" vào nhóm `ui (shared)` từ đầu dự án, và
`docs/roadmap/plans/platform-architecture-ga1-7.md` dòng 64 đã quy hoạch `packages/ui/` — chỉ
chưa từng dựng. Có tiền lệ y hệt: `pnpm-workspace.yaml`'s `catalog:` (thêm 21/7 sau khi
`@sonth87/device-layout` bị pin version riêng ở 4 nơi).

## Phát hiện quan trọng — trùng lặp đã gây bug thật

`modules/tts-studio/src/components/ui/select.tsx` có 1 fix định vị popup thật (route qua
`usePortalContainer()` + `position="popper"` thay `"item-aligned"`, cần thiết vì
`.{app}-root` có `transform` — xem `docs/guides/app-css-theming.md` Rule 3), nhưng
`modules/ceremony`'s bản copy tay **không có fix này** (xác nhận qua `diff` trực tiếp). Đây đúng
là rủi ro "mỗi nơi dùng 1 bản khác nhau" mà Sonth lo ngại — đã XẢY RA rồi trước khi audit này.

## Đã làm

Package mới `packages/ui` (`@sky-app/ui`), theo khuôn `packages/voice-catalog-ui` (không bundler,
`tsc` thẳng ra `dist/`, `react`/`react-dom` peerDependency, `lucide-react` vừa devDep vừa
peerDep):

1. **`cn()`** — 3 bản gần như y hệt (ceremony/layout-designer/tts-studio) → 1 nguồn.
2. **`ButtonPrimitive`/`Slider`** — byte-identical giữa ceremony/tts-studio → chuyển nguyên trạng.
3. **`Select*`** — LẤY bản tts-studio (đã có fix). Vì `packages/*` không được phụ thuộc
   `modules/*` (không thể import thẳng `usePortalContainer` app-cụ-thể), `SelectContent` đổi
   thành nhận `container` qua PROP thay vì tự tra `PortalContainerContext` nội bộ — caller (mỗi
   module) tự truyền `container={usePortalContainer()}` của chính app đó. **Hệ quả: ceremony's
   2 chỗ dùng Select (`AppearanceSettingsContent.tsx`, `ImportDataPanel.tsx`) giờ NHẬN fix
   positioning lần đầu tiên** — trước đây không có, đây là thay đổi hành vi thật, không chỉ dọn code.
4. **`ColorSwatchPicker`** — gộp `ColorTagPicker` (layout-designer) + `EventColorPicker` (ceremony,
   viết hôm 29/7) — 1 bảng 8 màu cố định dùng chung, style bằng semantic token
   (`bg-popover`/`border-border`/...) thay vì hex hardcode. Đổi nhãn "Màu phân biệt" → "Màu" theo
   góp ý (rườm rà, không cần thiết).
5. **`useColorfulSync` + `ColorfulPicker` + `ColorfulSwatchPopover`** — layout-designer's
   `StopColorPicker.tsx`/`SwatchColorPopover.tsx` viết lại y hệt logic đồng bộ HSVA 2 lần NGAY
   TRONG chính module đó — rút thành 1 hook dùng chung cho cả 2, xuất qua package mới để module
   khác (VD ceremony) dùng lại được nếu cần full color picker sau này.
6. Xoá `@radix-ui/react-tooltip` khỏi `modules/ceremony/package.json` (dead dependency — không
   nơi nào import trực tiếp, toàn bộ tooltip đi qua `radix-ui` meta-package).
7. `pnpm-workspace.yaml`'s `catalog:` thêm `lucide-react` (pin version 1 chỗ, dùng ở 7
   package.json với version luôn khớp nhau). **KHÔNG** thêm `clsx`/`tailwind-merge` vào catalog —
   sau khi `cn()` gộp về `packages/ui`, 2 lib này chỉ còn được khai ở ĐÚNG 1 package.json
   (`packages/ui`), không còn gì để "tránh khai trùng" nữa.

## Bổ sung cùng ngày — đổi màu Event sang picker tự do + fix popover bị Modal cắt mất

Sau khi xong đợt gộp ở trên, Sonth phản hồi thêm 2 việc:

1. **Màn "Sửa thông tin sự kiện" vẫn dùng `ColorSwatchPicker` (bảng 8 màu cố định)** — ý ban đầu
   là dùng THẲNG `@uiw/react-color-colorful` (chọn màu tự do), không phải chỉ gộp code của 2 bảng
   swatch cố định lại. Thêm `ColorfulSwatchButton` (`packages/ui/src/ColorfulSwatchButton.tsx`) —
   nút tròn xem trước màu, bấm mở full Colorful picker (không alpha, khác `ColorfulPicker`/
   `ColorfulSwatchPopover` gốc vốn có kênh alpha cho gradient stop). `EventHubModal.tsx` đổi sang
   dùng component này. **`ColorSwatchPicker` (bảng cố định) GIỮ NGUYÊN cho layout-designer's màu
   tag** — đó là UX có từ trước, không phải thứ đang được yêu cầu đổi, chỉ đổi đúng chỗ Sonth chỉ
   ra.
2. **Bug thật phát hiện ngay sau khi đổi**: popover Colorful bị Modal's `overflow-hidden` (khung
   card bo góc, `Modal.tsx:83`) cắt mất phần dưới khi nút màu nằm gần đáy modal (đúng vị trí của
   nó trong màn Sửa Event). Fix: `ColorfulSwatchButton` thêm prop `container` optional — khi
   truyền vào (`usePortalContainer()` của app), popover `createPortal` ra ngoài Modal + tự định
   vị bằng toạ độ `fixed` đo từ nút bấm. Điểm cần cẩn thận: toạ độ phải tính TƯƠNG ĐỐI so với
   `container.getBoundingClientRect()`, không phải viewport thật — vì Ceremony có thể chạy trong
   "cửa sổ ảo" của device-layout (window kéo được tới bất kỳ đâu trên desktop giả lập), dùng thẳng
   toạ độ viewport sẽ định vị sai vị trí khi app không chạy standalone. Không truyền `container` →
   giữ hành vi cũ (absolute ngay dưới nút — đủ dùng ở layout-designer's GradientEditor, nơi không
   có overflow cha nào cắt).

**Bug thứ 2 phát hiện ngay sau đó (Sonth test thật): "picker nằm dưới modal"** — z-index. Toàn bộ
`Modal.tsx` + mọi primitive Radix trong `packages/ui/primitives` dùng CHUNG `z-50` (quy ước
shadcn — trong 1 stacking context, phần tử z-index BẰNG NHAU vẽ theo thứ tự DOM, không cần số
cao hơn). Popover portal của `ColorfulSwatchButton` copy nguyên z-index CŨ (`z-[9]`/`z-[10]`) từ
bản gốc không-portal (layout-designer, không cạnh tranh với Modal nào) — khi portal ra
`ceremony-root` (cùng nơi Modal cũng render), z-10 THUA z-50 của Modal, bị vẽ ĐẰNG SAU. Fix:
z-index của popover khi CÓ `container` (portal) bump lên `z-[60]`/`z-[61]` (cao hơn z-50), KHÔNG
đổi z-index khi không portal (giữ z-[9]/z-[10] gốc, đúng cho GradientEditor).

**Đã kiểm chứng lại:** typecheck 35/35 sạch, `module-ceremony` test 73/73, `electron-vite build`
sạch (2 vòng, sau cả portal fix lẫn z-index fix). Chưa xem lại bằng mắt vị trí + z-order popover
trong GUI thật.

## Bug thứ 3 — Sonth restart dev:app vẫn thấy y hệt lỗi cũ (nguyên nhân KHÔNG phải code)

Sau khi báo z-index đã fix, Sonth restart `dev:app` nhưng **vẫn thấy y hệt hiện tượng cũ**. Khảo
sát lại: `apps/shell-electron/electron.vite.config.ts` chỉ alias `@sky-app/module-ceremony` thẳng
vào source (`modules/ceremony/src/index.ts`) cho dev — lý do ghi rõ trong comment gốc: package
đó chưa có script `build --watch`, nên trước đây từng gặp y hệt vấn đề này (sửa source không tự
phản ánh). **`@sky-app/ui` (package MỚI, cũng chưa có `build --watch`) KHÔNG được alias tương
tự** — Vite resolve nó qua `package.json`'s `"main"` (`dist/index.js`), và Vite's dependency
pre-bundle cache (`node_modules/.vite/deps`) **không tự phát hiện `dist/` vừa build lại** giữa
các lần restart `dev:app` — mọi lần tôi sửa `packages/ui/src` + `pnpm --filter @sky-app/ui build`
xong, `dev:app` vẫn âm thầm phục vụ bản CŨ từ cache, kể cả sau khi restart hẳn tiến trình
electron-vite (restart không tự xoá `node_modules/.vite`).

**Fix tận gốc:** thêm alias `@sky-app/ui` → `packages/ui/src/index.ts` y hệt cách đã làm cho
`module-ceremony` (`electron.vite.config.ts`'s `resolve.alias`, chỉ áp dụng dev, KHÔNG ảnh hưởng
production build). Từ giờ sửa `packages/ui/src` sẽ HMR trực tiếp, không cần build tay + xoá cache
mỗi lần nữa. Đã xoá `apps/shell-electron/node_modules/.vite` 1 lần để dọn cache cũ, xác nhận
`electron-vite build` (production) vẫn sạch sau khi thêm alias (alias chỉ áp dụng
`NODE_ENV !== 'production'`).

**Bài học cho các package UI dùng chung tương lai:** bất kỳ `packages/*` nào chưa có
`build --watch` VÀ được `modules/*` import trực tiếp trong renderer đều cần alias dev tương tự,
nếu không mọi thay đổi sẽ "âm thầm không lên" theo đúng kiểu bug này — không phải lỗi code, dễ
làm mất thời gian debug sai hướng (đã xảy ra ở đây: tưởng z-index sai, thực ra là cache cũ).

## Bug thứ 4 — sau khi chắc chắn code mới đã lên, popover VẪN lệch vị trí thật

Sau khi xoá cache + xác nhận `dev:app` chạy đúng bản mới, Sonth vẫn thấy popover nổi sai chỗ
(dưới đáy Modal). Kết luận: bug KHÔNG phải do cache lần này — logic tự viết định vị bằng
`getBoundingClientRect()` (`container.getBoundingClientRect()` trừ tay ra toạ độ tương đối) SAI
thật, vì containing block thật của `position: fixed` khi portal vào `.ceremony-root` phụ thuộc
việc `.ceremony-root` có thật sự lập containing block hay không (transform/contain) — điều chưa
xác nhận chắc chắn, và Ceremony còn chạy được trong "cửa sổ ảo" device-layout khiến bài toán toạ
độ càng dễ sai (đã tự nhận định sai ở bug thứ 1, sửa 2 lần vẫn không đúng).

**Quyết định: BỎ HẲN cách tự viết positioning**, thay bằng `radix-ui`'s `Popover`
(`PopoverPrimitive.Root/Trigger/Portal/Content`) — ĐÚNG cơ chế mọi popover khác trong repo đã
dùng (`modules/ceremony/src/control/components/ui/popover.tsx`, `select.tsx`, `dialog.tsx`...).
Radix tự lo định vị theo trigger (floating-ui bên trong, tính va chạm viewport), portal, đóng khi
click ra ngoài/Esc — không còn `getBoundingClientRect`/state toạ độ tay viết nữa. Vẫn giữ
`container` optional prop (route qua `PopoverPrimitive.Portal container={container}, giống hệt
`Select` đã làm) + `z-[60]` (cao hơn Modal's z-50, lý do như bug trước).

**Bài học:** không nên tự viết lại positioning cho popover khi Radix (đã là dependency có sẵn)
làm đúng việc này rồi — 2 lần sửa tay đầu tốn thời gian mà không giải quyết được tận gốc, lẽ ra
nên đi thẳng vào Radix Popover ngay từ đầu thay vì cố vá cách tự viết.

**Đã kiểm chứng lại:** typecheck 35/35 sạch, `module-ceremony` test 73/73, build production +
`dev:app` sạch. Chưa xem lại bằng mắt lần cuối.

## Chủ động KHÔNG làm đợt này (đã nói rõ với Sonth trước khi code)

- **11 primitive còn lại trong `ceremony/components/ui/`** (dialog, checkbox, badge, tabs,
  sheet, switch, popover, dropdown-menu, alert-dialog, label, Modal/Button/ConfirmModal riêng) —
  hiện KHÔNG trùng ở module nào khác thật sự (tts-studio chỉ có 3/14 file, giờ còn 0 sau đợt
  này). Chuyển ngay là dọn đón đầu, không giải quyết trùng lặp thật đang tồn tại.
- **CSS design tokens/theme** (`styles.css` mỗi module) — có trùng boilerplate CẤU TRÚC (đã có
  quy tắc bắt buộc ở `docs/guides/app-css-theming.md`), nhưng GIÁ TRỊ token khác nhau thật
  (ceremony 4 theme palette, tts-studio 1, layout-designer tối giản) + đây là cơ chế cách ly theme
  cố tình thiết kế riêng (từng fix "rò rỉ theme"). Cần quyết định thiết kế riêng.
- `radix-ui`/`zustand`/`i18next`/`framer-motion`/`canvas-confetti`/`@dnd-kit/*` — version nhất
  quán nhưng KHÔNG có code trùng lặp thật (mỗi module dùng cho logic nghiệp vụ riêng) — không
  catalog hoá vì chưa gây bất tiện thật, khác trường hợp `device-layout`/`lucide-react`.

## Đã kiểm chứng

- `pnpm --filter @sky-app/ui build` sạch.
- `pnpm typecheck` — 35/35 package (33 cũ + `@sky-app/ui` mới) sạch.
- `pnpm --filter @sky-app/module-ceremony test` — 73/73 (sửa 0 test, không hồi quy).
- `pnpm --filter @sky-app/module-layout-designer test` — 225/225, gồm `GradientEditor.test.tsx`
  19/19 (rủi ro hồi quy cao nhất của đợt này, do logic HSVA-sync phức tạp).
- `pnpm --filter @sky-app/module-tts-studio test` — 12/12.
- `electron-vite build` (production) sạch, `dev:app` khởi động sạch thật (SocketServer + TTS
  warmup, không lỗi module resolve/ABI).

**Chưa kiểm chứng bằng mắt:** vị trí Select trong Cài đặt giao diện Ceremony (fix positioning mới
nhận được — cần xác nhận không bị lệch/che khuất trong GUI thật), màu ColorSwatchPicker khi chọn
Event, gradient stop picker trong layout-designer.
