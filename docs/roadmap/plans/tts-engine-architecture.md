---
status: in_progress
owner: sonth87
created: 2026-08-10
target_version: apps/shell-electron 0.4.0 (GĐ A→C)
supersedes: null
implemented_doc: null
---

> **Cập nhật 2026-08-11:** GĐ A, B, C, D, E đã code xong + verify — xem:
> - [GĐ A/B](../../dev/history/2026-08-10-doi-engine-tts-tai-cho.md), [GĐ C](../../dev/history/2026-08-11-runtime-dung-chung-theo-kind.md)
> - [GĐ D — thêm Qwen (torch)](../../dev/history/2026-08-11-them-qwen3-tts.md): D0/D1
>   kết luận Qwen3-TTS mã nguồn mở KHÔNG có tiếng Việt nhưng vẫn thêm (ceremony/TTS Studio
>   đi qua TTS server chung, không cột cứng VieNeu); bản ONNX cộng đồng bị loại (FP32 nặng
>   HƠN bf16 gốc — 14GB cho 1.7B); needs_gpu=true vì package `qwen-tts` có bug report CPU;
>   **chưa verify runtime được** (máy dev không có CUDA).
> - [GĐ E — thêm MLX](../../dev/history/2026-08-11-them-mlx-cho-qwen.md): luồng runtime
>   thứ 3 (cạnh onnx/torch) cho Apple Silicon — Qwen tự chọn MLX (Metal, không cần CUDA)
>   trên Mac, torch (CUDA) nơi khác, cùng 1 engine_id. **Đã verify THẬT trên GPU Apple
>   Silicon** (máy dev), khác D2b's giới hạn "chưa verify" — đối chiếu code thật của
>   voicebox trước khi viết, phát hiện 3 điểm README cộng đồng sai/thiếu so với thực tế.

# Kế hoạch: Kiến trúc engine TTS đa tầng (ONNX mặc định + torch theo nhu cầu)

> Mục tiêu do user đặt ra: **"nhanh, hiệu quả, tối ưu hiệu năng, dung lượng"**. Cụ thể:
> mặc định chỉ chạy `onnxruntime` cho VieNeu; khi cần torch thì chuyển sang được, chấp nhận
> lần chuyển ĐẦU TIÊN chậm, nhưng **những lần sau phải nhanh**. Đồng thời thêm 2 model mới:
> Qwen3-TTS 0.6B và 1.7B.

## 1. Bối cảnh

Kế hoạch này sinh ra từ đợt đối chiếu sky-app với [Voicebox](https://github.com/) (app TTS
desktop Tauri + Python, bản khảo sát ở `/Users/skyline/TEST/voicebox-main`). Quan sát khởi
điểm của user:

> "khi chuyển model thấy rất lâu, ví dụ đang ở model vieneu chuyển sang model voxcpm, thời
> gian chuyển cực kỳ lâu. ở voicebox tôi không thấy diễn ra việc chuyển model như của sky-app
> như vậy, nó chỉ chọn model và cho bắt đầu generate voice."

Nguyên nhân đã truy được (chi tiết §2). Điểm khác biệt gốc: voicebox chạy **1 process Python
sống suốt phiên**, mọi engine là code có sẵn trong process đó, "đổi model" chỉ là gọi hàm khác
+ lazy-load weight vào dict cache (`_tts_backends`, `backends/__init__.py:670-730` của
voicebox). sky-app thì **1 engine = 1 process**, đổi engine = giết + spawn lại.

**Quyết định đã chốt với user (2026-08-10):**
- Thứ tự: làm nền tảng trước (GĐ A → B → C), rồi mới thêm Qwen (GĐ D). Lý do: Qwen khi vào sẽ
  tự động hưởng switch nhanh + không nhân bản torch, không phải làm lại.
- Qwen: spike bản ONNX cộng đồng trước, fallback torch nếu không đạt.

## 2. Chẩn đoán hiện trạng (đã verify trên code thật)

### 2.1. Một process = một engine → switch chậm

[`apps/tts-service/server/main.py:45`](../../../apps/tts-service/server/main.py) khai
`_engine = None` — **biến đơn, không phải cache**. Engine tạo 1 lần trong `lifespan()` (dòng
262-271) từ env `VIENEU_ENGINE` hoặc config. Không có đường nào đổi engine trong cùng process.

