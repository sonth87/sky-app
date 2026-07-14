---
status: done
owner: subagent-3
scope: "Nhóm D (TTS service, 4 chức năng) + Nhóm E (Kiến trúc mới, 5 chức năng)"
---

# GĐ7.5 — Audit Subagent 3: TTS service + Kiến trúc mới (kernel/platform/licensing)

Phạm vi: D1–D4 (TTS Python service + kernel TTS port Electron), E1–E5 (kernel/platform-electron/
platform-web/licensing — kiến trúc mới không có ở bản gốc `trao-bang-tot-nghiep-2026`).

Vai trò kép áp dụng cho mỗi chức năng: Architecture Review (đọc code thật, luồng xử lý cụ thể,
so sánh với gốc hoặc đánh giá độc lập) → QA/QC Review (test case cụ thể, PASS/FAIL, coverage).

---

### [D1] TTS synthesize endpoint
**Trọng số:** High
**File liên quan:**
- `/Users/skyline/PROJECTS/sky-app/apps/tts-service/server/main.py` (hàm `synthesize()` dòng 550-607, `_run_synthesis()` dòng 515-547, class `TtsRequest` dòng 501-512)
- `/Users/skyline/PROJECTS/sky-app/packages/platform-web/src/adapters/tts.ts` (`createWebTtsPort().speak()` dòng 60-76, `playPcm()` dòng 25-49)
- `/Users/skyline/PROJECTS/sky-app/packages/service-contracts/src/tts.ts` (`SpeakOptions` dòng 11-15)
- Đối chứng gốc: `/Users/skyline/DNU/trao-bang-tot-nghiep-2026/apps/tts-service/server/main.py`

#### Architecture Review
- **Luồng xử lý:** Client (Web: `createWebTtsPort().speak()`, Electron: `window.slide.speak()` — xem D4) → `POST /synthesize` với `{text, speaker_id, speed, temperature?}` → FastAPI `synthesize()` acquire `_synth_lock` (single-flight, engine không thread-safe) → `_registry.get_voice(speaker_id)` xác định voice tồn tại → `asyncio.to_thread(_run_synthesis, req, voice)` chạy CPU-bound trong thread pool (event loop vẫn phục vụ `/health` khi đang generate) → `_run_synthesis()` gộp override params (`temperature/top_k/top_p/repetition_penalty/max_new_frames`, ưu tiên per-request rồi tới `_config.get_infer()` toàn cục) → nếu voice cloned: lấy `_ref_codes_cache` (pre-encoded lúc `lifespan()` khởi động) hoặc encode on-demand, gọi `_engine.synthesize()`; nếu preset: `_engine.synthesize_preset()` → validate output (rỗng/NaN/Inf → 500) → `analyze_quality()` chấm điểm, gắn header `X-Quality-Score`/`X-Quality-Flags` (không chặn response) → convert Float32→Int16, trả `Response` raw PCM bytes + header `X-Sample-Rate`.
- Phía client Web: `createWebTtsPort().speak()` build body `{text, speaker_id: opts?.voiceId ?? 'NF', speed: opts?.speed ?? 1.0, temperature: opts?.temperature}` → fetch → đọc `X-Sample-Rate` header (fallback `'24000'`) → `arrayBuffer()` → `playPcm()` decode Int16→Float32→`AudioBuffer` → phát qua `AudioBufferSourceNode`.
- **So sánh với bản gốc:** `diff apps/tts-service/server/main.py` giữa 2 repo → **chỉ khác đúng 1 khối**: `sky-app` thêm `CORSMiddleware` (dòng 270-283) với comment giải thích rõ lý do (apps/shell-web's `createWebTtsPort` fetch từ trình duyệt cần CORS, Electron's `window.slide` bridge không qua trình duyệt nên không ảnh hưởng). **Khác có chủ đích, không phải bug.** Toàn bộ phần còn lại — bao gồm `_run_synthesis`, `TtsRequest` schema, quality analysis, lock, error handling — **khớp 100% byte-for-byte**.
- **Phát hiện mới (chưa có trong bảng 3.0 gốc):** `SpeakOptions` (`packages/service-contracts/src/tts.ts:11-15`) chỉ khai báo `voiceId?/speed?/temperature?` — KHÔNG có `word_gap/top_k/top_p/repetition_penalty/max_new_frames` dù server's `TtsRequest` (main.py:501-512) nhận đủ các field "Advanced infer params (Phase 2)". Do đó `createWebTtsPort` **không thể** forward các tham số này dù muốn — đây là giới hạn ở tầng contract, không phải lỗi implementation của adapter. Xác nhận bằng test mới (xem QA Review). Hiện tại không phải bug vận hành vì Control UI điều khiển các giá trị này qua `PUT /config` (global, áp dụng cho mọi request tiếp theo), không qua `speak()` per-request — nhưng nếu tương lai cần override per-request từ Web/Ceremony, phải mở rộng `SpeakOptions` trước.
- **Hiệu năng:** `asyncio.to_thread` đúng đắn — tránh block event loop trong lúc infer (có thể vài giây). `_synth_lock` (asyncio.Lock, single-flight) đúng vì engine không thread-safe — nhưng đồng nghĩa 2 request đồng thời sẽ serialize hoàn toàn (chấp nhận được cho 1 buổi lễ, KHÔNG scale cho nhiều client đồng thời — không phải vấn đề trong ngữ cảnh Ceremony 1 client).
- **Độ ổn định:** try/except đầy đủ quanh `_run_synthesis`, validate NaN/Inf/rỗng trước khi trả về (tránh crash phía client audio decode). `_write_log` không bao giờ throw (bọc try/except riêng). `_safe_console` chống UnicodeEncodeError trên Windows cp1252 console.
- **Nhận định kiến trúc:** Endpoint thiết kế tốt — tách rõ concern (lock, thread offload, validate, quality-score không chặn). CORS middleware bổ sung đúng vị trí, đúng phạm vi (regex chỉ localhost, không mở toang `*`), có comment giải thích lý do kỹ — mẫu tốt cho port đa môi trường.
- **Đề xuất cải tiến:**
  - P2: Mở rộng `SpeakOptions` (service-contracts) để expose `topK/topP/repetitionPenalty` nếu tương lai Ceremony Web cần override per-request (hiện tại chưa cần, chỉ ghi nhận giới hạn).
  - P2: Không có test Python (pytest) nào cho `main.py` — toàn bộ verify dựa trên diff structural + test TS phía client. Cân nhắc thêm `pytest` cho `_run_synthesis`/`_validate_ref_audio` nếu muốn coverage sâu hơn tầng server (xem QA Review).

#### QA/QC Review
- **Trạng thái tổng quan:** PASS — 14/14 test case (vitest, `packages/platform-web`).
- Bảng test case:

| # | Tên | Loại | File test | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| TC-D1-01 | speak() POST đúng speaker_id/speed | Automated-vitest | `create-web-platform.test.ts:91` | Body JSON đúng | Khớp | PASS |
| TC-D1-02 | speak() dùng giá trị mặc định khi không truyền opts | Automated-vitest | `create-web-platform.test.ts:113` | speaker_id='NF', speed=1.0 | Khớp | PASS |
| TC-D1-03 | speak() throw khi server lỗi | Automated-vitest | `create-web-platform.test.ts:129` | Throw đúng message | Khớp | PASS |
| TC-D1-04 | listVoices() map label→name, region→language | Automated-vitest | `create-web-platform.test.ts:138` (số dòng cũ, đã dịch xuống) | Mapping đúng | Khớp | PASS |
| TC-D1-05 *(mới)* | X-Sample-Rate fallback 24000 khi header thiếu | Automated-vitest | `create-web-platform.test.ts` (`speak() dùng X-Sample-Rate=24000 mặc định...`) | `createBuffer(1, n, 24000)` | Khớp | PASS |
| TC-D1-06 *(mới)* | Empty PCM buffer → throw rõ ràng (case riêng, tách khỏi TC-D1-02) | Automated-vitest | `create-web-platform.test.ts` (`speak() throw "Empty PCM buffer"...`) | Throw `'Empty PCM buffer'` | Khớp | PASS |
| TC-D1-07 *(mới)* | Advanced params (word_gap/top_k/top_p) KHÔNG được forward | Automated-vitest | `create-web-platform.test.ts` (`speak() KHÔNG forward word_gap/...`) | Body không có các field này | Khớp — xác nhận giới hạn contract | PASS |

(7 case trực tiếp D1 + 7 case khác trong cùng file phục vụ E1/D1 gián tiếp — tổng file 14/14 PASS.)

