# 2026-08-12 — Gộp 3 mục menu TTS thành 1 cửa sổ "Cấu hình" 4 tab

## Cập nhật 2026-08-13 (2): sửa CHƯA ĐỦ — thiếu `min-h-0` ở đúng tầng gây tràn/cắt

Đợt sửa `min-h-0` trước (mục dưới) chỉ thêm vào các tầng BÊN TRONG `ConfigWindow`'s tab pane
(`EffectsManagerPanel`'s grid + từng cột). Sonth test lại báo vẫn còn "form không scroll xuống
được nhiều, thiếu mất phần dưới" — tức chưa hết bug, chỉ đỡ hơn phần nào.

**Tầng còn thiếu, đúng ra là tầng NGOÀI CÙNG:** `ConfigWindow.tsx` truyền cho `FloatingWindow`
`contentClassName="flex h-full w-full"` — chính div này (con trực tiếp của khung cửa sổ,
đứng CẠNH titlebar trong 1 `flex-col` có chiều cao cố định theo `height`/`width` prop) thiếu
`min-h-0`. Đọc thẳng source `FloatingWindow.tsx` (`/Users/skyline/PROJECTS/device-layout/src/
components/shared/FloatingWindow.tsx:211-213`) thấy chính component đã ghi chú sẵn: *"min-h-0
để vùng cuộn bên trong hoạt động đúng khi contentClassName của caller đặt overflow-y-auto trên
container cao cố định"* — nhưng `ConfigWindow.tsx` (viết lúc gộp cửa sổ, mục "Phase A" bên
dưới) lại KHÔNG làm theo đúng chỉ dẫn này. Thiếu `min-h-0`, div nội dung không co được xuống
đúng phần còn lại (chiều cao cửa sổ trừ titlebar) khi nội dung bên trong đủ dài — tràn ra ngoài
rồi bị chính `overflow-hidden` của khung cửa sổ (bo góc) CẮT MẤT, không phải lỗi của vùng cuộn
bên trong (Effects tab) — nội dung đã mất trước khi kịp tới đó, nên cuộn kiểu gì cũng không lộ
ra được.

So khớp với 2 caller khác của `FloatingWindow` cũng đặt `contentClassName` tương tự:
`DeviceSettingsModal.tsx` (đã có sẵn `flex-1 min-h-0` đúng ngay từ đầu) và `SettingsModal.tsx`
(ceremony, cũng có `min-h-0`) — chỉ `ConfigWindow.tsx` và `EngineManager.tsx` (cùng lỗi, dùng
`h-full w-full flex-col` không `min-h-0`, danh sách engine dài cũng sẽ dính đúng bug này dù
Sonth chưa báo) thiếu. Sửa cả 2, đổi `h-full` → `flex-1 min-h-0` (khớp pattern của
`DeviceSettingsModal.tsx`).

Xác nhận: `pnpm typecheck` (36/36), `pnpm -w test` (28/28), build thật.

## Cập nhật 2026-08-13: Hoài My/Nam Minh thiếu mô tả trong picker nghe thử ở tab Hiệu ứng

Sonth báo trong picker "Nghe thử" (tab Hiệu ứng), 2 giọng mặc định Hoài My/Nam Minh chỉ hiện
tên trần, không có mô tả ngắn như các giọng khác (Cẩm Hồng, Anh Đức...) — trong khi ở TTS
Studio, 2 giọng này VẪN hiện mô tả đầy đủ.

**Nguyên nhân:** `tagline`/`description` của Hoài My/Nam Minh chỉ tồn tại ở catalog gốc
(`apps/tts-service/resources/voice-ref/vi-VN/catalog.json`), KHÔNG được copy vào registry
entry lúc import (`apps/shell-electron/resources/voice-registry.imported.json`'s
`preset-HoaiMy`/`preset-NamMinh` không có field này) — khác các giọng clone sau này (Cẩm
Hồng, Anh Đức...) lưu `tagline`/`description` thẳng vào registry lúc tạo. Backend
`list_voices()` (`apps/tts-service/server/main.py`) đọc thẳng từ registry entry, không tự
fallback sang catalog — nên `ttsPort.listVoices()` trả `tagline: null` cho đúng 2 giọng này.