Hệ quả: [`tts:engine-switch`](../../../apps/shell-electron/electron/slide/ipc.ts) (ipc.ts:823-879)
buộc phải `stopPythonServer()` + `startPythonServer()`.

### 2.2. Model bị load HAI LẦN cho một lần đổi

Trong cùng handler `tts:engine-switch`:

1. **Dòng 845-849** — `inst.verify()` spawn `verify_engine.py` làm dry-run, load full model chỉ
   để kiểm "load được không", rồi vứt process đó đi.
2. **Dòng 863-865** — `stopPythonServer()` + `startPythonServer()` load **lại từ đầu chính model
   đó** vào process mới.

Comment tại [`python-server.ts:10-15`](../../../apps/shell-electron/electron/slide/python-server.ts)
ghi nhận đo thực tế: VoxCPM (torch, model ~4.5GB) mất **118 giây chỉ để đọc safetensors từ
đĩa**. Nhân đôi ≈ 4 phút, cộng `STOP_TIMEOUT_MS` 3s + `verifyEngineActive()` poll tới 20s.

Đây là nguyên nhân chính của "cực kỳ lâu" — không phải model vốn chậm, mà là **làm 2 lần một
việc**.

### 2.3. 🔴 Torch bị nhân bản trên đĩa

[`engine-installer.ts:467`](../../../apps/shell-electron/electron/slide/engine-installer.ts)
(`installRuntime()`):

```ts
const runtimeRoot = join(this.dir(), 'runtime');   // this.dir() = ttsEngineDir(engineId)
const runtimeDir  = join(runtimeRoot, 'site-packages');
```

→ **mỗi engine có site-packages RIÊNG**. Cài VoxCPM (torch) rồi sau này thêm Qwen-torch =
torch tải + lưu **2 lần**. Ước lượng của chính preflight ([engine-installer.ts:118](../../../apps/shell-electron/electron/slide/engine-installer.ts))
là `runtimeMb = hasTorch ? 2500 : 300` → **lãng phí ~2.5GB cho mỗi engine torch thêm vào**.

Cộng thêm [`ttsAccelDir()`](../../../apps/shell-electron/electron/slide/data/paths.ts) (paths.ts:154)
là bản Python + site-packages **thứ ba** hoàn toàn tách biệt (dựng bởi `tts:install-accel`,
ipc.ts:966-983, cài trọn `requirements.txt` + gói tăng tốc).

Đây là điểm lãng phí đĩa lớn nhất hiện tại và là lý do GĐ C tồn tại.

### 2.4. `_ref_codes_cache` phẳng theo `voice_id` — bug chờ sẵn

[`main.py:52`](../../../apps/tts-service/server/main.py) khai `_ref_codes_cache: dict[str, object] = {}`,
key là `voice_id` (main.py:292, 528, 634, 748-754). Ref embedding do `encode_reference()` của
**engine cụ thể** sinh ra — embedding của VieNeu KHÔNG dùng được cho VoxCPM/Qwen.

Hiện tại vô hại vì mỗi process chỉ có 1 engine. Nhưng **ngay khi GĐ A cache nhiều engine trong
cùng process, đây thành bug thật**: đổi engine xong, giọng clone sẽ dùng embedding của engine
cũ → sai giọng hoặc crash. Phải namespace theo engine cùng lúc với GĐ A, không được để sau.

### 2.5. Điểm may mắn: MOSS đã torch-free

[`engine_registry.py:58-94`](../../../apps/tts-service/server/engine_registry.py) cho thấy
`moss-tts-nano` khai `pip_packages` chỉ gồm `onnxruntime`, `numpy`, `sentencepiece`,
`soundfile`, `soxr` — **không có torch**. Nghĩa là tier ONNX đã có sẵn 2 engine (VieNeu +
MOSS) đang bị tách process một cách vô ích.

## 3. Kiến trúc đích

Hai **tier runtime**, mỗi tier là một process Python, cả hai sống song song:

| | Tier A — ONNX | Tier B — torch |
|---|---|---|
| Engine | VieNeu (bundled), MOSS-TTS-Nano, *(Qwen nếu spike ONNX đạt)* | VoxCPM, *(Qwen nếu fallback)* |
| Vòng đời | **Luôn sống** từ lúc app khởi động | Spawn **lần đầu** user chọn engine torch, sau đó giữ ấm |
| Khởi động | Nhanh (đã bundle sẵn) | Chậm lần đầu (import torch + load model) — user đã chấp nhận |
| Runtime | Binary/portable đóng gói sẵn, 0 mạng | Portable Python + site-packages **dùng chung cả tier** (GĐ C) |
| RAM giữ ấm | Rẻ (~0.5-1GB/engine) → cache tối đa 3 | Đắt (~4.5GB/engine) → mặc định giữ 1, có nút Unload |

**Cái làm nên "lần sau nhanh"** = 2 thứ cộng lại, hiện chưa có cái nào:
1. Dict cache engine **trong** mỗi process (GĐ A) → đổi engine cùng tier là tức thì.
2. Hai process **sống song song** (GĐ B) → quay về tier A tức thì vì tier A chưa bao giờ bị kill.

Ma trận thời gian đổi engine sau khi hoàn tất:

| Từ → Đến | Hiện tại | Sau kế hoạch |
|---|---|---|
| VieNeu → MOSS (A→A) | kill + spawn + load ×2 | **tức thì** (cache hit) hoặc 1 lần load |
| VieNeu → VoxCPM (A→B), lần đầu | ~4 phút | 1 lần load (~2 phút, bỏ double-load) |
| VieNeu → VoxCPM (A→B), lần sau | ~4 phút | **tức thì** (process B còn sống, engine còn ấm) |
| VoxCPM → VieNeu (B→A) | ~1 phút | **tức thì** (tier A chưa bao giờ chết) |

## 4. Các giai đoạn

### GĐ A — Engine cache trong process *(chỉ đụng Python, không đụng Electron)*

Đây là giai đoạn đòn bẩy cao nhất: tự nó đã xử lý phần lớn cảm giác chậm và bỏ được double-load.

**A1. `main.py`: `_engine` → cache nhiều engine**
- `_engine` (biến đơn) → `_engines: dict[str, TTSEngine]` + `_current_engine_id: str`.
- `VIENEU_ENGINE` env đổi ngữ nghĩa: từ "engine DUY NHẤT của process này" → "engine KHỞI TẠO
  ban đầu". Giữ tương thích ngược: process spawn không kèm env vẫn đọc `config.engine`.
- Chính sách giữ ấm + eviction LRU, cap cấu hình được (mặc định: tier ONNX 3, tier torch 1).

**A2. Namespace `_ref_codes_cache` theo engine** *(bắt buộc cùng A1 — xem §2.4)*
- Key `voice_id` → `(engine_id, voice_id)`, hoặc dict lồng `{engine_id: {voice_id: emb}}`.
- Rà cả 5 chỗ đụng cache: main.py:292, 528, 634, 661, 748-754.
- Unload engine → xoá luôn ref codes của engine đó.

**A3. Endpoint mới**
- `POST /engines/switch {engine_id}` — load vào cache (nếu chưa) + set current, **không restart
  process**. Trả lỗi rõ nếu engine không thuộc tier của process này (Electron dùng tín hiệu này
  để biết phải chuyển tier).
- `POST /engines/unload {engine_id}` — giải phóng RAM, giữ file trên đĩa (mẫu nút "Unload" của
  voicebox — tách bạch với Delete).
- `GET /engines` mở rộng: thêm `loaded: [engine_id...]` + `tier` cho mỗi engine.

**A4. Tương tác với `_synth_lock`**
- `_synth_lock` (main.py:51) hiện serialize mọi synthesize. Load engine mới trong lúc đang
  synthesize phải an toàn: load **dưới lock riêng** (`_load_lock`), và switch current chỉ commit
  sau khi load xong — tránh request đang chạy dở bị đổi engine giữa chừng.

**A5. Electron: bỏ double-load cho switch cùng tier**
- `tts:engine-switch` (ipc.ts:823): nếu engine đích cùng tier với process đang chạy → gọi
  `POST /engines/switch`, **bỏ hẳn** `inst.verify()` (dòng 845-849) và cặp stop/start
  (dòng 863-865). Health-check sau switch thay cho verify.