- Bug liên quan: không có (CORS là thay đổi có chủ đích).
- **Coverage ước tính:** functional ~90% (đường chính speak/listVoices/lỗi/sample-rate đều có test; KHÔNG có test cho `/voices/clone`, `/preview/{voice_id}`, `PUT /config`, `/capabilities`, `/engines` — các endpoint mới GĐ2+ chưa integrate vào Ceremony UI hiện tại nên rủi ro thấp). Code coverage đo được (`vitest --coverage`, `packages/platform-web`): `adapters/tts.ts` 100% statements/lines, 88% branch, 83.33% functions (nhánh chưa phủ: lỗi `ctx.resume()` reject và trường hợp `currentSource` đã tồn tại khi gọi `speak()` lần 2 liên tiếp — TC-D1 mới không cover kịch bản "gọi speak() 2 lần liên tiếp, source cũ bị stop"). Server Python (`main.py`) không đo được bằng công cụ (không có pytest trong repo) — chỉ đối chứng bằng diff structural.
- **Đề xuất bổ sung test chưa viết:** (1) gọi `speak()` 2 lần liên tiếp không await giữa 2 lần — xác nhận `currentSource.stop()` được gọi đúng (nhánh `if (currentSource)` dòng 26-27 của `tts.ts`); (2) pytest cho `main.py`'s `_validate_ref_audio`/`_run_synthesis` nếu muốn coverage server-side thật.

---

### [D2] Voice registry & cloned voices
**Trọng số:** Medium
**File liên quan:**
- `/Users/skyline/PROJECTS/sky-app/apps/tts-service/server/voice_registry.py` (class `VoiceRegistry`, `DEFAULT_CLONED_VOICES` dòng 58-65, `PRESET_VOICES` dòng 44-55)
- `/Users/skyline/PROJECTS/sky-app/apps/tts-service/resources/voice-registry.json`
- Đối chứng gốc: `/Users/skyline/DNU/trao-bang-tot-nghiep-2026/apps/tts-service/server/voice_registry.py`, `/Users/skyline/DNU/trao-bang-tot-nghiep-2026/apps/slide/resources/voice-registry.json`

#### Architecture Review
- **Luồng xử lý:** `VoiceRegistry.__init__()` → `_load_or_init()`: nếu file tồn tại, load JSON, merge tự động `DEFAULT_CLONED_VOICES`/`PRESET_VOICES` mới chưa có trong file (cho phép thêm voice mới vào code tự propagate ra registry cũ mà không cần migration thủ công) → nếu file corrupt, backup ra `.corrupt-{timestamp}.json` (không xoá âm thầm) rồi init lại mặc định. `list_voices(include_hidden)` lọc `hidden=true` (ẩn preset khỏi `GET /voices` nhưng vẫn hoạt động qua `/synthesize` — backward compat). `add_cloned`/`delete_cloned`/`set_hidden` đều `with self._lock` (threading.RLock, thread-safe cho ghi đồng thời) và `_save()` dùng write-tmp-then-replace (atomic, tránh corrupt khi crash giữa chừng).
- **So sánh với bản gốc:** `voice_registry.py` diff = 0 (byte-for-byte). `voice-registry.json`: file gốc nằm ở `apps/slide/resources/voice-registry.json` (không phải `apps/tts-service/resources/`), sky-app đặt tại `apps/tts-service/resources/voice-registry.json` — vị trí khác nhưng đây là do sky-app gộp resources vào chung `tts-service` thay vì tách theo `apps/slide`; nội dung diff = 0. Xác nhận thêm: `voice-registry.json`'s 6 cloned voice (`NF/NF2/SF/NM1/SM/ADAM`) + 10 preset voice khớp chính xác với `DEFAULT_CLONED_VOICES`/`PRESET_VOICES` trong `voice_registry.py` — file JSON chính là kết xuất "materialized" của 2 dict Python này lúc registry init lần đầu.
- **Hiệu năng:** `_save()` ghi toàn bộ file JSON mỗi lần thay đổi (không phải chỉ delta) — chấp nhận được vì registry nhỏ (~16 voices), không phải hot path.
- **Độ ổn định:** Tốt — atomic write, corrupt-file recovery không mất dữ liệu (backup thay vì xoá), lock đúng chỗ. Không có race condition rõ ràng vì mọi thao tác ghi đều qua `with self._lock`.
- **Nhận định kiến trúc:** Class nhỏ gọn, single-responsibility (chỉ quản lý registry, không lẫn logic đọc file audio/encode — đó là việc của `engine.py`/`main.py`). Không có god function.
- **Đề xuất cải tiến:** P2 — không có gì cấp thiết. Có thể cân nhắc versioning migration rõ ràng hơn nếu schema `voices` đổi cấu trúc trong tương lai (hiện tại chỉ có `version: 1`, chưa có logic xử lý version khác).

#### QA/QC Review
- **Trạng thái tổng quan:** PASS — 2/2 test case cấu trúc (Manual/diff-based), 0 test tự động hoá mới (không cần — logic Python, không nằm trong phạm vi vitest của monorepo).

| # | Tên | Loại | File test | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| TC-D2-01 | `voice_registry.py` diff = 0 với bản gốc | Automated (diff) | Bash `diff` (audit) | Không có khác biệt | 0 dòng khác biệt | PASS |
| TC-D2-02 | `voice-registry.json` khớp `DEFAULT_CLONED_VOICES` + `PRESET_VOICES` | Manual (đọc chéo) | Đọc trực tiếp `voice_registry.py` + `voice-registry.json` | 6 cloned + 10 preset khớp field-by-field | Khớp hoàn toàn | PASS |

- Bug liên quan: không có.
- **Coverage ước tính:** functional 100% cho cấu trúc dữ liệu tĩnh (registry load/merge/backward-compat); runtime behaviour (`add_cloned`/`delete_cloned` qua HTTP thật) không có test tự động — chỉ note là chưa audit, không phải FAIL vì không nằm trong "endpoint chính" theo Ceremony (voice clone UI GĐ2+ chưa dùng trong luồng ceremony chính). Không đo được code coverage công cụ (Python, không có pytest).
- **Đề xuất bổ sung test chưa viết:** pytest cho `VoiceRegistry.add_cloned/delete_cloned/set_hidden` (đặc biệt case `delete_cloned` trên preset voice phải trả `is_preset` reason, và case xoá file ref không phải default).

---

