# 2026-08-10 — Đổi engine TTS tại chỗ (bỏ nạp model 3 lần)

> GĐ A của [`docs/roadmap/plans/tts-engine-architecture.md`](../../roadmap/plans/tts-engine-architecture.md).

## Vấn đề

Phản hồi của user: *"khi chuyển model thấy rất lâu, ví dụ đang ở model vieneu chuyển sang
model voxcpm, thời gian chuyển cực kỳ lâu"*.

Truy nguyên nhân trên code thật: **một lần đổi engine nạp model tới 3 LẦN**.

1. `EngineManager.doVerifyAndSwitch()` gọi `port.verify(id)` → `tts:engine-verify` → spawn
   `verify_engine.py` → nạp full model để kiểm tra rồi vứt process đi.
2. `port.switchEngine(id)` → `tts:engine-switch` → **lại** gọi `inst.verify()` một lần nữa
   (cùng một dry-run, cùng một model).
3. Sau đó mới `stopPythonServer()` + `startPythonServer()` → process mới nạp lại chính model
   đó lần thứ ba.

Comment sẵn có trong `python-server.ts` đã ghi đo thực tế: VoxCPM (torch, ~4.5GB safetensors)
mất **~118 giây mỗi lần nạp** — nhân ba là ~6 phút cho một thao tác đổi engine.

Gốc rễ khiến buộc phải restart: `main.py` khai `_engine = None` — **biến đơn**, mỗi process
chỉ phục vụ đúng 1 engine, không có đường nào đổi engine mà không giết process.

## Đã làm

### Phía Python (`apps/tts-service/server/`)

- `_engine` (biến đơn) → giữ nguyên vai trò "engine hiện hành", nhưng thêm **cache**
  `_engines: dict[id, instance]` + `_engine_lru` + `_current_engine_id`. Engine đã nạp được
  giữ ấm trong RAM; quay lại engine cũ là tức thì.
- **Hạn mức giữ ấm theo nhóm runtime**: engine torch ngốn vài GB nên mặc định giữ 1
  (`VIENEU_CACHE_MAX_TORCH`), engine ONNX rẻ hơn nên giữ 3 (`VIENEU_CACHE_MAX_ONNX`). Thải
  theo LRU, không bao giờ thải engine đang dùng.
- **`_ref_codes_cache` lồng theo engine** (trước là phẳng theo `voice_id`). Embedding giọng
  clone do `encode_reference()` của TỪNG engine sinh ra, không dùng chéo được — cache phẳng
  vô hại khi mỗi process 1 engine, nhưng thành bug thật ngay khi cache nhiều engine chung
  process (engine mới nhận embedding của engine cũ → sai giọng hoặc crash). Sửa cùng lúc,
  không để lại sau.
- Endpoint mới `POST /engines/switch` — đổi engine tại chỗ, không restart. Trả **409 kèm
  `reason: "unavailable_in_process"`** khi process hiện tại không có runtime cho engine đó
  (vd engine torch trong process ONNX); đây là tín hiệu để Electron lùi về đường spawn
  process riêng, KHÔNG phải lỗi báo cho người dùng.
- Endpoint mới `POST /engines/unload` — nhả RAM của một engine đang giữ ấm nhưng **giữ nguyên
  file trên đĩa** (khác hẳn xoá engine). Từ chối unload engine đang dùng.
- `GET /engines` trả thêm `loaded` (engine đang giữ ấm) và `runtime_kind` mỗi engine.
- `engine_registry.py`: khai tường minh `runtime_kind` (`onnx-bundled`/`onnx-ext`/`torch`),
  thêm `engine_runtime_kind()` (suy ra từ `pip_packages` nếu engine mới quên khai) và
  `engine_site_packages()`.