- Giữ nguyên đường cũ (verify + restart) cho trường hợp khác tier — GĐ B sẽ thay nốt.

**Verify GĐ A:** pytest cho `_engines` cache + `_ref_codes_cache` namespace (repo hiện **chưa
có pytest nào** cho `main.py` — xem `docs/roadmap/plans/ga7.5-audit/03-tts-architecture.md` mục
D1, đây là dịp bổ sung). Test thủ công: VieNeu ↔ MOSS đổi qua lại, đo thời gian + xác nhận
giọng clone vẫn đúng sau khi đổi.

---

### GĐ B — Tách tier + pool process

**B1. Registry khai tier tường minh**
- `engine_registry.py`: thêm field `runtime_kind: 'onnx-bundled' | 'onnx-ext' | 'torch'` cho mỗi
  engine. Hiện thông tin này chỉ suy ra được gián tiếp (có `torch` trong `pip_packages` hay
  không) — làm tường minh để Electron route không phải đoán.

**B2. `python-server.ts`: 1 process → pool theo tier**
- `pythonProcess` (biến đơn, dòng 17) + `actualPort` (dòng 18) → `Map<tier, {proc, port, status}>`.
- `getPythonPort()` → `getPortForEngine(engineId)`. Rà mọi call site (`vieneu-tts.ts`,
  `engine-installer.ts:56,70`, `ipc.ts` các handler).
- `stopPythonServer()` → stop theo tier + `stopAllPythonServers()` lúc app quit.
- `TtsProcessStatus` / icon menu bar: gộp trạng thái nhiều tier (tier A ready là đủ để báo
  "sẵn sàng"; tier B đang khởi động hiện riêng).

**B3. Blue-green handoff khi đổi tier**
- Spawn tier đích trên port trống (`findFreePort()` đã có sẵn, dòng 29) **trong khi tier hiện
  tại vẫn phục vụ bình thường** → chờ `waitForHealth()` trên port mới → chỉ khi OK mới chuyển
  routing.
- Lợi ích kép: (a) bỏ hẳn `verify()` riêng vì health-check của process mới CHÍNH LÀ verify;
  (b) không cần `rollbackToVieneu()` (ipc.ts:881-904) — tier cũ chưa từng bị đụng nên fail là
  tự động giữ nguyên hiện trạng.

**B4. An toàn hành lễ**
- Tier A **không bao giờ** bị kill khi đang có SV trên sân khấu.
- Spawn tier B (tốn CPU/RAM) chặn khi `isOnStage()` — tái dùng cơ chế đã có ở
  `engine-installer.ts:95-101`.
- Cân nhắc: tự unload tier B khi vào chế độ hành lễ để trả RAM cho tier A (cần chốt sau).

**Verify GĐ B:** đo ma trận thời gian ở §3 trên máy thật. Xác nhận không có process zombie khi
quit (bug đã từng gặp — xem comment `STOP_TIMEOUT_MS`, python-server.ts:582-590).

---

### GĐ C — Runtime dùng chung theo tier *(phần trả cổ tức dung lượng)*

**C1. Đổi layout thư mục**
- Hiện: `<ttsEnginesDir>/<engineId>/runtime/site-packages` (mỗi engine một bản).
- Đích: `<ttsEnginesDir>/_runtime/<runtime_kind>/site-packages` (cả tier dùng chung).
- `installRuntime()` (engine-installer.ts:464) đổi đích ghi; skip pip nếu tier đó đã đủ gói.

**C2. Tương thích ngược + migration**
- `resolveExtensionEngineSpawn()` (python-server.ts:198) dò **cả 2 vị trí**: shared trước,
  per-engine cũ sau → engine đã cài trước đó vẫn chạy, không bắt cài lại.
- Không tự động xoá runtime cũ; cung cấp nút "dọn dẹp" báo rõ dung lượng thu hồi được.

**C3. Gộp `ttsAccelDir` vào cùng cơ chế**
- Runtime tăng tốc (ipc.ts:966) hiện là bản Python thứ 3 → đưa về `_runtime/onnx-accel/`.

**C4. Sửa `diskUsage()` và `deleteEngine()` cho đúng ngữ nghĩa mới**
- `diskUsage()` (engine-installer.ts:443) hiện cộng cả thư mục engine → khi runtime tách ra
  shared, phải báo tách bạch "model riêng" vs "runtime dùng chung", **không cộng trùng** runtime
  vào từng engine.