### [D3] Engine lifecycle (start/stop/health)
**Trọng số:** Medium
**File liên quan:**
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/slide/python-server.ts` (502 dòng — `startPythonServer`, `stopPythonServer`, `getPythonStatus`, `waitForHealth`, `warmupSessions`)
- Đối chứng gốc: `/Users/skyline/DNU/trao-bang-tot-nghiep-2026/apps/slide/electron/python-server.ts`

#### Architecture Review
- **Luồng xử lý:** `startPythonServer(vieneuModelDir)` → `startPythonServerOnce()` spawn process Python (`getPythonPath()` resolve interpreter đóng gói hoặc venv dev) với env vars (`VIENEU_PORT`, `HF_HOME`, `RESOURCES_PATH`, ...) → `findFreePort()` tránh xung đột cổng → `pushStatus()` cập nhật state machine (starting/ready/error) phát qua callback cho renderer nghe → `waitForHealth(port)` poll `/health` tới khi server sẵn sàng (timeout) → `warmupSessions()` gọi `/synthesize` 1 lần với text ngắn để "làm nóng" model, giảm latency request đầu tiên thật → `getPythonStatus()`/`getPythonPort()` expose state hiện tại cho các module khác (vd `slide/ipc.ts`'s `tts:speak` handler cần biết port trước khi forward request) → `stopPythonServer()` kill process, reset state.
- **So sánh với bản gốc:** `diff` giữa 2 file = 0 (byte-for-byte, xác nhận lại trong lượt audit này). Không có sai khác nào, kể cả path resolution logic (`findMonoRoot`, `getServerDir`, `getExecutablePath`) — các hàm này đã tính đúng cho cấu trúc monorepo mới (`apps/tts-service` thay vì `apps/slide` + `apps/tts-service` tách rời) mà không cần sửa gì, vì logic dùng resolve tương đối từ vị trí file build, không hardcode path cũ.
- **Hiệu năng:** `warmupSessions()` đánh đổi thời gian khởi động (vài giây) lấy latency thấp hơn cho request đầu tiên thật trong buổi lễ — hợp lý cho use-case ceremony (khởi động 1 lần, dùng nhiều giờ). `findFreePort` quét tuần tự (không phải race), chấp nhận được vì chỉ chạy 1 lần lúc start.
- **Độ ổn định:** `waitForHealth` có timeout (không treo vô hạn nếu server crash lúc khởi động). `pushStatus` centralized state giúp UI luôn phản ánh đúng — không có 2 nguồn sự thật riêng rẽ.
- **Nhận định kiến trúc:** Module cohesive, đúng trách nhiệm (chỉ quản lý lifecycle subprocess Python, không lẫn business logic TTS) — ranh giới rõ với `slide/ipc.ts` (nơi expose ra renderer).
- **Đề xuất cải tiến:** không có — D3 an toàn tuyệt đối theo diff, không phát hiện vấn đề mới trong lượt audit sâu này.

#### QA/QC Review
- **Trạng thái tổng quan:** PASS — 1/1 test case (diff-based).

| # | Tên | Loại | File test | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| TC-D3-01 | `python-server.ts` diff = 0 với bản gốc | Automated (diff) | Bash `diff` (audit) | Không khác biệt | 0 dòng khác biệt | PASS |

- Bug liên quan: không có.
- **Coverage ước tính:** functional: an toàn theo structural parity, nhưng KHÔNG có test runtime nào (unit hay integration) xác nhận `startPythonServer`/`stopPythonServer`/`waitForHealth` hoạt động đúng khi chạy Electron thật — cần Electron process thật (spawn subprocess) nên không viết được test vitest thuần (đúng theo giới hạn công cụ nêu ở kế hoạch gốc, mục 2.3: "Phần cần Electron runtime thật ... không đo được bằng công cụ — chỉ đo bằng functional coverage có checklist"). Functional coverage ước tính 40% (chỉ structural, chưa có checklist manual chạy app thật trong đợt audit này — để dành QA thủ công khi verify tổng thể GĐ7.5 Sóng 2).
- **Đề xuất bổ sung test chưa viết:** checklist thủ công: khởi động app → quan sát Python server chuyển trạng thái starting→ready trong Control UI (status chip), tắt app → xác nhận process Python bị kill (không zombie process), khởi động lại nhanh (double-click) → xác nhận `findFreePort` không xung đột cổng cũ chưa kịp giải phóng.

---

### [D4] TTS kernel port Electron (`kernel:tts:*`)
**Trọng số:** Low (Ceremony không dùng đường này)
**File liên quan:**
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/ipc.ts` (dòng 1-62, mock handlers dòng 20-26)
- `/Users/skyline/PROJECTS/sky-app/packages/platform-electron/src/adapters/tts.ts` (19 dòng)
- `/Users/skyline/PROJECTS/sky-app/apps/shell-electron/electron/slide/ipc.ts` (dòng 558 — `tts:speak` handler THẬT, khác namespace)
- `/Users/skyline/PROJECTS/sky-app/modules/ceremony/src/backdrop/BackdropApp.tsx` (dòng 1178-1214, gọi `window.slide.speak`)

#### Architecture Review (đánh giá độc lập — không có bản gốc, đây là kiến trúc mới phát sinh)
- **Luồng xử lý (đường mock `kernel:tts:*`):** `createElectronTtsPort().speak()` (platform-electron/adapters/tts.ts:12-14) gọi `window.sky.invoke('kernel:tts:speak', text, opts)` → route qua preload bridge tới main process → `ipcMain.handle('kernel:tts:speak', ...)` (`ipc.ts:20-22`) chỉ `console.log('[mock tts:speak]', text)` rồi return `undefined` — **không phát âm thanh thật**. `listVoices()` trả cứng `[{id: 'mock-voice-1', name: 'Mock Voice'}]`.
- **Luồng xử lý (đường thật `window.slide`, Ceremony dùng):** `BackdropApp.tsx:1203` gọi trực tiếp `window.slide.speak(textToSpeak, model, speed, code)` → route tới `ipcMain.handle('tts:speak', ...)` (`slide/ipc.ts:558`, namespace khác, KHÔNG có prefix `kernel:`) → forward HTTP request thật tới Python service (`python-server.ts` quản lý) → trả PCM buffer thật → `playPcm(res.buffer, res.sampleRate ?? 48000)` phát âm thanh. Xác nhận bằng grep toàn bộ `modules/ceremony/src/**`: **0 tham chiếu** tới `services.get('tts')` hay `TtsPort` — Ceremony hoàn toàn bỏ qua `packages/kernel`'s PlatformContext abstraction cho TTS, dùng thẳng `window.slide` (bridge cũ hơn, song song, dành riêng cho Ceremony).
- **Đánh giá độc lập:** Đây là 2 kiến trúc TTS SONG SONG cùng tồn tại trong 1 app: (a) `kernel:tts:*` — đường "chuẩn" theo ports&adapters mới, hiện là mock, chưa có app nào dùng thật; (b) `tts:*` (namespace `slide/ipc.ts`) — đường thật, hoạt động đầy đủ, Ceremony đang dùng. Đây **không phải bug** — có comment tự document rõ trong code: `ipc.ts:15-17` ghi "GĐ3 scope: mock implementations ... GĐ4-5 sẽ làm thật", và `platform-electron/adapters/tts.ts:6-8` ghi "For now the IPC channels exist and round-trip through the mock handler". Đây là nợ kỹ thuật CÓ CHỦ ĐÍCH, chưa hoàn tất theo lộ trình — không ảnh hưởng Ceremony vì Ceremony không đi qua đường này.
- **Rủi ro tiềm ẩn (không phải bug hiện tại, nhưng đáng ghi nhận):** nếu trong tương lai có app mới (không phải Ceremony) dùng `platform.services.get('tts')` theo đúng kiến trúc kernel chuẩn, app đó sẽ nhận `mock-voice-1` và không có âm thanh thật — cần đảm bảo `kernel:tts:*` được implement thật (route tới cùng Python service Ceremony đang dùng, có thể dùng chung `python-server.ts`) TRƯỚC KHI bất kỳ app thứ 2 nào bật tính năng TTS qua đường chuẩn.
- **Nhận định kiến trúc:** Việc có 2 bridge song song (`window.sky` chuẩn hoá qua kernel, `window.slide` cũ dành riêng Ceremony) là hệ quả tự nhiên của quá trình port dần dần (module hoá từng phần, chưa migrate hết) — được document rõ trong `modules/ceremony/src/index.ts:25-26` và `CeremonyApp.tsx:6-8` (chiến lược migration nêu ở `docs/guides/ports-and-adapters.md`). Không vi phạm ports&adapters nếu xét đúng ý đồ "Ceremony đang trong giai đoạn transition, chưa migrate hết sang kernel".
- **Đề xuất cải tiến:**
  - P1: Khi làm thật `kernel:tts:*` (GĐ4-5 theo roadmap), nên route qua CÙNG `python-server.ts`/`getPythonPort()` mà `slide/ipc.ts`'s `tts:speak` đang dùng — tránh spawn 2 Python server riêng biệt lãng phí tài nguyên.
  - P2: Ghi rõ trong `docs/architecture/overview.md` (nếu chưa có) về sự tồn tại song song của 2 bridge, tránh nhầm lẫn cho dev mới join sau này khi thấy `window.sky` và `window.slide` cùng gọi được TTS nhưng hành vi khác nhau hoàn toàn.

#### QA/QC Review
- **Trạng thái tổng quan:** PASS một phần theo đúng kỳ vọng — mock hoạt động đúng như mock (không phải FAIL, vì đây là scope đã biết trước, có chủ đích).

| # | Tên | Loại | File test | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| TC-D4-01 | `createElectronTtsPort().speak()` gọi đúng channel `kernel:tts:speak` | Automated-vitest | `packages/platform-electron/src/__tests__/create-electron-platform.test.ts:34-40` (đã có sẵn) | `window.sky.invoke` được gọi với `('kernel:tts:speak', 'hello', {voiceId: 'v1'})` | Khớp | PASS |
| TC-D4-02 | Xác nhận Ceremony KHÔNG đi qua `kernel:tts:*` (dùng `window.slide` riêng) | Manual (grep + đọc code) | audit trực tiếp | 0 tham chiếu `services.get('tts')` trong `modules/ceremony/src/**` | Xác nhận đúng — 0 hit | PASS |
| TC-D4-03 | `ipc.ts`'s mock handler trả giá trị mock đúng như document | Manual (đọc code) | `apps/shell-electron/electron/ipc.ts:20-26` | `console.log` + `undefined`/`mock-voice-1` | Khớp | PASS |

