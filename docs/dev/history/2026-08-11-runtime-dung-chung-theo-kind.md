# 2026-08-11 — Runtime engine mở rộng dùng chung theo kind (GĐ C)

> GĐ C của [`docs/roadmap/plans/tts-engine-architecture.md`](../../roadmap/plans/tts-engine-architecture.md).
> Tiếp nối [2026-08-10 — Đổi engine TTS tại chỗ](./2026-08-10-doi-engine-tts-tai-cho.md) (GĐ A/B).

## Vấn đề

Mỗi engine mở rộng có site-packages RIÊNG tại `ttsEngineDir(engineId)/runtime/site-packages`.
Cài 1 engine cần torch (VoxCPM) tốn ~2.5GB; cài thêm 1 engine torch khác (vd Qwen-torch
tương lai — xem GĐ D) sẽ tải và LƯU torch **lần thứ hai**, hoàn toàn trùng lặp. Cộng thêm
`ttsAccelDir()` (`userData/tts-accel`) là một bản Python + site-packages **thứ ba**, tách biệt
hoàn toàn, dùng cho tăng tốc GPU của engine mặc định.

## Đã làm

### C1 — Thư mục runtime dùng chung theo `kind`

`ttsRuntimeDir(kind)` mới trong `data/paths.ts`: `<ttsEnginesDir>/_runtime/<kind>/{python,
site-packages}`. `kind` ∈ `'torch' | 'onnx-ext' | 'onnx-accel'` (không có `'onnx-bundled'` —
VieNeu chạy bằng binary PyInstaller, không có runtime rời).