- `create_engine()` với engine mở rộng **torch-free** tự thêm site-packages của engine vào
  **cuối** `sys.path` → nạp được ngay trong process đang chạy. Cố ý KHÔNG làm vậy cho engine
  torch: trộn torch/numpy của bản cài rời vào process đã bundle sẵn numpy/onnxruntime rất dễ
  lệch ABI — để ImportError xảy ra tự nhiên rồi trả 409.

### Phía Electron

- `tts:engine-switch` thử `POST /engines/switch` **trước**. Thành công → xong, không verify,
  không restart (Python tự ghi `config.engine` nên bỏ luôn `PUT /config`). Gặp 409 → lùi về
  nguyên đường cũ (verify → restart → health → rollback). Lỗi thật (404/500) → báo thẳng,
  không tốn thời gian đi đường cũ vô ích.
- `EngineManager.doVerifyAndSwitch()` **bỏ hẳn** lượt `port.verify()` riêng — `switchEngine`
  đã tự lo trọn phần kiểm tra. Đây là lần nạp model thứ nhất trong ba lần nói trên.

## Kết quả đo thật

Chạy `tts-service` thật (VieNeu bundled + MOSS-TTS-Nano đã cài), gọi endpoint trực tiếp:

| Thao tác | Kết quả |
|---|---|
| vieneu → moss-tts-nano (lần đầu, nạp thật trong process) | **3.9s** |
| moss-tts-nano → vieneu (đã giữ ấm) | **2ms** |
| vieneu → moss-tts-nano (đã giữ ấm) | **2ms** |
| → voxcpm (torch, process ONNX không có runtime) | **409 sau 7ms** → Electron lùi đường cũ |

Trước thay đổi, mọi ô trong bảng đều là kill process + spawn lại + nạp model (VieNeu 30-60s,
VoxCPM ~118s × 3).

Xác nhận thêm sau khi đổi engine qua lại nhiều lượt: `POST /synthesize` vẫn trả 200,
`X-Sample-Rate: 48000`, `X-Quality-Score: 100` — ref-codes namespace không phá luồng đọc.

## Test

Thêm `apps/tts-service/tests/` (pytest — trước đây repo **không có test Python nào**, đúng
khoảng trống đã ghi nhận ở `ga7.5-audit/03-tts-architecture.md` mục D1). 15 test, dùng engine
giả nên chạy trong 0.42s, không nạp model thật:

- đổi engine nạp đúng 1 lần, quay lại engine cũ KHÔNG tạo lại instance
- 409 `unavailable_in_process` không làm mất engine đang chạy
- LRU + thải theo hạn mức, không bao giờ thải engine hiện hành
- ref codes không rò rỉ giữa các engine; xoá voice gỡ khỏi MỌI engine; thải engine dọn luôn
  ref codes của nó
- unload từ chối engine đang dùng, nhả rồi nạp lại được

Chạy: `apps/tts-service/venv/bin/python -m pytest tests/ -q`
(pytest nằm ở `requirements-dev.txt` mới — cố ý tách khỏi `requirements.txt` để không lọt vào
binary PyInstaller và không làm `build.sh` dựng lại venv).

---

# Phần 2 — GĐ B: hai tiến trình song song + làm mới UI

## Hai tiến trình sống song song (blue-green)

`python-server.ts` trước đây giữ **một** tiến trình (`pythonProcess`, `actualPort`, …trong các
biến module). Nay state được gom vào `TierState` theo **nhóm**:

- `'bundled'` — binary/main.py kèm app: VieNeu + mọi engine torch-free nạp được tại chỗ.
- `'ext'` — runtime RIÊNG của một engine mở rộng (torch). Mỗi lúc phục vụ đúng 1 engine.

`getPythonPort()` giữ nguyên chữ ký, trả port của nhóm ĐANG phục vụ — nhờ vậy **cả 23 call
site không phải sửa một dòng nào**.

Đổi engine khác nhóm giờ đi `ensureTierForEngine()`: dựng tiến trình mới trên port trống
**trong khi tiến trình cũ vẫn phục vụ bình thường**, health-check xong mới chuyển
`activeTier`. Hệ quả:

- Bỏ nốt bước `inst.verify()` trong `tts:engine-switch` — health-check của tiến trình mới
  CHÍNH LÀ verify. Cộng với phần 1, một lần đổi engine giờ nạp model **1 lần thay vì 3**.
- Bỏ hẳn `rollbackToVieneu()`: tiến trình cũ chưa bao giờ bị đụng nên không có gì để hoàn
  tác — hỏng thì chỉ việc không chuyển sang, người dùng vẫn đọc được bằng engine đang dùng.
- Quay lại engine cũ là **tức thì** (tiến trình của nó vẫn sống).

Chi tiết cần lưu ý:
- `pushStatus()` chỉ phát trạng thái của nhóm ĐANG phục vụ. Nhóm kia có thể đang khởi động
  nền — phát ra sẽ khiến icon menu bar báo động nhầm dù dịch vụ vẫn tốt.
- `findFreePort` cho nhóm thứ hai dò từ **sau** cổng nhóm đang chạy, không phải chờ nhả cổng.
- `warmupSessions` chỉ chạy cho nhóm `'bundled'`: giọng warmup là giọng VieNeu, bắt nhóm
  torch vừa nạp xong model đọc thêm một câu nữa chỉ làm chậm đúng lượt người dùng đang chờ.
- `stopPythonServer()` giữ tên cũ nhưng nay tắt **mọi** nhóm — bỏ sót nhóm nào là để lại
  process mồ côi giữ vài GB RAM (đúng loại lỗi đã gặp 2026-08-05).

## IPC mới

- `tts:engines-dir` / `tts:open-engines-dir` — đường dẫn thư mục lưu engine và mở bằng
  Finder/Explorer (`shell.openPath`, tạo thư mục trước nếu chưa có để không trả lỗi khó hiểu).
- `tts:engine-unload` — nhả RAM, giữ nguyên dữ liệu đĩa. Hai nhánh: engine nằm trong tiến
  trình đang phục vụ → `POST /engines/unload`; engine là chủ nhóm `'ext'` đang chạy nền mà
  không phục vụ → tắt hẳn tiến trình đó (cả tiến trình chỉ tồn tại để chạy engine này).

## UI (theo góp ý so sánh với Voicebox)

`EngineManager` đổi từ "mọi thứ phơi hết trong thẻ luôn-mở" sang **danh sách gọn → bảng chi
tiết**:

- Mỗi engine là 1 dòng: chấm trạng thái (✓ đang dùng / ⚡ giữ ấm / ↓ chưa tải), tên, nhãn,
  dung lượng. Bấm vào mở bảng chi tiết phủ lên danh sách trong cùng cửa sổ.
- Bảng chi tiết: link repo HuggingFace của model, mô tả, thẻ loại runtime, dung lượng đĩa,
  yêu cầu phần cứng, tiến độ tải, và toàn bộ nút thao tác (gồm nút **Nhả bộ nhớ** mới).
- Đầu cửa sổ: hàng **Nơi lưu trữ** + nút **Mở thư mục**.
- Nhãn "Sẵn trong bộ nhớ" lấy từ field `loaded` mới của `GET /engines` — cho biết engine nào
  đổi sang là tức thì.

---

# Phần 3 — Đổi tên tiến trình + sửa bug đường dẫn interpreter

## Tên tiến trình → "Sky App TTS"

User thấy tiến trình tên **"Python"** trong Activity Monitor. Đã thực nghiệm 3 cách trên máy
thật trước khi chọn:

| Cách | Kết quả |
|---|---|
| `argv0` của `child_process.spawn` | ❌ Không đổi — macOS lấy tên từ file thực thi thật, không từ argv |
| Symlink mang tên mới | ❌ Bị resolve về file gốc, vẫn "Python" |
| Tên file thực thi / **hardlink** | ✅ `ps -c -o comm=` trả đúng tên mới |