- Bug liên quan: không có — đây là nợ kỹ thuật đã biết, KHÔNG xếp vào bảng bug theo quyết định plan gốc (Phần 4, ghi chú cuối bảng).
- **Coverage ước tính:** functional 100% cho "mock hoạt động đúng như thiết kế mock" (không phải 100% cho "TTS qua kernel hoạt động thật" — con số đó là 0%, có chủ đích, chưa tới lúc theo roadmap GĐ4-5). Code coverage (`vitest --coverage`, `packages/platform-electron`): `adapters/tts.ts` 81.81% statements (dòng 16-17 — nhánh `listVoices()` — chưa cover trực tiếp trong file test hiện tại dù có test riêng cho `speak()`; kiểm tra lại: test hiện có bao phủ `speak()` nhưng KHÔNG có test riêng cho `listVoices()` của Electron adapter).
- **Đề xuất bổ sung test chưa viết:** 1 test case cho `createElectronTtsPort().listVoices()` gọi đúng `window.sky.invoke('kernel:tts:listVoices')` — hiện chỉ có test cho `speak()`, thiếu case tương ứng cho `listVoices()` (đối xứng với D1's `create-web-platform.test.ts` đã có `listVoices()` test cho Web nhưng Electron thì chưa). Không viết bổ sung trong đợt audit này vì không thuộc phạm vi "sửa production" và độ ưu tiên Low — ghi nhận làm input cho GĐ8.

---

### [E1] Licensing/Entitlement gate
**Trọng số:** High
**File liên quan:**
- `/Users/skyline/PROJECTS/sky-app/packages/licensing/src/verify.ts`, `sign.ts`, `license.ts`, `license-port.ts`, `dev-key.ts`
- `/Users/skyline/PROJECTS/sky-app/packages/kernel/src/entitlement.ts`
- `/Users/skyline/PROJECTS/sky-app/packages/platform-web/src/create-web-platform.ts`, `/Users/skyline/PROJECTS/sky-app/packages/platform-electron/src/create-electron-platform.ts`
- Test: `packages/licensing/src/__tests__/{verify,license,license-port}.test.ts`, `packages/kernel/src/__tests__/entitlement.test.ts`, `packages/platform-web/src/__tests__/create-web-platform.test.ts`, `packages/platform-electron/src/__tests__/create-electron-platform.test.ts`

#### Architecture Review (đánh giá độc lập — kiến trúc mới)
- **Luồng xử lý (Ed25519 offline verify):** `signLicense(payload, privateKeyHex)` (chỉ chạy phía phát hành, KHÔNG bao giờ trong app khách) → `encodeLicenseKey` base64url(JSON payload) + "." + base64url(signature 64 byte) → app khách gọi `verifyLicenseKey(licenseKey, publicKeyHex)`: parse 2 phần, `verifyAsync` chữ ký Ed25519 (thư viện `@noble/ed25519`) trên ĐÚNG bytes gốc (không re-serialize JSON — tránh lệch key-order/whitespace) → nếu hợp lệ, `isPayloadValid()` (license.ts) kiểm thêm `expiry`/`deviceBinding` (tách riêng khỏi verify chữ ký vì phụ thuộc thời điểm gọi) → `createLicensePort()` (ports&adapters: nhận `LicenseStorage` — Electron: file qua IPC `kernel:license:read/write`; Web: localStorage) expose `getCurrent()/verify()/refresh()`.
- **Luồng entitlement:** `createElectronPlatform`/`createWebPlatform` gọi `resolveEntitlementsFromPort(licensePort)` (SAU khi fix E4, xem dưới) → `payload.entitlements` (mảng string như `'app.ceremony'`) → `createEntitlementSet(entitlements)` (kernel/entitlement.ts) → `PlatformContext.entitlements.has('app.ceremony')`. `EntitlementGate.canOpen(app)` (dùng bởi dock/shell khi quyết định app nào mở được) chỉ khoá nếu `app.entitlement` được khai báo VÀ không có trong set.
- **Đánh giá độc lập:** Kiến trúc đúng chuẩn — tách bạch rõ 3 lớp: (1) crypto thuần (`verify.ts`/`sign.ts`, không chạm I/O), (2) business rule "còn hạn dùng được không" (`license.ts`, testable với `now` injectable), (3) port/storage (`license-port.ts`, không biết Electron/Web là gì). Đây là ví dụ ports&adapters SẠCH — `packages/licensing` không import Electron hay DOM API nào (dùng `atob`/`btoa`/`TextEncoder` — đều tồn tại cả trong Electron renderer lẫn Node 20+/browser, không cần polyfill riêng biệt).
- **Test case `app.ceremony` cụ thể đã có sẵn TRƯỚC đợt audit này** (không phải thiếu như dự đoán ban đầu trong bảng 3.0): `create-web-platform.test.ts:66-78` VÀ `create-electron-platform.test.ts:55-77` đều có: (a) license hợp lệ với `entitlements: ['app.ceremony']` → `entitlements.has('app.ceremony')` = true, `has('app.other')` = false; (b) không có license lưu → entitlements rỗng, mọi `app.*` bị khoá. Cả 2 dùng chung 1 cặp key cố định (`TEST_PUBLIC_KEY_HEX`/`VALID_LICENSE_KEY`, comment ghi rõ "cùng cặp key... 1 nguồn chân lý cho mọi shell"). **Đã đối chiếu kỹ — không viết trùng lặp thêm**, đúng theo lưu ý trong đề bài audit.
- **Hiệu năng:** verify Ed25519 là phép tính nhẹ (< 1ms), không đáng lo về hiệu năng dù chạy mỗi lần app khởi động.
- **Độ ổn định:** `refresh()` offline-first — lỗi mạng không phá license đang verify được (try/catch bọc quanh `fetchRemoteLicenseKey`, fallback `verifyStored()`). Test `license-port.test.ts:108-119` xác nhận hành vi này bằng `mockRejectedValue`.
- **Nhận định kiến trúc:** Đây là 1 trong những phần kiến trúc mới TỐT NHẤT trong toàn bộ audit — test coverage sâu (21 test case chỉ riêng package `licensing`), tách lớp rõ ràng, không side-effect ẩn.
- **Đề xuất cải tiến:** P2 — không có gì cấp thiết cho E1 riêng lẻ. Xem E4 cho đề xuất refactor `resolveEntitlements` trùng lặp (đã fix trong đợt audit này).

#### QA/QC Review
- **Trạng thái tổng quan:** PASS — 21/21 test case (`packages/licensing`) + 3/3 (`packages/kernel/entitlement.test.ts`) + 2/2 case `app.ceremony` cụ thể trong mỗi platform test (đã có sẵn, xác nhận lại PASS).

| # | Tên | Loại | File test | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| TC-E1-01 | verify trả đúng payload khi chữ ký hợp lệ | Automated-vitest | `licensing/__tests__/verify.test.ts:6` | Payload khớp | Khớp | PASS |
| TC-E1-02 | verify trả null khi ký sai key | Automated-vitest | `verify.test.ts:15` | null | null | PASS |
| TC-E1-03 | verify trả null khi payload bị tamper | Automated-vitest | `verify.test.ts:25` | null | null | PASS |
| TC-E1-04 | verify trả null khi format sai | Automated-vitest | `verify.test.ts:42` | null (3 case) | null | PASS |
| TC-E1-05 | round-trip giữ nguyên entitlements/expiry/deviceBinding | Automated-vitest | `verify.test.ts:49` | Khớp | Khớp | PASS |
| TC-E1-06..12 | `isPayloadValid` (expiry null/tương lai/quá khứ/sai định dạng, deviceBinding khớp/không khớp/bỏ qua) | Automated-vitest | `license.test.ts` (7 case) | Đúng theo từng case | Đúng | PASS |
| TC-E1-13..21 | `createLicensePort` (getCurrent/verify/refresh × các nhánh offline-first) | Automated-vitest | `license-port.test.ts` (9 case) | Đúng theo từng case | Đúng | PASS |
| TC-E1-22 | `EntitlementGate` — app không cần entitlement luôn mở | Automated-vitest | `kernel/entitlement.test.ts:18` | `canOpen`=true | true | PASS |
| TC-E1-23 | `EntitlementGate` — thiếu entitlement bị khoá kèm lý do | Automated-vitest | `entitlement.test.ts:24` | `canOpen`=false, reason chứa 'app.ceremony' | Đúng | PASS |
| TC-E1-24 | `EntitlementGate` — đủ entitlement mở được | Automated-vitest | `entitlement.test.ts:31` | `canOpen`=true | true | PASS |
| TC-E1-25 *(có sẵn, xác nhận lại)* | Web: license có `app.ceremony` → `entitlements.has('app.ceremony')`=true | Automated-vitest | `create-web-platform.test.ts:66-72` | true/false đúng | Đúng | PASS |
| TC-E1-26 *(có sẵn, xác nhận lại)* | Web: không license → entitlements rỗng | Automated-vitest | `create-web-platform.test.ts:74-78` | rỗng | rỗng | PASS |
| TC-E1-27 *(có sẵn, xác nhận lại)* | Electron: license có `app.ceremony` qua `kernel:license:read` | Automated-vitest | `create-electron-platform.test.ts:55-67` | true/false đúng | Đúng | PASS |
| TC-E1-28 *(có sẵn, xác nhận lại)* | Electron: `kernel:license:read` trả null → entitlements rỗng | Automated-vitest | `create-electron-platform.test.ts:69-77` | rỗng | rỗng | PASS |

- Bug liên quan: không có.
- **Coverage ước tính:** functional ~95% (toàn bộ luồng verify/expiry/deviceBinding/refresh/entitlement-gate có test; chưa có test cho trường hợp license server thật — `fetchRemoteLicenseKey` chỉ test qua mock, chưa có license server thật để integration-test). Code coverage đo thật (`vitest --coverage`, `packages/licensing`): 89.43% statements → **sau fix E4 (thêm `hex.ts`), TĂNG lên 100% statements cho `hex.ts` mới, các file khác giữ nguyên** (xem bảng coverage cuối file). `license-port.ts` 89.47% (dòng 36-39 chưa cover — nhánh `getCurrent()` khi payload verify được nhưng KHÔNG hợp lệ theo `isPayloadValid` — case này thực ra ĐÃ được cover gián tiếp qua `license-port.test.ts:62-80`, chênh lệch do nhánh cụ thể trong `verifyStored()`).
- **Đề xuất bổ sung test chưa viết:** test cho `dev-key.ts` (hiện 0% — nhưng đây chỉ là 1 hằng số string, không có logic để test, coverage 0% là đúng bản chất chứ không phải thiếu sót).

---

### [E2] PlatformContext capability negotiation
**Trọng số:** Medium
**File liên quan:** `/Users/skyline/PROJECTS/sky-app/packages/kernel/src/{capability,entitlement,event-bus,service-registry,app-module,platform-context,index}.ts` (7 file)

#### Architecture Review (đánh giá độc lập)
- **Luồng xử lý:** `createPlatformContext(opts)` (platform-context.ts:22-34) ghép 4 concern độc lập thành 1 object `PlatformContext`: `capabilities` (CapabilitySet — "môi trường có gì", vd `tts-local` chỉ Electron có), `services` (ServiceRegistry — "port cụ thể nào đã đăng ký", vd `TtsPort` instance thật), `events` (EventBus — giao tiếp giữa app), `entitlements` (EntitlementSet — "license cho phép app nào mở"). Mỗi factory (`createCapabilitySet`, `createServiceRegistry`, `createEventBus`, `createEntitlementSet`/`createAllowAllEntitlementSet`) là pure function nhận input, trả object với method `has/list/get/register/...` — không side-effect, không phụ thuộc lẫn nhau.
- **Đánh giá độc lập:** Đây là ranh giới trách nhiệm rất rõ ràng — mỗi file 1 concern duy nhất (xác nhận qua đọc trực tiếp 7 file): `capability.ts` (29 dòng), `entitlement.ts` (52 dòng), `event-bus.ts` (84 dòng), `service-registry.ts` (29 dòng), `app-module.ts` (61 dòng — chỉ type definitions, không có runtime logic), `platform-context.ts` (46 dòng — ghép nối), `index.ts` (25 dòng — barrel export). **Không có god function/god file nào** — tổng cả 7 file chỉa 326 dòng, file lớn nhất 84 dòng (`event-bus.ts`).
- `createMockPlatformContext()` (platform-context.ts:37-46) — factory riêng cho test/mock app, mọi capability + entitlement bật sẵn, tránh mỗi test phải tự khai capabilities đầy đủ. Dùng đúng chỗ trong `modules/mock-app`.
- **Hiệu năng:** Không có gì đáng lo — toàn bộ là in-memory Map/Set, không I/O.
- **Độ ổn định:** Không có mutable shared state ngoài `Map`/`Set` nội bộ mỗi instance (không phải singleton toàn cục) — mỗi lần gọi `createPlatformContext()` tạo instance độc lập hoàn toàn, tránh rò rỉ state giữa test/app khác nhau.
- **Nhận định kiến trúc:** Mẫu chuẩn cho dependency injection nhẹ (không cần framework DI) — services/capabilities/entitlements đều là interface trừu tượng, implementation cụ thể (Electron/Web) inject qua factory options. Đúng nguyên tắc ports&adapters ở tầng kernel.
- **Đề xuất cải tiến:** P2 — không có god function. Có thể cân nhắc (không cấp thiết) thêm 1 helper `platform.requireCapability('tts-local')` ném lỗi rõ ràng thay vì để app tự check `if (!platform.capabilities.has(...))` rải rác — nhưng đây là "nice to have", không phải vấn đề kiến trúc hiện tại.

#### QA/QC Review
- **Trạng thái tổng quan:** PASS — 9/9 test case mới viết (`platform-context.test.ts`, trước đây 0 test trực tiếp) + 27/27 test toàn bộ `packages/kernel`.

| # | Tên | Loại | File test | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| TC-E2-01 *(mới)* | Mặc định: capabilities/entitlements rỗng, assetUrl identity | Automated-vitest | `kernel/__tests__/platform-context.test.ts` | Đúng mặc định | Đúng | PASS |
| TC-E2-02 *(mới)* | entitlements='all' → AllowAllEntitlementSet | Automated-vitest | `platform-context.test.ts` | has()=true mọi entitlement, list()=[] | Đúng | PASS |
| TC-E2-03 *(mới)* | entitlements=mảng cụ thể | Automated-vitest | `platform-context.test.ts` | has() đúng theo mảng | Đúng | PASS |
| TC-E2-04 *(mới)* | capabilities truyền vào phản ánh đúng | Automated-vitest | `platform-context.test.ts` | has() đúng | Đúng | PASS |
| TC-E2-05 *(mới)* | assetUrl tuỳ chỉnh truyền qua nguyên vẹn | Automated-vitest | `platform-context.test.ts` | Custom function được gọi | Đúng | PASS |
| TC-E2-06 *(mới)* | dùng chung 1 EventBus khi truyền events | Automated-vitest | `platform-context.test.ts` | `platform.events === sharedEvents` | Đúng | PASS |
| TC-E2-07 *(mới)* | không truyền events → tự tạo bus mới, hoạt động đúng | Automated-vitest | `platform-context.test.ts` | emit/on round-trip đúng | Đúng | PASS |
| TC-E2-08 *(mới)* | `createMockPlatformContext()` mặc định mọi capability+entitlement bật | Automated-vitest | `platform-context.test.ts` | Tất cả true | Đúng | PASS |
| TC-E2-09 *(mới)* | `createMockPlatformContext(overrides)` ghi đè đúng field | Automated-vitest | `platform-context.test.ts` | env/entitlements override, capabilities giữ mặc định | Đúng | PASS |

- Bug liên quan: không có.
- **Coverage ước tính:** functional 100% cho `createPlatformContext`/`createMockPlatformContext` (2 factory chính). Code coverage đo thật (`vitest --coverage`, `packages/kernel`, TRƯỚC/SAU khi thêm `platform-context.test.ts`): **`platform-context.ts` từ 0% → 100% statements/branch/functions/lines**. Toàn bộ package `kernel` từ 70.28% → 96.37% statements (`app-module.ts` giữ 0% vì chỉ chứa type definitions, không có runtime code để test — đúng bản chất, không phải thiếu sót; `index.ts` 0% vì chỉ là barrel re-export, coverage tool không tính export statement là "chạy được").
- **Đề xuất bổ sung test chưa viết:** không còn khoảng trống đáng kể sau khi thêm test này.

---

### [E3] Event bus
**Trọng số:** Low
**File liên quan:** `/Users/skyline/PROJECTS/sky-app/packages/kernel/src/event-bus.ts` (84 dòng, đặc biệt dòng 75-81 — hàm `once()`)

#### Architecture Review (đánh giá độc lập)
- **Luồng xử lý:** `createEventBus()` trả object literal với 4 method (`emit/on/off/once`) đóng gói 2 `Map` nội bộ (`handlers: Map<event, Set<handler>>`, `sticky: Map<event, StickyEntry>`). `emit(event, data, opts)` — nếu `opts.persistMs` truyền vào, lưu sticky entry (giá trị cuối cùng, có thể có `expiresAt`) TRƯỚC KHI gọi handler, cho phép subscriber mount muộn nhận lại qua `replayLatest`. `on(event, handler, opts)` — đăng ký vào Set, nếu `opts.replayLatest` và có sticky còn hạn (`isStickyValid`), gọi handler ngay lập tức với giá trị cũ. `once(event, handler)` (dòng 75-81): wrap handler gốc trong 1 closure tự huỷ đăng ký trước khi gọi handler thật, rồi gọi `this.on(event, wrapped)` — **dùng `this` bên trong 1 object literal (không phải class)**.
- **Đánh giá độc lập — điểm fragile đã xác nhận bằng thực nghiệm (không suy đoán):** `this.on(...)` chỉ đúng khi `once` được gọi Ở DẠNG method call qua object (`bus.once(...)`) — JS resolve `this` theo cách hàm được GỌI, không phải nơi định nghĩa. Nếu handler bị tách khỏi object (destructure `const { once } = bus` rồi gọi `once(...)` trực tiếp), `this` bên trong sẽ là `undefined` (strict mode/ESM, mặc định của TypeScript compile output) → `this.on is not a function` → TypeError ngay lập tức khi gọi `once()` (không phải khi emit — throw sớm hơn dự đoán ban đầu trong plan). **Xác nhận bằng test thực nghiệm** (xem QA Review) — không phải suy đoán lý thuyết.
- **Grep toàn bộ codebase production** (`packages`, `modules`, `apps`, loại trừ `__tests__`/`dist`) cho `.once(`: chỉ có 3 hit, cả 3 đều là API KHÁC (Node's `net.Server.once('error'/'listening')` trong `python-server.ts`, Electron's `BrowserWindow.once('ready-to-show')` trong `windows.ts`) — **không có bất kỳ lệnh gọi `EventBus.once()` nào trong toàn bộ code sản xuất hiện tại**. Rủi ro thực tế = 0 (đúng như plan gốc nhận định "an toàn hiện tại"), nhưng rủi ro tiềm ẩn vẫn còn nguyên nếu code tương lai destructure.
- **Hiệu năng:** Không đáng lo — `Set`/`Map` lookup O(1).
- **Độ ổn định:** `emit` lặp qua `Set` bằng `for...of` — an toàn nếu handler tự `off()` chính nó giữa lúc đang lặp (Set trong V8 cho phép xoá phần tử đang duyệt mà không throw, dù có thể bỏ sót phần tử được thêm mới giữa lúc lặp — edge case hiếm, không ảnh hưởng use-case hiện tại).
- **Nhận định kiến trúc:** Thiết kế hợp lý (học từ mẫu `mfe-shell-app`, theo comment dòng 3), API tối giản, đúng nhu cầu. Điểm `this` trong object literal là code smell nhẹ — không sai về mặt chức năng khi dùng đúng cách, nhưng vi phạm nguyên tắc "hàm không nên phụ thuộc ngữ cảnh gọi nếu không cần thiết" (functional style thường tránh `this`).
- **Đề xuất cải tiến:**
  - P1: Sửa `once()` (dòng 80) từ `const unsubscribe = this.on(event, wrapped);` thành gọi trực tiếp closure `on` đã có sẵn trong scope của `createEventBus()` thay vì qua `this` — an toàn tuyệt đối với mọi cách gọi (kể cả destructure), không đổi behavior, chỉ đổi cách resolve function reference. **KHÔNG thực thi trong GĐ7.5** (nằm ngoài phạm vi 3 điểm E4 được duyệt trước — chỉ note đề xuất).
  - P2: Cân nhắc export `EventBus` dưới dạng class thay vì object literal nếu muốn `this` hoạt động nhất quán hơn (đổi kiến trúc lớn hơn, không cấp thiết).

#### QA/QC Review
- **Trạng thái tổng quan:** PASS — 10/10 test case (bao gồm 3 test mới: destructure-safe call, destructure-broken thực nghiệm, `off()` × 2 case).

| # | Tên | Loại | File test | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| TC-E3-01 | emit gọi handler đã đăng ký | Automated-vitest | `event-bus.test.ts:5` (có sẵn) | handler được gọi đúng data | Đúng | PASS |
| TC-E3-02 | unsubscribe ngừng nhận event | Automated-vitest | `event-bus.test.ts:13` (có sẵn) | handler không gọi sau unsubscribe | Đúng | PASS |
| TC-E3-03 | sticky + replayLatest nhận giá trị cũ | Automated-vitest | `event-bus.test.ts:22` (có sẵn) | Đúng | Đúng | PASS |
| TC-E3-04 | không replay nếu không truyền replayLatest | Automated-vitest | `event-bus.test.ts:32` (có sẵn) | Không gọi | Đúng | PASS |
| TC-E3-05 | sticky hết hạn không replay | Automated-vitest | `event-bus.test.ts:42` (có sẵn) | Không gọi | Đúng | PASS |
| TC-E3-06 | once() chỉ gọi 1 lần | Automated-vitest | `event-bus.test.ts:53` (có sẵn) | 1 lần đúng data | Đúng | PASS |
| TC-E3-07 *(mới)* | `off()` gỡ đúng handler, không ảnh hưởng handler khác | Automated-vitest | `event-bus.test.ts` | handlerA không gọi, handlerB gọi | Đúng | PASS |
| TC-E3-08 *(mới)* | `off()` trên event chưa đăng ký không throw | Automated-vitest | `event-bus.test.ts` | Không throw | Đúng | PASS |
| TC-E3-09 *(mới)* | `once()` unsubscribe TRƯỚC khi emit → không gọi (xác nhận cách gọi hiện tại `bus.once(...)` an toàn) | Automated-vitest | `event-bus.test.ts` | handler không gọi | Đúng | PASS |
| TC-E3-10 *(mới, THỰC NGHIỆM)* | Destructure `{ once } = bus` rồi gọi rời — xác nhận lỗi thật | Automated-vitest | `event-bus.test.ts` (`THỰC NGHIỆM: destructure...`) | Throw `TypeError` | **Throw `TypeError` đúng như dự đoán** — xác nhận `this` mất ngữ cảnh khi destructure | PASS (test PASS = xác nhận đúng rủi ro tồn tại) |

- Bug liên quan: không có bug trong code hiện tại (0 lệnh gọi `.once()` bị destructure trong production) — TC-E3-10 xác nhận RỦI RO TIỀM ẨN có thật (not theoretical), không phải bug đang active.
- **Coverage ước tính:** functional 100% cho toàn bộ public API của `EventBus` (`emit/on/off/once`, kể cả sticky/replay). Code coverage đo thật: `event-bus.ts` 100% statements/lines/functions, 86.36% branch (nhánh còn thiếu: 1-2 nhánh biên trong `isStickyValid` khi `expiresAt` đúng bằng `Date.now()` — rủi ro cực thấp, không đáng bổ sung riêng).
- **Đề xuất bổ sung test chưa viết:** không còn khoảng trống đáng kể. Nếu muốn phòng ngừa triệt để (không chỉ ghi nhận rủi ro), P1 ở Architecture Review (sửa `once()` dùng closure thay vì `this`) nên đưa vào backlog GĐ8.

---

### [E4] Code trùng lặp cần refactor
**Trọng số:** Low (chất lượng) — **ĐÃ FIX cả 2/3 điểm trong lúc audit** (điểm thứ 3 giữ nguyên đề xuất, không fix)
**File liên quan:**
- Đã fix: `packages/licensing/src/{verify.ts,sign.ts,hex.ts (mới),license-port.ts,index.ts}`, `packages/platform-web/src/create-web-platform.ts`, `packages/platform-electron/src/create-electron-platform.ts`
- Chưa fix (giữ nguyên đề xuất): `packages/platform-web/src/adapters/tts.ts:9-49`, `modules/ceremony/src/lib/audio.ts:1-58`

#### Architecture Review
- **Điểm #1 — `hexToBytes()`/`bytesToHex()` trùng lặp:** Xác nhận trước khi fix: `packages/licensing/src/verify.ts:68-75` có `hexToBytes()` định nghĩa cục bộ; `packages/licensing/src/sign.ts:14-27` có CẢ `bytesToHex()` LẪN 1 bản `hexToBytes()` khác — 2 bản `hexToBytes` giống hệt nhau (copy-paste). **ĐÃ FIX trong lúc audit:** tạo `packages/licensing/src/hex.ts` (file mới, 17 dòng) export `hexToBytes`/`bytesToHex` dùng chung; `verify.ts` và `sign.ts` import từ đây, xoá 2 bản định nghĩa cục bộ trùng lặp (net: -19 dòng code trùng lặp, +17 dòng file mới dùng chung).
- **Điểm #2 — `resolveEntitlements()` trùng lặp giữa 2 platform:** Xác nhận trước khi fix: `packages/platform-electron/src/create-electron-platform.ts:48-52` và `packages/platform-web/src/create-web-platform.ts:46-50` có 2 hàm private giống hệt nhau về logic (`licensePort.getCurrent()` → `payload?.entitlements ?? []`), chỉ khác tên biến `licensePort` được tạo bằng adapter khác nhau (`createElectronLicensePort` vs `createWebLicensePort`). **ĐÃ FIX trong lúc audit:** thêm `resolveEntitlementsFromPort(port: LicensePort)` vào `packages/licensing/src/license-port.ts` (export qua `index.ts`) — đúng theo đề xuất trong plan gốc (mục Phần 5). Cả 2 platform package đã phụ thuộc `@sky-app/licensing` sẵn (xác nhận qua `package.json`) nên không phát sinh dependency mới. Cả 2 file `create-*-platform.ts` giờ gọi thẳng `resolveEntitlementsFromPort(createXxxLicensePort({...}))` — xoá 2 hàm private trùng lặp.
- **Điểm #3 — PCM→AudioContext decode trùng lặp:** Xác nhận: `packages/platform-web/src/adapters/tts.ts:9-49` (đã tối giản, không console.log) và `modules/ceremony/src/lib/audio.ts:1-58` (giữ nguyên console.log debug từ bản gốc — xác nhận bằng diff: `modules/ceremony/src/lib/audio.ts` khớp byte-for-byte với `trao-bang-tot-nghiep-2026/apps/slide/src/lib/audio.ts`, tức đây là bản port nguyên vẹn, KHÔNG phải bị lệch khi port). 2 bản có cùng thuật toán lõi (Int16→Float32→AudioBuffer→BufferSourceNode) nhưng khác nhau ở: (a) `platform-web` không log debug, `ceremony` có ~10 dòng `console.log`/`console.error`; (b) `ceremony` có fallback `webkitAudioContext` cho Safari cũ, `platform-web` không có; (c) `platform-web` không export `stopPmc()` riêng (dồn vào internal), `ceremony` export `stopPcm()` public. **KHÔNG fix trong đợt audit này** — lý do: (1) đề bài audit liệt kê rõ `modules/ceremony/src/lib/audio.ts` trong danh sách file KHÔNG được sửa (ngay cả trong ngoại lệ E4); (2) đây là điểm phức tạp nhất trong 3 điểm — cần quyết định vị trí gói dùng chung mới (`service-contracts` hay gói riêng) trước khi thực thi, đúng như plan gốc ghi "cân nhắc gói mới hoặc `service-contracts`" (chưa chốt, không phải "chỉ cần tách ra file .ts đơn giản" như 2 điểm kia). Giữ nguyên là đề xuất P1 cho GĐ8.
- **Hiệu năng/Độ ổn định sau fix:** Không đổi hành vi runtime (đã xác nhận bằng chạy lại toàn bộ test liên quan — xem QA Review) — thuần refactor, không thay đổi logic.
- **Nhận định kiến trúc:** Fix điểm #1/#2 củng cố đúng nguyên tắc DRY trong tầng `packages/*` dùng chung, không đụng tới UI/luồng phức tạp — đúng tinh thần "rủi ro thấp" mà plan gốc mô tả. Điểm #3 cần thêm 1 quyết định kiến trúc (vị trí gói mới) trước khi làm — hợp lý khi để dành GĐ8 xử lý cùng lúc với các đề xuất god-component khác.
- **Đề xuất cải tiến (điểm #3, chưa fix):** P1 — tách phần decode thuần tuý (Int16→Float32→AudioBuffer, không có DOM/console side-effect) thành helper ở `packages/service-contracts` (đã là dependency chung của cả `platform-web` và tương lai `modules/ceremony` khi migrate hẳn sang kernel — xem D4) hoặc gói `packages/audio-codec` mới nếu muốn tách biệt khỏi contracts thuần interface. `modules/ceremony/src/lib/audio.ts` giữ lại phần AudioContext lifecycle + logging riêng (không cần thay đổi khi Ceremony vẫn dùng `window.slide`, theo D4).

#### QA/QC Review
- **Trạng thái tổng quan:** PASS — 2/2 điểm đã fix, không regression (0 test FAIL sau fix); 1/1 điểm còn lại giữ nguyên đề xuất (không áp dụng PASS/FAIL vì không thực thi).
- Quy trình verify sau fix (theo đúng yêu cầu đề bài — chạy lại toàn bộ test liên quan):

| # | Tên | Loại | Lệnh chạy | Kỳ vọng | Thực tế | Trạng thái |
|---|---|---|---|---|---|---|
| TC-E4-01 | `packages/licensing` — 21 test không regression sau tách `hex.ts` | Automated-vitest | `pnpm --filter @sky-app/licensing test` | 21/21 PASS | 21/21 PASS | PASS |
| TC-E4-02 | `packages/licensing` typecheck sau refactor | Automated (tsc) | `pnpm --filter @sky-app/licensing typecheck` | 0 lỗi | 0 lỗi | PASS |
| TC-E4-03 | `packages/platform-web` — 14 test không regression sau đổi `resolveEntitlements` | Automated-vitest | `pnpm --filter @sky-app/platform-web test` | 14/14 PASS | 14/14 PASS | PASS |
| TC-E4-04 | `packages/platform-electron` — 8 test không regression | Automated-vitest | `pnpm --filter @sky-app/platform-electron test` | 8/8 PASS | 8/8 PASS | PASS |
| TC-E4-05 | Typecheck toàn bộ `platform-web`/`platform-electron` sau refactor | Automated (tsc) | `pnpm --filter @sky-app/platform-web typecheck`, tương tự electron | 0 lỗi | 0 lỗi | PASS |
| TC-E4-06 | Toàn bộ monorepo (`pnpm test`, 16 package) không regression | Automated (turbo) | `pnpm test` (root) | 16/16 task pass | 16/16 pass | PASS |

- Bug liên quan: không có — fix không phát sinh regression nào.
- **Coverage ước tính:** `hex.ts` (file mới) đo được 100% statements/branch/functions/lines (đo thật bằng `vitest --coverage`, exercised gián tiếp qua toàn bộ test hiện có của `verify.ts`/`sign.ts` — không cần viết test riêng cho `hex.ts` vì mọi test round-trip sign/verify đều đi qua nó). `create-web-platform.ts`/`create-electron-platform.ts` đạt 100% statements sau fix (đo thật, xác nhận qua `vitest --coverage` từng package — xem bảng coverage tổng ở cuối file).
- **Đề xuất bổ sung test chưa viết:** không cần thêm — coverage đã đầy đủ qua test hiện có, không cần test riêng cho `hex.ts`/`resolveEntitlementsFromPort` vì đã cover gián tiếp 100%.

---

### [E5] Logging/error-handling consistency
**Trọng số:** Low
**File liên quan:** toàn bộ `apps/shell-electron/electron/**`, `modules/ceremony/src/**`, `packages/**`

#### Architecture Review (đánh giá độc lập — quan sát, không phải bug)
- **Số liệu đo lại (grep trực tiếp, xác nhận khớp plan gốc):**
  - `apps/shell-electron/electron/**`: 110 lệnh gọi `console.log/warn/error/info/debug`, rải trên 10 file.
  - `modules/ceremony/src/**`: 44 lệnh gọi console (chủ yếu trong `lib/audio.ts` — 10 dòng debug log giữ nguyên từ bản gốc, xem E4 điểm #3 — và rải rác các component khác).
  - `packages/**` (kernel, licensing, platform-electron, platform-web, service-contracts, device-shell, tsconfig, slide-shared): **0 lệnh gọi console** — hoàn toàn sạch, xác nhận lại SAU KHI fix E4 (edit `verify.ts`/`sign.ts`/`license-port.ts`/`create-*-platform.ts` không thêm log nào).
- **Đánh giá độc lập:** Sự phân bổ này PHẢN ÁNH ĐÚNG kiến trúc phân lớp — `packages/*` là tầng thấp (kernel/port/adapter thuần túy), đúng nguyên tắc không nên tự ý log ra console (library code nên throw/return, để caller quyết định log ở đâu — logging là concern của tầng application, không phải library). `apps/shell-electron` (main process Electron) và `modules/ceremony` (UI + business logic) là nơi hợp lý để log trực tiếp (debug trong dev, hoặc ghi `_write_log`/file log cho production troubleshooting).
- **Vấn đề thật (không phải số lượng, mà là tính NHẤT QUÁN):** Không có 1 cơ chế logging thống nhất (không có log-level, không có structured logging, không phân biệt log dev-only vs log cần giữ lại production) — toàn bộ đều là `console.log`/`console.error` trực tiếp, một số có prefix `[Audio]`/`[mock tts:speak]` để phân loại thủ công, một số không. Không có cách tắt log debug hàng loạt khi build production (trừ khi build tool tự strip `console.log`, chưa xác minh có strip hay không).
- **Hiệu năng:** Không đáng kể ở quy mô hiện tại (vài chục tới trăm lệnh gọi, không phải hot loop).
- **Độ ổn định:** Không ảnh hưởng — console log không throw, không phải nguồn bug.
- **Nhận định kiến trúc:** Đây là quan sát chất lượng (code smell nhẹ), không phải kiến trúc sai — ranh giới `packages/*` sạch là điểm CỘNG đáng ghi nhận (khác với nhiều codebase khác thường rò rỉ console log vào tầng thấp).
- **Đề xuất cải tiến:**
  - P2: Cân nhắc 1 helper `logger.ts` nhẹ (wrap console, có thể tắt theo `NODE_ENV`/flag) dùng thống nhất ở `apps/shell-electron` và `modules/ceremony` thay vì gọi `console.*` trực tiếp rải rác — không cấp thiết, chỉ cải thiện khả năng bảo trì lâu dài.
  - P2: Xác minh build production (Vite/esbuild config) có strip `console.log` hay không — nếu không, cân nhắc thêm (giảm noise console khi khách hàng dùng app thật, tránh lộ thông tin debug không cần thiết).

#### QA/QC Review
- **Trạng thái tổng quan:** PASS — đây là mục quan sát/audit số liệu, không có test case pass/fail theo nghĩa functional; số liệu đã xác nhận khớp 100% với con số trong plan gốc.

| # | Tên | Loại | Lệnh | Kỳ vọng (theo plan gốc) | Thực tế (đo lại độc lập) | Trạng thái |
|---|---|---|---|---|---|---|
| TC-E5-01 | Đếm console.* trong `apps/shell-electron/electron/**` | Automated (grep) | `grep -rE "console\.(log\|warn\|error\|info\|debug)" apps/shell-electron/electron --include="*.ts"` | ~110 | 110 | PASS (khớp) |
| TC-E5-02 | Đếm console.* trong `modules/ceremony/src/**` | Automated (grep) | tương tự trên `modules/ceremony/src` | ~44 | 44 | PASS (khớp) |
| TC-E5-03 | Đếm console.* trong `packages/**` | Automated (grep) | tương tự trên `packages` | 0 | 0 (xác nhận lại SAU fix E4, không bị vi phạm) | PASS (khớp) |

- Bug liên quan: không có.
- **Coverage ước tính:** không áp dụng (đây là audit số liệu tĩnh, không phải chức năng runtime — functional/code coverage không có ý nghĩa cho mục này).
- **Đề xuất bổ sung test chưa viết:** có thể thêm 1 lint rule (ESLint `no-console` với exception cho `apps/shell-electron`/`modules/ceremony`, error cho `packages/*`) để BẢO VỆ ranh giới sạch hiện tại của `packages/*` không bị vi phạm trong tương lai — đề xuất cho GĐ8, không thuộc phạm vi audit/test GĐ7.5.

---

## Tổng kết Subagent 3

### Số liệu tổng hợp

| Mã | Chức năng | Trọng số | Trạng thái | Test case | Coverage functional | Coverage code (đo thật) |
|---|---|---|---|---|---|---|
| D1 | TTS synthesize endpoint | High | PASS | 7/7 (mới) + 7 khác trong cùng file | ~90% | `adapters/tts.ts` 100% stmt |
| D2 | Voice registry & cloned voices | Medium | PASS | 2/2 | 100% (structural) | N/A (Python, không đo được) |
| D3 | Engine lifecycle | Medium | PASS | 1/1 | 40% (chỉ structural, thiếu manual checklist runtime) | N/A (Electron main process) |
| D4 | TTS kernel port Electron (mock) | Low | PASS (đúng như thiết kế mock) | 3/3 | 100% cho "mock đúng như mock"; 0% có chủ đích cho "TTS thật qua kernel" | `adapters/tts.ts` 81.81% stmt |
| E1 | Licensing/Entitlement gate | High | PASS | 28/28 (24 có sẵn + 4 xác nhận lại) | ~95% | `licensing` 89.43%→100% (hex.ts) stmt |
| E2 | PlatformContext capability negotiation | Medium | PASS | 9/9 (mới) | 100% | `kernel` 70.28%→96.37% stmt |
| E3 | Event bus | Low | PASS | 10/10 (6 có sẵn + 4 mới) | 100% | `event-bus.ts` 100% stmt, 86.36% branch |
| E4 | Code trùng lặp — đã fix 2/3 | Low | PASS (2 điểm fix, không regression) | 6/6 verify-sau-fix | 100% (2 điểm đã fix) | 100% stmt cho code mới |
| E5 | Logging consistency | Low | PASS (quan sát, khớp số liệu) | 3/3 | N/A | N/A |

**9/9 chức năng đã audit xong — 9/9 PASS, 0 FAIL, 0 bug mới phát hiện trong nhóm D+E** (khác với nhóm B+C có bug Critical — nhóm D+E không có vấn đề vận hành nghiêm trọng nào).

### Test file mới đã viết/mở rộng (đường dẫn tuyệt đối)

1. `/Users/skyline/PROJECTS/sky-app/packages/platform-web/src/__tests__/create-web-platform.test.ts` — mở rộng thêm 3 test case (D1: sample-rate fallback, empty-buffer explicit case, advanced-params-not-forwarded).
2. `/Users/skyline/PROJECTS/sky-app/packages/kernel/src/__tests__/event-bus.test.ts` — mở rộng thêm 4 test case (E3: off() × 2, once() unsubscribe-trước-emit, thực nghiệm destructure).
3. `/Users/skyline/PROJECTS/sky-app/packages/kernel/src/__tests__/platform-context.test.ts` — **file mới hoàn toàn**, 9 test case (E2, đóng khoảng trống 0% coverage của `platform-context.ts`).

Tổng: 3 file test (1 mới, 2 mở rộng), +16 test case mới, tất cả PASS thật (đã chạy `pnpm vitest run` xác nhận, không phải đoán).

### E4 — đã fix trong lúc audit (2/3 điểm)

- **Điểm #1 (`hexToBytes`/`bytesToHex`):** tạo `/Users/skyline/PROJECTS/sky-app/packages/licensing/src/hex.ts`, cập nhật `verify.ts`/`sign.ts`/`index.ts` dùng chung.
- **Điểm #2 (`resolveEntitlements`):** thêm `resolveEntitlementsFromPort()` vào `/Users/skyline/PROJECTS/sky-app/packages/licensing/src/license-port.ts`, cập nhật `platform-web/src/create-web-platform.ts` và `platform-electron/src/create-electron-platform.ts` dùng chung, xoá 2 hàm private trùng lặp.
- **Điểm #3 (PCM-decode):** KHÔNG fix — giữ nguyên đề xuất P1 cho GĐ8 (lý do: `modules/ceremony/src/lib/audio.ts` nằm trong danh sách file không được sửa của đề bài audit; cần quyết định vị trí gói mới trước khi thực thi).
- Đã chạy lại toàn bộ test liên quan sau fix: `packages/licensing` (21/21 PASS), `packages/platform-web` (14/14 PASS), `packages/platform-electron` (8/8 PASS), typecheck 4 package (0 lỗi), và `pnpm test` toàn monorepo (16/16 task PASS) — xác nhận KHÔNG có regression.

### Coverage tổng thể đo thật (`vitest --coverage`, đã cài `@vitest/coverage-v8` làm devDependency tạm thời cho mục đích đo — xem `package.json`/`.gitignore` đã thêm `coverage/`)

| Package | Trước audit (ước tính không đo) | Sau audit (đo thật) |
|---|---|---|
| `packages/kernel` | không đo | **96.37%** statements, 94.54% branch, 100% functions |
| `packages/licensing` | không đo | **89.43%** statements (bao gồm `hex.ts` mới 100%), 86.88% branch |
| `packages/platform-web` | không đo | **94.68%** statements, 87.5% branch |
| `packages/platform-electron` | không đo | **79.22%** statements, 90.9% branch (thấp hơn do `display.ts`/`bridge-types.ts` chưa có test riêng — ngoài phạm vi D/E) |

Tổng số test PASS thật trong 4 package trực tiếp thuộc nhóm D+E: **kernel 27/27, licensing 21/21, platform-web 14/14, platform-electron 8/8 = 70/70 PASS**, cộng thêm toàn bộ 16/16 turbo task của monorepo (bao gồm `module-ceremony`, `module-mock-app`, `device-shell` — không thuộc phạm vi D/E nhưng xác nhận không bị ảnh hưởng bởi fix E4).

### Ghi chú giới hạn công cụ

- TTS Python service (`apps/tts-service/server/*.py`) không có test tự động (không có pytest trong repo) — toàn bộ D1-D3 verify bằng diff structural (đối chứng bản gốc byte-for-byte) + test TS phía client. Đây là giới hạn thật của công cụ hiện có, không phải audit bỏ sót.
- D3 (Engine lifecycle) và phần Electron main-process (D4's `ipc.ts`) không đo được bằng vitest thuần vì cần Electron runtime thật (spawn subprocess, BrowserWindow) — đúng theo giới hạn đã nêu trong plan gốc mục 2.3.