TTS Studio's `TtsStudioApp.tsx`'s `refreshVoices()` đã tự bù bằng cách gọi thêm
`tts.listVoiceCatalog()`, khớp qua `sourceCatalogId`, fallback `tagline: v.tagline ?? cat?.tagline`
(tương tự cho `description`/`category`/`tags`) — nhưng `EffectsManagerPanel.tsx` (tab Hiệu
ứng) chỉ gọi mỗi `listVoices()`, chưa từng làm bước bù này.

**Sửa bằng cách tách logic bù thành hàm dùng chung** thay vì chép lại lần 2:
`enrichVoicesFromCatalog(voices, catalog)` (mới, `packages/voice-catalog-ui/src/types.ts`,
export qua `index.ts`) — nhận `Voice[]` + `VoiceCatalogEntry[]`, bù `tagline`/`description`/
`category`/`tags` còn thiếu qua `sourceCatalogId`. `EffectsManagerPanel.tsx`'s effect tải
giọng đổi từ `ttsPort.listVoices()` đơn lẻ sang `Promise.all([listVoices(), listVoiceCatalog?.()])`
rồi qua `enrichVoicesFromCatalog` trước khi `setVoices`.

**Chưa đụng `TtsStudioApp.tsx`** — logic ở đó làm nhiều hơn (còn ghép thêm catalog entry
CHƯA từng import vào danh sách hiển thị, set field `default`...), ngoài phạm vi lần sửa này;
có thể cân nhắc refactor dùng chung `enrichVoicesFromCatalog` cho phần tagline/description sau,
không bắt buộc vì rủi ro đụng luồng đang chạy đúng không cần thiết.

Xác nhận: `pnpm typecheck` (36/36), `pnpm -w test` (28/28), build thật qua
`pnpm --filter @sky-app/shell-electron build`.

## Cập nhật: bug thật — `packages/tts-engine-ui` chưa từng có bundle Tailwind CSS riêng

Sau khi làm xong khung sườn + nâng cấp giao diện Effects/Logs/Settings theo mẫu voicebox,
Sonth báo layout vỡ thật (cột "tạo preset mới" của tab Effects rơi xuống DƯỚI danh sách thay
vì nằm CẠNH — `grid-cols-[240px_1fr]` không có tác dụng).

**Nguyên nhân gốc, không phải lỗi CSS riêng lẻ:** `apps/shell-electron/src/main.tsx` chỉ
import CSS của 4 bundle (`@sonth87/device-layout`, `module-ceremony`, `module-tts-studio`,
`module-layout-designer`) — `packages/tts-engine-ui` (nơi `ConfigWindow`/`EffectsManagerPanel`/
`EffectsChainEditor`/`DeviceConfig`/`TtsLogPanel` sống) **chưa từng có `styles.css` riêng**,
`package.json`'s `build` script chỉ chạy `tsc`, không có bước Tailwind nào. Nghĩa là **toàn
bộ class Tailwind package này dùng, từ Phase A của việc gộp cửa sổ Cấu hình tới giờ, chưa
từng được biên dịch vào bất kỳ CSS bundle nào** — chỉ những class TRÙNG NGẪU NHIÊN với class
đã dùng ở 1 trong 4 bundle kia (vd `flex`, `rounded-lg`, `text-xs` — rất phổ biến) mới "tình
cờ" hoạt động, còn class càng đặc thù (`grid-cols-[240px_1fr]` — giá trị arbitrary, gần như
chắc chắn không trùng ai) thì càng chắc chắn bị thiếu. Đây là lý do các lần sửa giao diện
trước đó (tab icon-only, card effect, dòng setting...) "có vẻ ổn" một phần nhưng vẫn lệch —
không phải do chọn sai class, mà do nhiều class chưa từng tồn tại trong CSS output.

