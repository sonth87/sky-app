# 2026-07-28 — 5 tinh chỉnh UX cho icon trạng thái TTS + phát audio TTS Studio

> Nối tiếp [`2026-07-28-tts-status-menu-bar-icon.md`](./2026-07-28-tts-status-menu-bar-icon.md) — vòng này sửa các điểm chưa ổn phát hiện sau khi dùng thật tính năng vừa thêm.

## Bối cảnh

Sau khi icon trạng thái TTS + EngineManager/DeviceSettingsModal lên menu bar, người dùng test thật và phản hồi 5 điểm:

1. Nhiều audio phát chồng lên nhau trong TTS Studio (preview giọng, phát nhanh, phát lại lịch sử — 3 chỗ độc lập, không có nơi nào biết chỗ khác đang phát); nút Play không đổi trạng thái nên không tắt được bằng tay.
2. Icon TTS trên menu bar không có dấu hiệu "đang mở" khi popover đang hiện.
3. Màu hover trong popover không rõ, không khớp các menu khác trong app.
4. EngineManager/DeviceSettingsModal hiện như hộp thoại giữa màn hình cố định — muốn giống cửa sổ ứng dụng thật (như cửa sổ log), kéo-thả/resize được.
5. Cửa sổ xem log hơi nhỏ — đề xuất thêm resize, mặc định TẮT (chỉ bật theo từng nơi dùng).

## Việc 1 — Một audio duy nhất phát cùng lúc (TTS Studio)

`modules/tts-studio` trước đó có 3 nơi phát audio độc lập, không nơi nào biết nơi khác đang phát: `HistoryList.tsx` (phát lại lịch sử qua PCM), `VoicePicker.tsx` (preview giọng qua URL), `GenerateBar.tsx`/`TtsStudioApp.tsx` (phát nhanh + auto-play sau khi tạo, qua PCM). File `playPcm.ts` cũ chỉ có hàm phát PCM đơn lẻ, không theo dõi trạng thái toàn cục.

Xoá `playPcm.ts`, thay bằng `lib/audioPlayer.ts` — một coordinator dạng singleton module-level (không phải React state, vì trạng thái "đang phát gì" là toàn app, nhiều component không có quan hệ cha-con):

- `currentId`/`currentAudio` module-level, `stopAudio()` dừng bất kể đang phát bằng `AudioBufferSourceNode` (PCM) hay `HTMLAudioElement` (URL).
- `playPcmAudio(id, buffer, sampleRate)`/`playUrlAudio(id, url)` — gọi `stopAudio()` trước khi phát cái mới; nếu gọi lại với `id` đang phát thì coi là bấm "Dừng" (toggle), không phát lại từ đầu.
- `useIsPlaying(id)`/`useAudioPlayingId()` — subscribe qua `useSyncExternalStore`, để mỗi component tự biết "tôi có đang là cái đang phát không" mà không cần prop-drilling trạng thái phát từ ngoài vào.

Áp vào 3 nơi cũ: `HistoryList` đổi icon Play→Pause khi `playingId === 'history:'+id`; `GenerateBar` đổi nhãn "Phát nhanh"→"Dừng" + icon khi `useAudioPlayingId() === QUICK_PLAY_ID`; `VoicePicker` đưa trạng thái phát vào `previewStates` (trước đó field này chỉ từng được set `'loading'`, chưa bao giờ set `'playing'`). `TtsStudioApp.handlePreview`/`handleQuickPlay` đều kiểm `getPlayingId() === playId` trước khi phát để tự toggle-dừng thay vì phát chồng.

**Chưa sửa** (ghi nhận, không trong phạm vi lần này): `modules/ceremony/src/control/components/VoicePickerPopover.tsx` có cùng pattern lỗi (2 lệnh `new Audio(url)` độc lập ở ~dòng 78 và ~111, không có cơ chế dừng cái trước) — không đụng vì luồng phát audio ngày hành lễ của Ceremony rủi ro cao hơn nếu sửa nhầm, và người dùng chỉ báo lỗi ở TTS Studio.

## Việc 2 — Trạng thái "đang mở" cho icon menu bar

`MenuBarExtraButton.tsx` (device-layout) là Radix `Popover.Trigger`, tự có `data-state="open"|"closed"` không cần React state thêm. Thêm class `data-[state=open]:bg-accent-active data-[state=open]:text-white` — tái dùng đúng token màu "active" đã có sẵn trong `globals.css` của device-layout, không tạo màu mới.

## Việc 3 — Hover khớp menu khác

`TtsStatusPanel.tsx` (tts-engine-ui) trước đó dùng hover mờ nhạt tự chế. Đối chiếu class hover thực tế của các menu khác trong device-layout, thấy dùng chung `hover:bg-accent-active hover:text-white` — cùng token màu vừa dùng ở Việc 2. Gom vào hằng số `MENU_ITEM_CLASS`, áp cho 3 nút hành động (Quản lý engine/Thiết bị xử lý/Xem log) trong popover.

## Việc 4 — EngineManager/DeviceSettingsModal thành cửa sổ thật

Yêu cầu "giống cửa sổ ứng dụng, resize được" trùng đúng với `FloatingWindow` đã build cho cửa sổ log ở vòng trước — quyết định dùng lại thay vì viết thêm loại chrome thứ hai.

