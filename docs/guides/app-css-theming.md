# Guide: CSS & theme isolation cho app con

> Mỗi app con (`modules/*`) render **bên trong cửa sổ ảo của device-layout** — chung một trang (`document`) với shell và mọi app khác. CSS không tự cô lập theo cửa sổ. Guide này là các rule BẮT BUỘC để style của app không rò rỉ ra shell, không kẹt màu theme, và overlay không tràn ra ngoài vùng nội dung.
>
> Mọi rule dưới đây đã phải trả giá bằng bug thật (xem [dev/history.md](../dev/history.md) và các mục "verify" cuối mỗi phần). Đừng bỏ qua vì "trông như one-liner".

## Bối cảnh: tại sao app con khác một web app thường

Một app con **không** sở hữu `document` riêng. Nó là một subtree DOM nằm trong `window-body` của device-layout, cạnh shell (menu bar, dock, title bar) và các app khác — tất cả cùng một trang, cùng một `:root`, cùng chồng CSS cascade layer. Hệ quả:

- CSS bạn viết cho app **áp lên cả trang** nếu không scope.
- Biến theme khai ở `:root` **dùng chung** với shell → đè nhau.
- `position: fixed` của app **neo theo cả cửa sổ Electron**, không phải vùng nội dung app.

Ba rule dưới đây xử lý đúng 3 hệ quả đó.

---

## Rule 1 — Scope MỌI thứ theo root class của app (`.ceremony-root`, ...)

**Luật:** bọc toàn bộ UI app trong một div có class root riêng (Ceremony dùng `.ceremony-root`), và **mọi** biến theme + selector CSS của app phải scope dưới class đó. KHÔNG khai biến theme ở `:root`/`html`/`body`, KHÔNG set `.dark`/`data-theme` lên `document.documentElement`.

```tsx
// ✅ ĐÚNG — theme sống trong subtree app
<div className={cn('ceremony-root', dark && 'dark')} data-theme={palette}>
  {/* toàn bộ app */}
</div>
```

```css
/* ✅ biến scope theo root class */
.ceremony-root { --primary: oklch(...); --background: oklch(...); }
.ceremony-root[data-theme="blue"] { --primary: oklch(...); }
.ceremony-root.dark { --background: oklch(...); }
```

```ts
// ❌ SAI — rò rỉ ra toàn shell
document.documentElement.classList.add('dark');
document.documentElement.setAttribute('data-theme', palette);
:root { --primary: ...; }   /* đè biến của shell/app khác */
```

**Why:** đặt `.dark` lên `<html>` sẽ đổi màu cả shell device-layout và mọi app khác đang mở — đây là bug theme-isolation đã gặp. Theme phải là **thuộc tính của subtree app**, tính qua `useMemo` trong render body và gắn lên root div, KHÔNG phải side-effect lên `document`.

**Verify:** mở app trong shell, đổi theme app → chỉ vùng app đổi màu, title bar + dock + app khác giữ nguyên.

---

## Rule 2 — Re-map token `--color-*` của Tailwind NGAY TRONG root class

**Luật:** nếu dùng Tailwind v4 `@theme` để khai token màu (`--color-primary` = `var(--primary)`), bạn PHẢI khai lại toàn bộ `--color-*: var(--<biến-nguồn>)` **bên trong `.ceremony-root`** (không fallback).

```css
@theme {
  /* Tailwind CẦN block này để SINH class .bg-primary/.text-primary...
     nhưng nó emit token ra :root global — xem Why. */
  --color-primary: var(--primary, oklch(72.3% .219 149.579));
  /* ...38 token... */
}

.ceremony-root {
  --primary: oklch(...);          /* biến palette (đổi theo data-theme) */
  /* ...các biến palette khác... */

  /* BẮT BUỘC: re-map lại tại scope này để var() resolve đúng nơi có --primary */
  --color-primary: var(--primary);
  --color-background: var(--background);
  /* ...đủ 38 token --color-*, KHÔNG fallback... */
}
```

**Why:** `@theme` của Tailwind v4 **luôn emit token ra `:root, :host` (global)** — không có cơ chế scope. Nhưng biến palette `--primary` chỉ tồn tại trong `.ceremony-root`. Ở `:root`, `var(--primary)` là **undefined** → rơi về fallback (màu default) và **đóng băng** ở đó. Mọi utility class `.bg-primary`/`.text-primary` đọc `var(--color-primary)` nên **kẹt màu default vĩnh viễn — đổi palette không đổi màu**. (Custom property kế thừa theo cây DOM: `--color-primary` tính một lần ở `:root`, các node con chỉ kế thừa giá trị đã tính, không tính lại.)

Khai lại `--color-*` trong `.ceremony-root` khiến `var(--primary)` resolve **tại scope có palette** (kể cả `[data-theme]`/`.dark` override `--primary`), và specificity `.ceremony-root` > `:root` nên thắng bản global.

**Dấu hiệu chẩn đoán:** đọc `getComputedStyle(root)` — nếu `--primary` đổi theo `data-theme` nhưng `--color-primary` **không** đổi → chính là bug này.

**Verify (không cần chạy full app):** build CSS (`pnpm --filter @sky-app/shell-electron run build`), load file CSS đã compile vào Electron offscreen BrowserWindow, set `data-theme` khác nhau rồi đọc `getComputedStyle().backgroundColor` của một phần tử `.bg-primary`. Đổi màu qua các palette = đúng.

---