**Sửa đúng gốc, theo khuôn `modules/tts-studio/src/styles.css` đã có sẵn:**
1. `packages/tts-engine-ui/src/styles.css` (mới): `@import "tailwindcss"; @source "./**/*.{ts,tsx}";`
   — KHÔNG định nghĩa `@theme`/root-scope riêng (package này render ở tầng device-shell,
   global, không nằm trong subtree app cụ thể nào có root class như `.tts-studio-root`) — token
   màu đã global sẵn nhờ `@theme` của 4 bundle kia (`@theme` luôn emit ra `:root`, xem comment
   trong `modules/tts-studio/src/styles.css`). Đánh đổi đã biết: nội dung ở đây luôn dùng
   FALLBACK màu sáng, không tự đổi theo dark mode — chấp nhận được cho chrome toàn cục, sửa
   sau nếu cần khớp dark mode chính xác.
2. `packages/tts-engine-ui/package.json`: thêm `"./styles.css": "./src/styles.css"` vào `exports`.
3. `apps/shell-electron/src/main.tsx`: thêm `import "@sky-app/tts-engine-ui/styles.css";`.
4. **Bug thật thứ 2, phát hiện khi build thử để xác nhận** (`electron-vite build` — không chỉ
   tin `tsc`/typecheck, vì đó không kiểm được resolution của import CSS): Rollup báo không
   resolve được `@sky-app/tts-engine-ui/styles.css`. Nguyên nhân: `@sky-app/tts-engine-ui`
   trước giờ chỉ là dependency GIÁN TIẾP của `shell-electron` (qua `device-shell`), chưa từng
   khai trực tiếp trong `apps/shell-electron/package.json` — pnpm strict mode không symlink
   package không được khai TRỰC TIẾP vào `node_modules` của package đang cần nó (chặn phantom
   dependency có chủ đích). Thêm `"@sky-app/tts-engine-ui": "workspace:*"` vào dependencies
   của `shell-electron` + `pnpm install` lại thì resolve được.

**Kiểm chứng thật, không chỉ tin build không lỗi:** grep thẳng vào CSS output đã build
(`electron-vite build` ra thư mục tạm) tìm `grid-template-columns: 240px 1fr` — CÓ mặt, xác
nhận class thật sự được sinh ra, không chỉ "build pass".

## Cập nhật 2026-08-13: dropdown không lật lên, form không cuộn, "Ho..." vẫn cắt cụt

Sau đợt sửa z-index/truncation ở mục dưới, Sonth thử lại và báo tiếp 3 điều: (1) dropdown chọn
giọng chỉ xổ xuống dưới, không tự lật lên khi trigger gần đáy cửa sổ; (2) form tạo/sửa preset
(cột phải tab Effects) bị tràn xuống đáy cửa sổ, phần "Nghe thử" ở cuối form luôn bị khuất,
không cuộn lên/xuống được; (3) tên giọng "Hoài My" vẫn chỉ hiện "Ho..." dù bản sửa trước đã đổi
`shrink-0`/`min-w-0`.

**Bug #3 hoá ra chưa sửa hết ở lần trước:** span bọc ngoài (`flex min-w-0 items-center gap-1.5`,
chứa name + dấu "·" + tagline) là 1 flex item trong button — flex item mặc định KHÔNG tự giãn
để lấp đầy chỗ trống (`flex-grow: 0`), nó chỉ rộng bằng đúng nội dung bên trong. Vì vậy
`max-w-[60%]` đặt trên `name` tính theo 60% của MỘT HỘP ĐÃ TỰ CO NHỎ (bằng đúng bề rộng chữ
"Hoài My", ~70px) chứ không phải 60% bề rộng trigger thật — ra kết quả cực kỳ hẹp, cắt gần hết
dù trigger còn thừa rất nhiều chỗ trống. Sửa: thêm `flex-1` vào span bọc ngoài để nó thật sự lấp
đầy khoảng trống trong trigger (button dùng `justify-between` giữa span này và icon chevron),
lúc đó `max-w-[60%]` mới tính đúng theo bề rộng thật.

