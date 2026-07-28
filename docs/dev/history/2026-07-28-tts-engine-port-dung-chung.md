# 2026-07-28 — Cơ chế quản lý engine TTS dùng chung + engine VoxCPM + runtime Python cho bản đóng gói

## Bối cảnh

TTS Studio và Ceremony dùng chung `tts-service`, nhưng UI quản lý engine/thiết bị chỉ có ở Ceremony và **gọi thẳng `window.slide.*`** — vi phạm Ports & Adapters (AGENTS.md §2). Hệ quả: không tái dụng được cho TTS Studio, không chạy được trên Web.

Kèm theo, cuộc điều tra lỗi clone giọng sai vùng miền ([tài liệu](../../services/tts-clone-giong-accent.md)) cho thấy VieNeu có giới hạn về accent transfer → cần đường thoát sang engine khác, tức cần cơ chế đổi engine tử tế.

## Phát hiện quan trọng trong lúc khảo sát

Hạ tầng backend **đã gần như hoàn chỉnh** và đã chạy thật với `moss-tts-nano`: endpoint `/engines` `/capabilities` `/config`, manifest `install` trong `engine_registry.py`, installer đầy đủ preflight/pause/resume/cancel/verify/import/export, 18 IPC handler, preload bridge. Thiếu **duy nhất** tầng port và việc tách UI ra dùng chung.

Nhưng có một lỗ hổng lớn chưa ai để ý: **bản đóng gói không chạy được engine mở rộng**, vì hai lý do độc lập nhau:
1. `electron-builder.yml` không đóng gói mã nguồn Python server → `getServerDir()` trả `''` → `resolveExtensionEngineSpawn()` luôn trả `null`.
2. Không có interpreter Python → `installRuntime()` báo lỗi ngay (chỗ này code cũ đã tự ghi chú "chưa làm ở Cụm 1").

Tức là tính năng engine mở rộng chỉ hoạt động ở bản dev. Cả hai lựa chọn "thêm VoxCPM" và "bật GPU cho bản đóng gói" đều quy về cùng một mảnh còn thiếu này.

## Thay đổi

### Contract — `TtsEnginePort`

`packages/service-contracts/src/tts-engine.ts`. Chọn **port riêng** thay vì nhồi vào `TtsPort` (đang 10 method, thêm 18 nữa là quá tải; quản lý engine cũng khác trách nhiệm với tổng hợp giọng).

Nhóm ĐỌC (`listEngines`/`getCapabilities`/`getConfig`) bắt buộc; nhóm THAY ĐỔI và CÀI ĐẶT để optional để adapter Web chỉ implement phần làm được.

> **Sửa so với kế hoạch ban đầu:** dự định "chuyển type từ `slide-shared` sang `service-contracts`" là **sai** — `service-contracts` vốn đã phụ thuộc `slide-shared` (xem `layout.ts:1`, `event.ts:1`), làm vậy sẽ đảo chiều và tạo vòng lặp. Thực tế: giữ type ở `slide-shared`, `tts-engine.ts` import rồi re-export.

### Adapter

- `platform-electron/src/adapters/tts-engine.ts` — ánh xạ 1-1 sang `window.slide.*`, có giá trị mặc định an toàn khi bridge cũ thiếu handler.
- `platform-web/src/adapters/tts-engine.ts` — chỉ đọc + `setConfig`/`switchEngine` qua HTTP. **Cố tình bỏ** nhóm cài đặt và `restart` (một client web không được cài đặt hay khởi động lại service dùng chung thay cho mọi client khác).
- Đăng ký service id `'tts-engine'` ở cả hai `create-*-platform.ts`.

UI phân biệt nền tảng bằng capability `'tts-local'` (Electron có, Web không) chứ không dò sự tồn tại của từng method.

### UI dùng chung — `@sky-app/tts-engine-ui`

Chuyển `EngineManager` (273 dòng) + `DeviceConfig` (252 dòng) từ Ceremony sang, theo khuôn `voice-catalog-ui` (không kéo primitive của app nào, tự viết Modal/Button bằng Tailwind token).

- 18 call-site `window.slide` → `port.*` nhận qua props.
- `InfoTip` của Ceremony phụ thuộc `usePortalContainerContext` → thay bằng tooltip dùng thuộc tính `title`.
- Ghi chú "an toàn khi hành lễ" là đặc thù Ceremony → tách thành `CeremonySafetyNote.tsx` ở lại Ceremony, truyền vào qua prop `notice`.
- i18n: package export `ttsEngineLocales` dạng **object TypeScript** (không phải .json — import JSON trong package thư viện cần bật `resolveJsonModule` và tự lo copy sang `dist`, thêm mắt xích dễ hỏng). Mỗi app tự merge vào i18n instance của mình.
- TTS Studio trước đây không có i18n → thêm `src/i18n.ts`, có kiểm tra `isInitialized` để không init đè khi Ceremony đã init trước trong cùng renderer process.

### Nền tảng cho bản đóng gói