- `FloatingWindow.tsx` (device-layout) thêm props `resizable?`, `minWidth?`, `minHeight?` — handle resize ở góc dưới-phải, kéo bằng pointer event, `size` state tách riêng khỏi `offset` (vị trí kéo-thả). Container ngoài đổi từ `items-center` (ép giữa màn hình) sang stretch mặc định để nội dung co giãn theo `size` thay vì luôn tự co theo nội dung.
- `EngineManager.tsx`/`DeviceSettingsModal.tsx` (tts-engine-ui) viết lại dùng `FloatingWindow` thay cho `Modal` cục bộ cũ, bật `resizable`.
- Xoá hẳn `Modal` khỏi `ui.tsx` — không còn nơi nào dùng sau khi 2 chỗ trên migrate xong.

### Quyết định kiến trúc: nới lỏng ranh giới "tts-engine-ui không phụ thuộc device-layout"

Vòng trước (xem history link ở đầu file) đã đặt ranh giới rõ: `tts-engine-ui` chỉ xuất nội dung thuần, việc lắp `FloatingWindow`/`Popover` dồn về `device-shell`. Yêu cầu lần này (EngineManager/DeviceSettingsModal tự thân phải LÀ cửa sổ, không phải nội dung nhét vào cửa sổ do nơi khác lắp) phá vỡ ranh giới đó theo đúng nghĩa đen — 2 component này cần tự quản lý chrome cửa sổ của chính mình vì chúng có thể mở từ nhiều nơi khác nhau trong tương lai (hiện tại chỉ device-shell gọi, nhưng ý nghĩa component là "hộp thoại cài đặt", không phải "nội dung popover").

Chấp nhận đánh đổi: thêm `@sonth87/device-layout` vào `devDependencies`+`peerDependencies` của `tts-engine-ui` (không phải `dependencies` — package tiêu thụ phải tự có device-layout, không kéo hộ). Lý do chấp nhận: không có, và không có kế hoạch có, nơi tiêu thụ `tts-engine-ui` nào ngoài các app chạy trong device-layout shell (TTS Studio, Ceremony đều chạy trong `SkyDeviceLayout`) — giữ ranh giới thuần túy ở đây không phục vụ mục tiêu thực tế nào, chỉ thêm một tầng lắp ráp không cần thiết cho đúng 2 component.

## Việc 5 — Resize cho cửa sổ log, mặc định tắt

Cùng cơ chế resize thêm ở Việc 4, nhưng đặc thù cửa sổ log: nội dung log cần `h-full w-full` để LẤP ĐẦY khung do `FloatingWindow` cấp thay vì tự ép kích thước cố định — `TtsLogPanel.tsx` đổi từ `max-h-[70vh] w-[480px]` sang `h-full w-full`. `resizable` mặc định `false` trong `FloatingWindowProps` (đúng yêu cầu "tắt mặc định, chỉ bật theo từng nơi dùng") — `TtsStatusMenuBarItem.tsx` (device-shell) bật tường minh `resizable` + `minWidth={420}`/`minHeight={320}` + kích thước mặc định lớn hơn (`600×520`, trước là nhỏ hơn) chỉ cho cửa sổ log; `AboutDialog` (nơi dùng `FloatingWindow` khác trong device-layout) không đụng, giữ nguyên không resize.

## Phát hành device-layout

Theo `docs/versioning.md` của repo đó: bump `0.4.0` → `0.5.0` (MINOR — thêm tính năng tương thích ngược: `resizable`/`minWidth`/`minHeight` trên `FloatingWindow`, class active-state trên menu bar extras). `pnpm build` + `pnpm build:lib` sạch, xác nhận `resizable` có trong `dist-lib/lib.d.ts` và `dist-lib/components/shared/FloatingWindow.d.ts`, commit "feat: resizable FloatingWindow + active-state on menu bar extras icon", tag `v0.5.0`, push commit + tag lên `origin/main`. Cập nhật `pnpm-workspace.yaml`'s catalog pin, `pnpm install` xác nhận link đúng `0.5.0`.

## Đã kiểm chứng

- `pnpm typecheck` toàn repo (33/33), build `tts-engine-ui` sạch.
- `pnpm test` Ceremony: 73/73 pass.
- Chạy dev thật (server + renderer): `[TTS] Ready.`, không có `EADDRINUSE`/`Uncaught`/`TypeError`/`ReferenceError`/`is not a function`/`No handler registered`/renderer crash trong log.

## CHƯA kiểm chứng

- **Chưa xem bằng mắt** — cần người dùng tự mở app xác nhận: chỉ 1 audio phát tại 1 thời điểm across cả 3 nơi (preview/phát nhanh/lịch sử), nút Play đổi icon đúng lúc; icon TTS đổi màu khi popover mở; hover popover khớp cảm giác các menu khác; EngineManager/DeviceSettingsModal kéo-thả và resize được mượt; cửa sổ log resize được và không còn "hơi nhỏ".
- Chưa test resize trên kích thước màn hình rất nhỏ (chưa rõ hành vi khi `minWidth`/`minHeight` lớn hơn viewport).
