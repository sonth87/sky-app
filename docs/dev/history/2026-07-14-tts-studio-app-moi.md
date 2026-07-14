# 2026-07-14 — App mới `tts-studio`: mở rộng TtsPort thay vì port riêng

**Quyết định:** Tạo `modules/tts-studio` — app độc lập chọn giọng/tốc độ/nhập text → tạo & tải audio, đăng ký cả `apps/shell-electron` lẫn `apps/shell-web` ngay từ đầu. Đây là app đã được đặt tên trước trong `docs/apps/README.md`/`docs/guides/app-spec.md` §9 nhưng chưa code.

**Vấn đề kiến trúc:** `TtsPort.speak()` có sẵn chỉ tự phát audio, trả `Promise<void>` — không đủ vì tts-studio cần giữ audio bytes thật để lưu lịch sử (IndexedDB) + cho tải file WAV. Cân nhắc 3 hướng: (a) mở rộng `TtsPort` thêm method mới, (b) tạo `TtsStudioPort` riêng, (c) module tự gọi `window.slide`/`fetch` trực tiếp bỏ qua port. Chọn (a) — (b) trùng lặp voice-list/synth logic không cần thiết; (c) vi phạm thẳng `docs/guides/app-spec.md` §13 Anti-patterns (cấm module gọi `window.slide.*`/`ipcRenderer.*`/`fetch(localhost)` trực tiếp).

**Thêm vào `TtsPort`** (`packages/service-contracts/src/tts.ts`): `synthesizeBuffer(text, opts): Promise<{buffer, sampleRate}>` (buffer thô, không tự phát) và `getPreviewUrl(voiceId): Promise<string>` (URL nghe thử). `Voice` thêm field `gender?: string` (đã có sẵn trong response thô cả 2 platform, chỉ chưa map). Implement ở cả `platform-web/src/adapters/tts.ts` (tách helper `fetchSynthesize()` dùng chung với `speak()`) và `platform-electron/src/adapters/tts.ts`.

**Electron: IPC channel mới, không dùng chung Ceremony.** `window.slide.speak()` (channel `tts:speak`) gánh theo pregen cache theo `studentCode`, in-memory cache, activity log — logic riêng Ceremony không phù hợp. Thêm channel `tts-studio:synthesize` riêng: `apps/shell-electron/electron/slide/tts-studio.ts` (hàm `synthesizeTtsStudio()`, gọi thẳng `/synthesize` không cache/log/pregen, dùng lại `getPythonPort()` từ `python-server.ts`), handler mới trong `ipc.ts`, method `synthesizeTts` mới trong `SlideApi`/`preload.ts`. `getTtsPreviewUrl` đã có sẵn từ trước — tái dùng nguyên vẹn.

**Phát hiện phụ (không sửa, chỉ ghi nhận):** test `platform-electron/src/__tests__/create-electron-platform.test.ts` đang fail sẵn từ trước khi bắt đầu việc này — mock `window.sky.invoke('kernel:tts:speak', ...)` nhưng code thật đã migrate sang `window.slide.speak(...)` (comment trong `adapters/tts.ts` xác nhận đây là thay đổi có chủ đích, test chưa cập nhật theo). Sửa luôn trong lúc thêm test mới cho `synthesizeBuffer`/`getPreviewUrl` (cùng file, không thể để test đỏ tồn tại trong file đang sửa).

**Lịch sử lưu IndexedDB, không localStorage:** audio 48kHz PCM ~1MB/10s vượt hạn mức localStorage (~5-10MB) sau vài bản ghi. Giữ tối đa 30 bản ghi, tự prune bản cũ nhất. Cài thêm `fake-indexeddb` (devDependency) để test được trong Node/CI.

**Voice list: chỉ dùng 6 cloned voices có sẵn, không đụng server Python.** `GET /voices` mặc định ẩn 10 preset voices (`hidden: true`). Có `PUT /voices/{id}` để unhide nhưng đó là thay đổi state phía server dùng chung với Ceremony, ngoài phạm vi — ghi lại trong `docs/apps/tts-studio.md` để không quên nếu sau này cần.

**Kết quả verify:** `pnpm -r run typecheck` sạch toàn workspace (bao gồm cả 2 shell). Test: `service-contracts`/`platform-web` (17 test, bao gồm 3 test mới cho `synthesizeBuffer`/`getPreviewUrl`/`gender`)/`platform-electron` (12 test, bao gồm sửa 1 test cũ + 4 test mới)/`module-tts-studio` (9 test: `wav-encode`, `history-db` với prune 30 bản ghi, `TtsStudioApp` degrade khi thiếu service `tts`) đều pass. Build sạch. Chưa verify UI thật bằng screenshot (môi trường không có `chromium-cli`/trình duyệt headless) — chỉ xác nhận qua `curl` rằng bundle Vite resolve đúng không lỗi 404/500; UI thật do người dùng tự kiểm tra qua `pnpm run dev`.

**Liên quan:** `docs/apps/tts-studio.md`, `docs/guides/app-spec.md` §9, `docs/reference/contract-reference.md`.