- `electron-builder.yml`: đóng gói `apps/tts-service/server/**/*.py` → `python-backend/`, kèm `requirements.txt`.
- `python-runtime.ts` (mới): tải Python relocatable từ `astral-sh/python-build-standalone` (ghim tag `20260718`, Python 3.11.15). Chọn nguồn này vì Python embeddable chính chủ **chỉ có cho Windows**. Giải nén bằng `tar` của hệ điều hành (Windows 10+ cũng có sẵn) để khỏi thêm dependency.
  - macOS: gỡ `com.apple.quarantine` sau khi giải nén, nếu không Gatekeeper chặn (app chưa code-sign).
  - Chạy thử `python -V` ngay sau khi cài để lỗi lộ ra sớm thay vì để pip fail khó hiểu.
- `installRuntime()`: `pythonBin=null` giờ nghĩa là "tự tải về", không còn là "báo lỗi không hỗ trợ".

### GPU cho bản đóng gói

Ràng buộc phải xử lý: binary PyInstaller đã **đóng băng onnxruntime bản CPU** bên trong, nên cài `onnxruntime-gpu` ra ngoài không tác động gì tới nó.

Giải pháp: khi bật tăng tốc, dựng một runtime Python rời tại `userData/tts-accel/runtime` với **trọn bộ** dependency server + gói tăng tốc, rồi `resolveAccelSpawn()` cho `python-server.ts` chạy `main.py` bằng runtime đó thay vì binary. Chỉ kích hoạt khi người dùng thực sự chọn provider khác CPU — mặc định vẫn dùng binary vì nhẹ và khởi động nhanh hơn.

May mắn: `requirements.txt` của server khá nhẹ (`vieneu`, fastapi, uvicorn, soxr, numpy — **không có torch**) nên cách này khả thi.

### Engine VoxCPM

`engine_voxcpm.py` + entry trong `_ENGINES`.

> **Sửa so với đánh giá ban đầu:** trước đó tôi kết luận VoxCPM cần binary C++ (VoxCPM.cpp) và phải dựng pipeline build đa nền tảng. **Sai** — installer đã hỗ trợ `pip_packages` sẵn, nên bản Python chính chủ (`pip install voxcpm`) cắm vào là chạy, không cần build gì.

- Dùng VoxCPM2 (2B, 48kHz — đồng nhất VieNeu). `requirements`: RAM ≥ 8GB, không bắt buộc GPU.
- `encode_reference()` trả `{wav_path, ref_text}`. `ref_text` đọc từ file `.txt` cùng tên cạnh file audio — bật chế độ *Ultimate Cloning* (biết ref nói gì thì model tách được nội dung khỏi đặc trưng giọng). Chọn quy ước file cạnh thay vì thêm trường vào registry để người dùng chỉ cần thả file là xong.
- `capabilities()` khai `slow: true` để UI cảnh báo: RTF 4.5–9.5 trên CPU nghĩa là 10 giây audio mất 45–95 giây.

## Đã kiểm chứng

- `pnpm typecheck` — 33/33 package sạch.
- `pnpm test` (ceremony) — 73/73 test pass.
- Chạy dev thật: server lên, `[TTS] Ready.`, không lỗi.
- `/engines` trả đủ 3 engine (`vieneu` installed, `moss-tts-nano` + `voxcpm` missing); `/capabilities` và `/config` trả đúng shape mà UI mới cần.
- Xác nhận bản sửa dev-path hôm trước có hiệu lực: `REF_DIR` nay trỏ vào `apps/shell-electron/resources/voice-ref` trong repo.

## CHƯA kiểm chứng — cần làm trước khi phát hành

- **Bản đóng gói**: toàn bộ phần P0 (đóng gói `python-backend`, tải Python runtime, GPU) mới chỉ đúng về mặt biên dịch. Đây là thứ **đang hỏng sẵn** nên bắt buộc `pnpm dist` rồi cài trên máy sạch để thử thật, không được suy luận.
- **macOS Gatekeeper**: việc gỡ quarantine chưa test trên máy chưa từng chạy app.
- **VoxCPM thực tế**: chưa cài (tải ~4.5GB model + ~2.5GB torch). Chưa trả lời được câu hỏi còn treo: *nó có giữ được accent Nam từ bản ghi bít tiếng `gia_bao.wav` không?* Nếu không thì kết luận vẫn là phải thu lại bản ghi.
- **Giao diện**: chưa xem bằng mắt ở cả hai app.

## Ghi chú version

Có `.changeset/tts-engine-port-dung-chung.md` (minor cho 7 package). Vì có sửa `apps/shell-electron/electron/` nên đây là **Loại 2** → khi phát hành phải thêm entry `VERSION.json` với `breaking: true` và `minAppVersion` = version mới, `detailsRef` trỏ file này.

Gộp luôn thay đổi còn treo từ hôm trước (sửa đường dẫn ref khi dev trong `python-server.ts` — xem [2026-07-27](./2026-07-27-tts-clone-accent-chat-luong-ref.md)).