- 🔴 `deleteInstall()` (engine-installer.ts:431) hiện `rmSync(this.dir())` — với runtime shared,
  xoá 1 engine **không được** xoá runtime nếu engine khác cùng tier còn dùng. Cần refcount hoặc
  kiểm tra engine cùng `runtime_kind` còn cài hay không.

**Lợi ích đo được:** mỗi engine torch thêm vào tiết kiệm ~2.5GB; gộp accel runtime tiết kiệm
thêm một bản Python + trọn `requirements.txt`.

---

### GĐ D — Thêm Qwen3-TTS 0.6B & 1.7B ✅ đã code (D2b)

**D0. Xác minh tiếng Việt — KẾT LUẬN: không có, nhưng không phải điều kiện chặn.**

Xác nhận qua model card HuggingFace chính chủ (`Qwen/Qwen3-TTS-12Hz-{0.6B,1.7B}-Base`, không
chỉ dựa config phụ của voicebox): 10 ngôn ngữ `zh/en/ja/ko/de/fr/ru/pt/es/it`, **không có tiếng
Việt**. Ban đầu đặt câu hỏi "Qwen hơn MOSS ở điểm gì" để biện minh dung lượng — quyết định thực
tế (Sonth, 2026-08-11): **không cần** — ceremony/TTS Studio đi qua TTS server chung, không cột
cứng theo VieNeu; Qwen là 1 lựa chọn giọng thêm trong catalog như MOSS/VoxCPM đã có, không cần
"thắng" MOSS mới đáng thêm.

**D1. Spike ONNX — KẾT LUẬN: KHÔNG đạt, đi torch.**

Đo dung lượng thật (HF API), không phải ước lượng:

| Ứng viên | Dung lượng thật | Vấn đề |
|---|---|---|
| [`romara-labs/...0.6B-Base-ONNX`](https://huggingface.co/romara-labs/Qwen3-TTS-12Hz-0.6B-Base-ONNX) (FP32) | **4.18GB** | Nặng hơn bf16 gốc (2.34GB) ~1.8 lần |
| [`arubeh/...1.7b-base-onnx`](https://huggingface.co/arubeh/qwen3-tts-12hz-1.7b-base-onnx) (FP32, có parity-verified) | **14GB** | Nặng hơn bf16 gốc (4.23GB) ~3.3 lần — phi thực tế |
| [`sivasub987/...0.6B-ONNX-INT8`](https://huggingface.co/sivasub987/Qwen3-TTS-0.6B-ONNX-INT8) | 1.6GB — nhẹ thật | "Requires ConvInteger support... fail on standard CPU execution" — cần GPU/onnxruntime đặc biệt (MLAS), rủi ro không chạy trên máy CPU-only |
| [`xkos/...1.7B-ONNX`](https://huggingface.co/xkos/Qwen3-TTS-12Hz-1.7B-ONNX) | Không công bố | 27 lượt tải/tháng, không tuyên bố parity |

Lý do gốc: export FP32 chỉ đổi định dạng, không giảm bit so với bf16 — "nhẹ hơn" CHỈ đúng với
INT8, nhưng bản INT8 duy nhất tìm được vướng compat CPU. 14GB cho 1.7B tự nó đã đủ loại bỏ
đường này bất kể các tiêu chí khác.

**→ D2b (torch), đã code:**
- `apps/tts-service/server/engine_qwen.py` — 1 class `QwenEngine` dùng chung cho cả 2 kích
  thước (tham số hoá qua `engine_id`/`label`, khác VoxCPM/MOSS mỗi file 1 engine cố định vì
  Qwen chỉ khác nhau ở repo/size, code inference giống hệt). Implement Protocol `TTSEngine`.
- `engine_registry.py`: 2 entry `qwen-0.6b`/`qwen-1.7b`, `runtime_kind: 'torch'`,
  `install.model.repo = Qwen/Qwen3-TTS-12Hz-{0.6B,1.7B}-Base`, `total_mb` đo thật qua HF API
  (1750/3690, KHÔNG phải ước lượng) — dùng chung `ttsRuntimeDir('torch')` với VoxCPM (GĐ C),
  không nhân bản ~2.5GB torch runtime.
- **`needs_gpu: true`** — khác VoxCPM (`false`, có RTF CPU đo thật). Package `qwen-tts` chính
  chủ có bug report công khai (QwenLM/Qwen-Audio#85) về `device_map` bỏ qua GPU/luôn chạy CPU
  không chủ đích — chưa có số đo CPU đáng tin, máy dev (Apple Silicon, không CUDA) không tự
  verify runtime được trong phiên làm việc này.
- **Bug thời (stale logic) phát hiện khi thêm engine torch thứ hai**: `mustRespawn` ở
  `python-server.ts` (viết ở GĐ B, trước khi GĐ C chia sẻ runtime) ép respawn process mỗi lần
  đổi engine trong tier `'ext'` dù engine đích cùng kind — đã sửa: chỉ respawn khi 2 engine
  thật sự trỏ site-packages khác nhau (`resolveEngineRuntimeLocation()` so sánh), tức chỉ còn
  xảy ra khi 1 trong 2 vẫn ở bố cục runtime riêng cũ (chưa cài lại từ GĐ C).
- Ngôn ngữ: `generate_voice_clone()` của Qwen cần tham số `language` tường minh (không tự nhận
  diện). Client truyền qua `engine_overrides[engineId].language` (đúng cơ chế MOSS dùng cho
  `max_new_frames`); không truyền thì heuristic theo Unicode script (CJK/Cyrillic nhận đúng,
  chữ Latin — de/fr/pt/es/it — đều rơi về "English", hạn chế đã biết, không thêm dependency
  nhận diện ngôn ngữ chỉ cho việc này).
- Test: `apps/tts-service/tests/test_engine_qwen.py` (9 case, chỉ phần thuần logic — không
  nạp model thật vì cần GPU + tải vài GB, không khả thi trong CI/máy dev không CUDA).
- **Chưa verify runtime** (chạy inference thật, nghe chất lượng, xác nhận CPU có chạy được hay
  không) — cần máy có CUDA hoặc chấp nhận rủi ro CPU chưa rõ.

## 5. Rủi ro & điểm cần theo dõi

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Qwen không có tiếng Việt → giá trị thấp cho ceremony | Cao | D0 xác minh trước, trước khi tốn công GĐ D |
| Bản ONNX cộng đồng lệch chất lượng bản gốc | Trung bình | Spike có bước nghe đối chứng, không chỉ "chạy không lỗi" |
| RAM khi giữ ấm nhiều engine torch | Trung bình | Cap giữ ấm mặc định 1 cho tier B + nút Unload + tự unload khi hành lễ |
| `_ref_codes_cache` sai engine | **Cao nếu quên** | A2 bắt buộc làm CÙNG A1, không tách ra sau |
| `deleteEngine` xoá nhầm runtime dùng chung | Cao | C4 refcount trước khi xoá |
| Regression giữa buổi lễ | Cao | GĐ A/B giữ nguyên đường cũ làm fallback; không big-bang (AGENTS.md §2.6) |

## 6. Việc còn mở (chưa chốt)

- Cap giữ ấm cụ thể cho từng tier — nên để cấu hình trong Device Settings hay hard-code?
- Có tự unload tier B khi vào chế độ hành lễ không (trả RAM cho tier A) — cần đo RAM thật trước.
- Sau GĐ C, có nên đóng gói sẵn runtime torch ở CI (tải archive + checksum thay vì pip trên máy
  user) như voicebox làm cho CUDA/ROCm? Đây là hướng riêng, phụ thuộc việc pip-resolve trên máy
  user có thực sự gây lỗi trong thực tế hay không.

## 7. Ghi chú tuân thủ

- Mọi thay đổi trong `apps/shell-electron/electron/` (GĐ A5, B, C) **bắt buộc** theo quy trình
  version/OTA ở [`docs/dev/versioning.md`](../../dev/versioning.md) — xem cảnh báo AGENTS.md §4.
  GĐ B thêm/đổi IPC channel → thuộc Loại 2, phải bump + ghi `VERSION.json` + file history.
- Không big-bang: mỗi GĐ phải giữ Ceremony chạy được (AGENTS.md §2.6).