`EngineInstaller.installRuntime()` đổi đích ghi từ `ttsEngineDir(engineId)/runtime` sang
`ttsRuntimeDir(runtimeKind)`. `setRuntimeInstall()` nhận thêm tham số `runtimeKind` (lấy từ
`GET /engines`'s field `runtime_kind` — đã có sẵn từ GĐ A). Không tự dựng cơ chế theo dõi
"gói nào đã cài" — dựa vào tính idempotent sẵn có của `pip install --target`: cài engine
torch thứ hai vào cùng thư mục, pip tự bỏ qua phần đã thoả mãn, chỉ tải phần thiếu. Đánh đổi:
nếu 2 engine cùng kind đòi version xung đột, lần cài sau có thể nâng/hạ cấp bản đầu — pip tự
báo lỗi rõ ràng nếu không giải được, không âm thầm hỏng.

### C2 — Tương thích ngược

`resolveEngineRuntimeLocation(engineId)` (engine-installer.ts) dò vị trí DÙNG CHUNG mới
trước; không có thì lùi về vị trí RIÊNG cũ (`ttsEngineDir(engineId)/runtime`). Engine cài từ
trước bản này vẫn chạy được, không bị bắt cài lại.

**Vấn đề phát sinh khi verify:** engine cài trước GĐ C có manifest.json **không có field
`runtimeKind`** → `engineRuntimeKind()` phải fallback `'torch'` (an toàn nhưng SAI cho engine
torch-free) → bug fix của `tierOfEngine` (mục dưới) sẽ không có tác dụng cho tới khi engine
được cài lại. Thêm `migrateEngineManifests(port)`: gọi 1 lần sau khi tier `'bundled'` (luôn
chạy) sẵn sàng, hỏi `GET /engines` rồi vá `runtimeKind` vào manifest của mọi engine đã cài
mà chưa có field này. Nền, không chặn khởi động, không ném lỗi ra ngoài.

Verify thật trên máy dev: manifest MOSS/VoxCPM trước khi vá không có `runtimeKind`; sau khi
app chạy `[TTS] Ready.`, đọc lại manifest → `moss-tts-nano.runtimeKind = "onnx-ext"`,
`voxcpm.runtimeKind = "torch"` — đúng.

### C3 — Gộp runtime tăng tốc GPU vào cùng cơ chế

`ttsAccelDir()` (paths.ts) bị xoá hẳn (chỉ 2 call site, cả hai đổi sang `ttsRuntimeDir
('onnx-accel')` trực tiếp — bỏ luôn lớp nesting `runtime/` thừa mà bản cũ có, thống nhất
layout `<root>/{python,site-packages}` cho mọi kind).

### C4 — `diskUsage`/`deleteInstall` đúng ngữ nghĩa mới

Tự nhiên đúng nhờ C1: `ttsEngineDir(engineId)` sau GĐ C chỉ còn chứa `model/` + manifest/
state (không còn `runtime/` lồng bên trong cho engine cài MỚI) → `diskUsage()` không còn
cộng trùng runtime dùng chung vào từng engine; `deleteInstall()` xoá thư mục engine không
còn đụng runtime của engine khác cùng kind — không cần refcount thủ công như dự tính ban đầu
trong kế hoạch.

Thêm riêng: `deleteInstall()` sau khi xoá engine, kiểm nếu KHÔNG còn engine nào khác dùng
chung `kind` đó thì dọn luôn `ttsRuntimeDir(kind)` — nếu không, torch (~2.5GB) sẽ mồ côi vĩnh
viễn sau khi xoá engine torch duy nhất từng cài. `sharedRuntimeInfo(kind)` (mới) trả dung
lượng + danh sách engine đang dùng — dùng cho cleanup và cho UI (mục dưới).

## 🔴 Bug phát hiện lúc làm GĐ C: `tierOfEngine` route sai từ GĐ B

Bản GĐ B (2026-08-10) coi MỌI engine không phải `vieneu` là tier `'ext'` (process riêng) hễ
`resolveExtensionEngineSpawn()` tìm thấy runtime đã cài — **không phân biệt kind**. Nhưng GĐ A
đã cho engine torch-free (`onnx-ext`, vd MOSS) nạp được NGAY TRONG process đang chạy qua
`create_engine()`'s sys.path append (phía Python) — nghĩa là MOSS đáng lẽ phải ở tier
`'bundled'`, không cần spawn process riêng. `tierOfEngine` GĐ B bỏ qua thông tin này, khiến
MOSS vẫn bị tách process không cần thiết dù cơ chế nạp tại chỗ đã có sẵn từ GĐ A.

Sửa: `tierOfEngine()` giờ đọc `engineRuntimeKind(engineId)` (từ manifest cục bộ, không cần
hỏi server — quan trọng vì hàm này còn được gọi lúc cold-start, chưa có server nào để hỏi).
CHỈ kind `'torch'` mới trả `'ext'`; mọi kind khác trả `'bundled'`.

Gate thêm ở `startPythonServerOnce()`: `resolveExtensionEngineSpawn()` giờ chỉ được gọi khi
`tier === 'ext'` — trước đây gọi vô điều kiện theo `engineId`, nên nếu tier `'bundled'` được
chọn cho MỘT engine mở rộng torch-free (vd chọn MOSS làm engine khởi động ban đầu), code cũ
vẫn lỡ đổi cmd/args sang runtime RIÊNG của MOSS thay vì spawn bằng lệnh mặc định (điều mà
tier `'bundled'` cần để rồi `create_engine()` tự sys.path-append đúng lúc chạy).

### Verify thật

Trên process bundled đang chạy (đã warm VieNeu), gọi thẳng `POST /engines/switch` cho MOSS:

```
{"ok":true,"current":"moss-tts-nano","reused":false,"elapsed_ms":3319,"loaded":["vieneu","moss-tts-nano"]}
```

`ps aux` trước/sau: **vẫn đúng 1 process Python** (`main.py`, cùng PID) — không sinh thêm
process nào cho MOSS, đúng như tier `'bundled'` phải xử sự.

**Giới hạn của lượt verify này:** xác nhận qua gọi thẳng endpoint HTTP của process đang chạy
(cùng cơ chế `tts:engine-switch` dùng), không phải click thật qua UI (không có cách drive
Electron UI từ CLI trong phiên này). Logic phía Electron (`tierOfEngine`→`ensureTierForEngine`
→`tryFastSwitch`) đã đọc lại toàn bộ và typecheck qua, nhưng đường IPC đầu-cuối từ renderer
chưa được bấm thật.

## IPC + UI mới

- `tts:runtime-disk-usage` — trả `[{kind, bytes, engineIds}]` cho từng kind có dữ liệu.
- `EngineManager`: thêm dòng "Thư viện dùng chung: torch — 2.4GB (voxcpm)" ngay dưới hộp
  "Nơi lưu trữ", tách khỏi "Chiếm đĩa" của từng engine để không gây hiểu lầm xoá 1 engine là
  hết ngay dung lượng đó.

## Sự cố ngoài lề lúc verify (không liên quan code)

Khởi động lại app dev 2 lần liên tiếp quá nhanh gây `EADDRINUSE :::8765` (cổng slide-backend,
không phải TTS) do process cũ chưa kịp nhả cổng — khiến toàn bộ `ipcMain.handle` không đăng
ký được (lỗi "No handler registered" hàng loạt). Không phải bug từ thay đổi GĐ C — dọn sạch
process con (`pkill -9`), chờ port nhả hẳn rồi khởi động lại là hết.

## Chưa làm (GĐ D)

Thêm Qwen3-TTS 0.6B/1.7B — chặn bởi D0 (xác minh Qwen có tiếng Việt không) và D1 (spike bản
ONNX cộng đồng trước khi quyết định vào tier nào).