## Rule 3 — Overlay `position: fixed` phải bị giới hạn trong vùng nội dung app

**Luật:** root class của app phải tạo **containing block** cho con `position: fixed`, để modal/overlay/popover neo theo vùng nội dung app chứ không phải cả cửa sổ Electron.

```css
.ceremony-root {
  /* transform (hoặc filter/perspective/contain: layout paint) biến phần tử
     thành containing block cho MỌI con position:fixed bên trong. */
  transform: translateZ(0);
  contain: layout paint;
}
```

**Why:** `position: fixed` neo theo **ancestor gần nhất tạo containing block**; nếu không có, nó neo theo **viewport = cả cửa sổ Electron**. Modal/backdrop dùng `fixed inset-0` sẽ phủ luôn title bar + status bar của device-layout thay vì chỉ vùng app. Việc portal Radix vào subtree app (xem Rule 4) **không** sửa được điều này — DOM parent không quyết định nơi `fixed` vẽ; chỉ containing block mới quyết định. `.ceremony-root` được size khít `window-body` nên khi nó là containing block, overlay phủ đúng vùng nội dung.

**Lưu ý phụ:** `contain: paint` sẽ **clip** nội dung vẽ ra ngoài box `.ceremony-root`. Popover/dropdown neo sát mép app có thể bị cắt — Radix `avoidCollisions` thường tự lật vào trong, nhưng cần test các menu ở mép.

**Cạm bẫy đi kèm:** overlay dùng **toạ độ viewport tuyệt đối** (`getBoundingClientRect()`, `clientX/clientY` của chuột) sẽ bị **lệch** đúng bằng offset của `.ceremony-root` sau khi nó thành containing block. Sửa bằng cách trừ offset: `const r = root.getBoundingClientRect(); dùng x - r.left, y - r.top`.

**Verify:** mở một modal (vd Settings) → backdrop + hộp modal nằm gọn trong vùng nội dung, không đè title bar. Mở tooltip/menu chuột phải → hiện đúng vị trí con trỏ/icon, không lệch.

---

## Rule 4 — Route Radix Portal vào subtree app (để giữ theme, không phải để giới hạn vị trí)

**Luật:** mọi Radix Portal (Dialog/Popover/DropdownMenu/Tooltip/Select) và `createPortal` thủ công phải render vào container là root class của app, không phải `document.body` mặc định.

```tsx
// Container context trỏ vào .ceremony-root
const container = usePortalContainer();
<DialogPrimitive.Portal container={container ?? undefined}>...
createPortal(<Tooltip/>, container ?? document.body)
```

**Why:** biến theme chỉ tồn tại trong subtree `.ceremony-root` (Rule 1). Portal ra thẳng `document.body` sẽ **mất hết theme** (màu, font, spacing) vì nằm ngoài subtree đó. Đây là lý do **theme**, độc lập với Rule 3 (lý do **vị trí**) — cần cả hai.

**Verify:** mở dropdown/dialog → màu + font khớp theme app đang chọn, không phải màu default trần.

---

## Rule 5 — App host phải tự import CSS của UI library dùng Tailwind v4

**Luật:** khi dùng một published library có Tailwind v4 CSS-only config (vd `@sonth87/device-layout`), shell host BẮT BUỘC `import` CSS export của nó, và pin thứ tự `@layer` giống nhau ở mọi entry.

```ts
// apps/shell-electron/src/main.tsx (và shell-web)
import './tailwind-layer-order.css';              // pin @layer order TRƯỚC mọi bundle
import '@sonth87/device-layout/style.css';         // CSS của library
import '@sky-app/module-ceremony/styles.css';      // CSS của app
```

**Why:** Tailwind v4 `@source` **không quét qua ranh giới dependency** — class runtime của library (vd `pointer-events-auto`) sẽ vắng mặt hoàn toàn trong CSS output nếu host không import CSS đã build sẵn của library, gây bug hit-test/style khó lần. Và khi 2 bundle Tailwind độc lập cùng trang, thứ tự `@layer` phải được forward-declare giống hệt nhau, nếu không `@theme` token của bên "thua" tính ra rỗng. Chi tiết: [dev/history.md](../dev/history.md) (mục "không mở được bất kỳ app nào" và `tailwind-layer-order.css`).

---

## Checklist CSS/theme khi thêm app

- [ ] Toàn bộ UI bọc trong root class riêng (`.<app>-root`)
- [ ] Biến theme + selector scope dưới root class — KHÔNG `:root`/`<html>`
- [ ] Theme áp qua class/attr trên root div (useMemo), KHÔNG side-effect lên `document`
- [ ] Nếu dùng `@theme`: re-map đủ `--color-*` trong root class (Rule 2)
- [ ] Root class tạo containing block (`transform`/`contain`) cho fixed overlay (Rule 3)
- [ ] Overlay dùng toạ độ viewport → trừ offset root class (Rule 3 cạm bẫy)
- [ ] Radix Portal + createPortal route vào container root class (Rule 4)
- [ ] Verify: đổi theme app KHÔNG ảnh hưởng shell/app khác; modal không tràn title bar; utility class đổi màu theo palette

## Liên quan

- [adding-an-app.md](./adding-an-app.md) — luồng thêm app tổng thể
- [shared-vs-per-app.md](../architecture/shared-vs-per-app.md) — ranh giới code shared/per-app
- [dev/history.md](../dev/history.md) — nhật ký các bug CSS/theme đã gặp và cách fix