**Bug #1 (dropdown không lật):** trước đây dropdown luôn đặt `top: rect.bottom + 4px` — không
có logic đo khoảng trống bên dưới/bên trên trigger. Sửa bằng pattern đo-rồi-định-vị 2 bước, cả
2 đều `useLayoutEffect` (không phải `useEffect` thường) để React flush xong các lần `setCoords`
nối tiếp TRƯỚC khi trình duyệt vẽ khung hình — tránh chớp hình 1 nhịp ở vị trí sai:
1. Lần đo đầu: dropdown chưa mount nên chưa biết chiều cao thật (`dropdownRef.current` null) —
   tạm đặt bên dưới trigger như cũ để có DOM mà đo.
2. Lần đo thứ 2 (chạy lại vì `coords` vừa đổi ở bước 1, dropdown giờ đã mount): đo chiều cao
   thật qua `dropdownRef.current.offsetHeight`, so khoảng trống bên dưới/bên trên trigger
   (`window.innerHeight - rect.bottom` vs `rect.top`), lật lên trên nếu bên dưới không đủ VÀ
   bên trên rộng hơn. Nếu vị trí mới khác vị trí cũ mới `setCoords` lại (guard tránh lặp vô hạn
   — lần đo thứ 3 sẽ ra cùng kết quả nên dừng).

**Bug #2 (form không cuộn) — cùng họ lỗi với bug #3, khác biểu hiện:** đây là bug flexbox/grid
kinh điển "`overflow-y-auto` không có tác dụng trong flex/grid item" — flex/grid item mặc định
có `min-height: auto`, nghĩa là KHÔNG co xuống dưới chiều cao nội dung dù cha có chiều cao cố
định, nên nội dung dài cứ đẩy tràn thay vì bị `overflow-y-auto` cắt/cuộn. Thiếu `min-h-0` ở
CẢ 3 tầng lồng nhau: `ConfigWindow.tsx`'s pane bọc tab (`min-w-0 flex-1 overflow-y-auto`, dòng
107), `EffectsManagerPanel.tsx`'s grid 2 cột (`h-full grid-cols-[240px_1fr]`), và từng cột con
(`flex flex-col overflow-y-auto`). Sửa: thêm `min-h-0` ở cả 3 tầng — giờ cột phải tự cuộn nội
bộ trong đúng chiều cao còn lại của cửa sổ, không đẩy tràn nữa.

Cả 3 sửa xác nhận lại bằng `pnpm typecheck` (35/35), `pnpm -w test` (28/28), và build thật +
grep CSS output tìm `min-height:0` (utility `min-h-0` được Tailwind sinh ra thật).

## Cập nhật: 3 bug thật phát hiện qua thử nghiệm thực tế tab Effects

Sau khi bundle CSS đã đúng, Sonth thử tab Effects/voice picker thật và phát hiện thêm 3 lỗi
độc lập:

**1. Trắng màn hình khi mở tab Effects** — `EffectsManagerPanel.tsx` gọi 2 `useMemo` (`voiceItems`,
`rowPreviewStates`) SAU 2 early return (`if (!effectPresetPort) return...`, `if (!types) return...`).
Lần render đầu (trước khi `types` load xong) gọi ÍT hook hơn lần render sau — vi phạm Rules of
Hooks, React throw ngay khi phát hiện số hook không khớp giữa 2 lần render, sập cả cây render.
Sửa: dời cả 2 `useMemo` lên TRƯỚC mọi early return.

**2. Dropdown chọn giọng nổi DƯỚI cửa sổ Cấu hình** — `VoicePickerCombobox`'s dropdown portal
thẳng ra `document.body` (`createPortal`), trở thành SIBLING của `FloatingWindow` (không phải
con), nên so sánh z-index trực tiếp với nó thay vì luôn nổi trên trigger như kỳ vọng.
`FloatingWindow`/mọi chrome "luôn nổi trên cùng" trong `device-layout` dùng `zIndex: 99999`
(quy ước đã có từ trước — xem `AppIcon.tsx`/`Wallpaper.tsx`/`EditContextMenu.tsx`...), còn
dropdown chỉ có Tailwind `z-50` — thua thẳng, chỉ phần lòi ra ngoài đáy window mới thấy được.
Sửa: đổi sang inline `style={{ zIndex: 100000 }}` — vượt giá trị z-index cao nhất đang dùng
trong repo, không ảnh hưởng consumer khác (TTS Studio/Ceremony) vì dropdown vốn dĩ luôn phải
nổi trên trigger bất kể ngữ cảnh.