Lý do: `p_comm` do kernel gán lúc `exec()` từ tên file thực thi — tiến trình không tự đổi được.

Đã làm:
- Binary PyInstaller `vieneu-server` → **`Sky App TTS`** (spec, `build.sh`, `build-win.js`,
  `electron-builder.yml` cho cả mac lẫn win). Cả 2 script build xoá luôn binary tên cũ còn
  sót để bản đóng gói không mang theo 2 file ~82MB giống hệt nhau.
- `getExecutablePath()` dò tên mới TRƯỚC, giữ `vieneu-server` làm **fallback** — bản cài cũ
  (trước 0.3.0) mang binary tên đó; thiếu fallback thì app âm thầm rơi về "chạy main.py bằng
  system Python", vốn không có ở máy hội trường → hỏng TTS hoàn toàn.
- Runtime của engine mở rộng: `ensurePythonRuntime()` tạo thêm **hardlink** `Sky App TTS`
  cạnh interpreter (0 byte, giữ nguyên mọi symlink và bố cục bản phân phối Python), có kiểm
  lại bằng `-V` qua chính hardlink; không chạy được thì xoá hardlink và quay về bản gốc —
  đổi tên hiển thị là thứ "có thì tốt", không được phép làm hỏng cài đặt.

**Dev mode vẫn hiện "Python"** (chạy `venv/bin/python main.py`) — chỉ dev nhìn thấy, không
đáng đánh đổi rủi ro để đổi.

## 🔴 Bug có sẵn phát hiện lúc làm: engine mở rộng không chạy được ở bản đóng gói

`ensurePythonRuntime()` tạo interpreter ở `runtime/python/bin/python3`, nhưng
`resolveExtensionEngineSpawn()` (python-server.ts) và `tts:engine-verify` (ipc.ts) lại tự ghép
đường dẫn `runtime/bin/python` — **lệch nhau**, di chứng từ hồi đổi nguồn runtime sang
`astral-sh/python-build-standalone` (comment trong `python-runtime.ts` còn ghi "khớp với chỗ
resolveExtensionEngineSpawn() dò tìm", thực tế không khớp).

Hệ quả ở bản ĐÓNG GÓI: không bao giờ tìm thấy interpreter vừa tải → âm thầm rơi về system
Python (không có torch) → engine mở rộng không chạy, và `verify` báo engine hỏng dù engine
hoàn toàn bình thường. `resolveAccelSpawn()` thì dò đúng, nên bug chỉ ảnh hưởng engine mở rộng.

Đã sửa: gom về một hàm duy nhất `resolveRuntimePython()` (ưu tiên hardlink tên sản phẩm →
interpreter gốc → bố cục cũ), cả 3 nơi cùng gọi hàm này.

**Chưa verify runtime được** — cần bản đóng gói + engine mở rộng đã cài, môi trường dev
không tái hiện được (dev dùng venv nên không đi qua nhánh này).

## Chưa làm (GĐ C/D)

- **GĐ C** (runtime dùng chung theo nhóm) chưa làm — mỗi engine torch vẫn có site-packages
  riêng, nên cài engine torch thứ hai vẫn tốn thêm ~2.5GB trùng lặp. Trong bản đóng gói,
  engine mở rộng torch-free cũng có thể vẫn phải đi đường dựng tiến trình riêng nếu nhóm
  hiện tại thiếu dependency của nó.
- **GĐ D** (thêm Qwen 0.6B/1.7B) chưa làm — chờ D0 xác minh Qwen có tiếng Việt không và D1
  spike bản ONNX cộng đồng.
- Phần hai tiến trình song song **chưa được verify runtime** trong đợt này (cần chạy Electron
  thật với engine mở rộng đã cài). Phần Python (cache engine, switch/unload) đã đo thật —
  xem bảng ở phần 1.