**3. Tên giọng đang chọn bị cắt cụt còn vài ký tự** (vd "Ho....." thay vì "Hoài My") — trong
hàng flex hiện `{name} · {tagline}`, `name` (ưu tiên hiển thị) KHÔNG có `shrink-0` trong khi
dấu "·" và `tagline` (phụ) CÓ — name trở thành phần tử co được DUY NHẤT trong hàng chật, bị bóp
gần về 0, còn tagline được bảo vệ khỏi co nên chiếm hết chỗ. Ngược hoàn toàn ưu tiên mong muốn.
Sửa: đảo lại — `name` nhận `shrink-0` (luôn hiện đủ, chỉ cắt trong `max-w-[60%]` riêng nếu
CHÍNH nó quá dài), `tagline` nhận `min-w-0 flex-1` (co trước, tự truncate khi thiếu chỗ).

Cả 3 sửa ở `packages/voice-catalog-ui/src/VoicePickerCombobox.tsx` (bug #2, #3) và
`packages/tts-engine-ui/src/EffectsManagerPanel.tsx` (bug #1) — không đổi API/props nào, xác
nhận lại bằng `pnpm typecheck` (35/35) + build thật (`electron-vite build`, grep CSS output
xác nhận `z-index:100000` có mặt).

**Tiện thể sửa luôn 1 lỗi test timing đã ghi nhận ở mục Kiểm chứng bên dưới**: `TtsStudioApp.test.tsx`
kỳ vọng lỗi "network down" xuất hiện trong 8s, nhưng component đã được nới tổng thời gian retry
lên ~28s từ trước (commit `3c3c2ab`, comment "Bug thật #2" trong `TtsStudioApp.tsx`) mà test
chưa từng cập nhật theo — nâng timeout `findByText` + test lên khớp ~28s thực tế.

---

**Bối cảnh gốc:** Popover trạng thái TTS trên menu bar có 3 mục tách rời: "Quản lý engine...",
"Thiết bị xử lý...", "Xem log..." — mỗi mục tự mở 1 `FloatingWindow` riêng. Sonth yêu cầu
gộp thành 1 cửa sổ **"Cấu hình"** có tab dọc bên trái (Models/Engine, Effects, Logs,
Settings), tham khảo UI voicebox cho 2 tab Effects/Logs, và yêu cầu phân tích rõ tính năng
"Thiết bị xử lý" — chưa rõ có hoạt động đúng/cần thiết không.

## Phân tích "Thiết bị xử lý" trước khi động vào code

Điều tra bằng cách đọc trực tiếp `onnx_providers.py`, `config_store.py`, `DeviceConfig.tsx`,
`ipc.ts`, `python-server.ts` — kết luận: **có hoạt động thật**, không phải hiển thị giả.
Chuỗi UI → IPC (`tts:set-config`/`tts:capabilities`) → HTTP (`PUT/GET /config`) → Python
→ tiêm thật vào `onnxruntime.InferenceSession` (qua monkeypatch `patched_session`, vì lib
`vieneu` vendored hardcode `providers=["CPUExecutionProvider"]` ở 2 chỗ) đều nối dây đầy đủ.

Trên máy Apple Silicon test, lựa chọn thật sự chỉ có CPU — không phải bug:
`onnx_providers.py`'s `_KNOWN_BROKEN = {"CoreMLExecutionProvider", "AzureExecutionProvider"}`
cố ý khoá CoreML sau **1 sự cố production thật** (CoreML trả lỗi 500 hàng loạt với graph
VieNeu — external-data weights + KV cache dynamic-shape rỗng, test 2026-07). Máy CÓ CoreML
EP available (`onnxruntime.get_available_providers()` xác nhận) nhưng bị khoá cứng vì hỏng.

Điểm nửa vời thật sự (đáng sửa UX, không phải sửa logic): setting này Ý NGHĨA khác nhau theo
engine — VieNeu/MOSS-TTS-Nano dùng làm ONNX provider THẬT; Qwen(torch)/VoxCPM chỉ đọc để suy
luận có bật CUDA hay không; Qwen-MLX bỏ qua hoàn toàn. → Giữ nguyên toàn bộ logic backend
(đã đúng, có chủ đích), chỉ thêm 1 dòng chú thích ngắn theo engine đang chạy (`DEVICE_RELEVANCE`
map trong `DeviceConfig.tsx`, suy từ đọc code — không có capability field riêng ở backend cho
việc này, out of scope thêm mới lần này).

## Phase A — Khung cửa sổ + gộp Models/Engine + Settings

Tách `EngineManager.tsx` (682 dòng, tự bọc `FloatingWindow`) thành `EngineManagerContent`
(content thuần, không nhận `open`/`onClose` — mount = coi như đang mở) + `EngineManager` (wrapper
mỏng giữ nguyên API cũ, bọc content trong `FloatingWindow`, tương thích ngược cho caller
chưa chuyển sang `ConfigWindow`). `DeviceConfig.tsx` vốn ĐÃ là content thuần (không cần tách) —
chỉ bỏ nút nhúng `EngineManager` con (dư thừa khi có tab riêng), thêm prop
`onOpenEngineManager?` để `ConfigWindow` chuyển tab thay vì mở popup lồng.

`ConfigWindow.tsx` (mới) — 1 `FloatingWindow` (760×560, resizable) chứa sidebar tab dọc tự
dựng (không import `SettingsModal`/`Modal` cục bộ của Ceremony — package `tts-engine-ui`
không phụ thuộc Ceremony) + content pane switch theo tab đang chọn. Mỗi tab chỉ MOUNT khi
active (không giữ cả 4 ẩn/hiện bằng CSS) — khớp cách `EngineManagerContent` quản lý lifecycle
(subscribe tiến độ cài đặt lúc mount, huỷ lúc unmount).

`TtsStatusPanel.tsx`: 3 prop callback cũ (`onManageEngine`/`onDeviceSettings`/`onViewLogs`) →
1 prop `onOpenConfig`, popover chỉ còn 1 mục "Cấu hình...". `TtsStatusMenuBarItem.tsx`
(device-shell): 3 state mở/đóng riêng → 1 state `configOpen` + `<ConfigWindow>`.

**Tương thích ngược xác nhận qua typecheck**: `modules/ceremony`'s `TtsSettingsContent.tsx`
dùng `DeviceConfig` trực tiếp (không qua `ConfigWindow`), không truyền `onOpenEngineManager` —
vẫn hoạt động đúng hành vi cũ (mở popup `EngineManager` lồng) nhờ fallback, không cần sửa gì
ở Ceremony.

## Phase B — Tab Effects (nâng cấp MVP có sẵn theo mẫu voicebox)

Backend Python (`effects.py`) **đã có đủ 8 loại effect** y hệt voicebox từ trước (chorus,
reverb, delay, compressor, gain, highpass, lowpass, pitch_shift, cùng dùng `pedalboard`) —
tab Effects chỉ thiếu UI, không thiếu gì backend. `EffectsPanel.tsx` cũ (trong TTS Studio)
gắn chặt `useTtsStudioStore`, chỉ chọn/chỉnh preset có sẵn, không thêm/xoá/kéo-thả effect —
**giữ nguyên, không đụng** (mục đích khác: chọn nhanh lúc soạn audio).

`EffectsChainEditor.tsx` (mới) — kéo-thả bằng `@dnd-kit` (thêm dependency, đã có tiền lệ
dùng ở `modules/ceremony`, cùng version với voicebox: core 6.3.1/sortable 10.0.0/utilities
3.2.2). Mỗi effect trong chain có `localId` cục bộ ổn định cho dnd-kit (`EffectConfig` gửi
API không có id — 1 preset có thể chứa 2 effect CÙNG type, không dùng `type` làm key được) —
tước bỏ trước khi gửi lên qua `toEffectsChain()`.

`EffectsManagerPanel.tsx` (mới) — 2 cột: trái danh sách preset (Dựng sẵn/Tuỳ chỉnh), phải
chain editor + Preview. **Preview khác cơ chế voicebox**: voicebox hậu xử lý 1 generation
audio ĐÃ LƯU (`/effects/preview/{generation_id}`); sky-app áp effect NGAY LÚC synthesize qua
`SpeakOptions.effectsChain` — nên Preview ở đây synthesize 1 câu mẫu (`ttsPort.speak` với
`effectsChain` đang sửa), không phải hậu xử lý.

## Phase C — Tab Logs (log thô realtime kiểu voicebox)

Log thô (`console.log`/`console.warn` mỗi dòng stdout/stderr, `python-server.ts`) trước đây
CHỈ hiện trong terminal `pnpm dev` — chưa từng đẩy sang renderer. Thêm
`broadcastLogLine(tier, stream, line)` gọi cạnh 2 chỗ log console hiện có, phát IPC event
`tts:log-line` tới MỌI renderer window, KHÔNG lọc theo `activeTier` (khác `pushStatus`) — log
gỡ lỗi thô nên cố ý hữu ích thấy cả tier chạy nền (blue-green đổi engine).

1 event = 1 lần `data` từ stdout/stderr, KHÔNG tách theo dấu xuống dòng thật — giữ nguyên
limitation có sẵn từ trước (2 chỗ gọi cũ, `recentStderr`/`console.log`, cũng chưa từng tách
đúng dòng), không mở rộng phạm vi sửa.

Dây chuyền: `preload.ts`'s `onTtsLogLine` (bridge, mẫu y hệt `onEngineInstallProgress`) →
`TtsLogLine` type mới ở `slide-shared/slide-api.ts` (thêm vào `SlideApi` — bắt buộc, không
optional, khớp `onEngineInstallProgress` cùng interface) → `TtsEnginePort.subscribeLogLines?`
(OPTIONAL ở tầng port này — Web không implement) → `platform-electron`'s adapter gọi thẳng
`window.slide.onTtsLogLine`.

`TtsLogPanel.tsx`: thay khối `recentStderr` cũ (danh sách tĩnh, `max-h-40`, phải đợi poll
1.5s) bằng khối log thô cuộn realtime — cap 2000 dòng (`MAX_LOG_LINES`, dòng cũ nhất bị bỏ),
auto-scroll xuống cuối TRỪ KHI người dùng đã tự cuộn lên (theo dõi
`scrollHeight - scrollTop - clientHeight < 40`, hiện nút "Cuộn xuống cuối" khi đang cuộn dở
— đúng UX voicebox's LogsPage), `stdout` chữ nhạt/`stderr` cam nổi bật, nút "Xoá" chỉ xoá
mảng phía renderer. Đổi ưu tiên không gian: khối log mới nhận `flex-1` (chính), phần
"Hoạt động" (activityLog, per-request, có `durationMs`/`cacheHit` — chi tiết hơn voicebox)
đổi từ `flex-1` sang `max-h-48` cố định — log thô giờ là nội dung chính của tab, activityLog
là phần bổ trợ.

## Kiểm chứng

`pnpm typecheck` 35/35, `pnpm -w test` 28/28 xanh (gồm cả fix test timing ở mục Cập nhật trên).

**Chưa kiểm bằng mắt trong Electron thật** (không có công cụ mở trình duyệt/app) — cần Sonth
tự mở popover → "Cấu hình..." xác nhận cả 4 tab, thử tạo preset effect mới nghe được đúng
hiệu ứng, và xem log thô có cuộn realtime đúng lúc synthesize hay không.

## Còn phải làm

- Tab Effects: chưa có cách sửa transcript/metadata khác ngoài tên+mô tả preset — không nằm
  trong yêu cầu lần này.
- Logs: 1 event = 1 chunk chưa tách đúng dòng thật (limitation kế thừa, xem trên) — nếu về
  sau thấy khó đọc thật sự thì mới đáng sửa riêng.
- `TtsStatusPanel`'s `onOpenConfig` không nhận tham số chọn tab sẵn — luôn mở ở tab
  "Models/Engine" mặc định. Có thể thêm sau nếu cần (vd bấm thẳng vào dòng "Thiết bị" trong
  popover mở thẳng tab Settings).
