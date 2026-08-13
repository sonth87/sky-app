# 2026-08-11 — Sửa lỗi Hủy cài engine TTS âm thầm xoá dữ liệu + UI kẹt "đang cài" dù đã xong

> Phát hiện qua báo cáo của Sonth: cài Qwen3-TTS 1.7B (đường MLX, xem
> [2026-08-11 — Thêm MLX cho Qwen](./2026-08-11-them-mlx-cho-qwen.md)) xong nhưng màn "Quản lý
> engine TTS" đứng mãi ở "Đang cài thư viện...". Điều tra trực tiếp qua process/filesystem trên
> máy dev (không chỉ đọc log) — thấy 3 bug độc lập. Ban đầu chỉ sửa Bug 1 + 2 (UI), verify xong
> tưởng đã hết; Sonth báo lại vẫn thấy đứng ở "Đang cài thư viện" ~15 phút sau đó (KHÔNG có tiến
> trình pip nào chạy thật, xác nhận qua `ps`) → đào tiếp mới lộ Bug 3, mới là **nguyên nhân gốc**
> thật sự của toàn bộ triệu chứng — Bug 1/2 vẫn là bug thật, đáng sửa, nhưng không phải lý do
> chính khiến Qwen không bao giờ "xong" được. Sau khi restart app để nạp fix Bug 3, Qwen 1.7B
> load được và dùng thử tổng hợp giọng nói thật — lộ tiếp Bug 4 (log lỗi thật từ Sonth khi test).

## Bug 4 — `GET /capabilities` crash (500) khi Qwen (MLX) đang là engine phục vụ

`main.py`'s `get_capabilities()` đọc thẳng `_engine.providers`/`_engine.threads` (thuộc tính,
KHÔNG qua `getattr`/Protocol) — quy ước ngầm, không phải phần khai báo bắt buộc của
`TTSEngine` Protocol (`engine.py`, chỉ có `encode_reference`/`synthesize`/`synthesize_preset`).
Mọi engine khác (`VieneuEngine`, `MossNanoEngine`, `QwenEngine` torch, `VoxCpmEngine`) đều tự
set 2 field này trong `__init__` (kể cả các engine không dùng onnxruntime thật — vd
`QwenEngine` torch tái dùng `resolve_providers()` chỉ để suy ra người dùng có muốn CUDA hay
không, không phải vì torch cần "provider" kiểu ONNX). `QwenMlxEngine` (viết mới cùng ngày, xem
[Thêm MLX cho Qwen](./2026-08-11-them-mlx-cho-qwen.md)) là engine DUY NHẤT bỏ sót bước này —
Traceback thật (Sonth gửi kèm log dev console):

```
AttributeError: 'QwenMlxEngine' object has no attribute 'providers'
  File ".../main.py", line 490, in get_capabilities
    "current_providers": _engine.providers if _engine is not None else [],
```

**Vì sao `verify_engine.py`'s dry-run không bắt được** (dù đã "verify chạy đúng thật trên phần
cứng" theo history trước): dry-run chỉ gọi các method Protocol khai báo + `capabilities()`
(method riêng, trả dict — KHÁC hẳn `GET /capabilities`, endpoint FastAPI đọc thuộc tính trực
tiếp). 2 khái niệm trùng tên nhưng không liên quan gì nhau — dry-run không có lý do gì để chạm
tới đường này.

**Sửa**: `QwenMlxEngine.__init__` thêm `self.providers = ["MLXProvider"]` (nhãn mô tả, không
phải provider onnxruntime thật — MLX không có khái niệm chọn provider, chỉ 1 GPU tích hợp qua
Metal) + `self.threads = 0` (quy ước có sẵn trong codebase: 0 = để runtime tự quyết, xem
`resolve_threads()`). Không đụng `capabilities()` (dict method) — key `"providers"` trong đó
không được frontend dùng ở đâu (đã grep xác nhận), không cần thêm.

Verify: `py_compile` xanh, 32/32 test cũ vẫn pass. Chưa gọi lại `/capabilities` thật qua HTTP với
Qwen đang phục vụ (cần app đang chạy Qwen — cùng giới hạn "process Python không tự nạp code
mới" đã ghi ở Bug 3, phải đợi Sonth restart/thử lại để xác nhận hết crash thật).

## Bug 3 (nguyên nhân gốc) — Python tìm sai thư mục engine cho ID có dấu chấm

`ttsEngineDir(engineId)` phía Electron (`data/paths.ts`) sanitize tên thư mục: thay mọi ký tự
KHÔNG PHẢI chữ/số/`_`/`-` bằng `_` (chặn path traversal) — `"qwen-1.7b"` → thư mục thật trên đĩa
là `qwen-1_7b` (dấu chấm → gạch dưới). Phía Python, `engine_registry.py`'s `_engine_data_dir()`
VÀ `engine_qwen.py`/`engine_qwen_mlx.py`'s `_model_dir()` đều ghép thẳng `Path(base) /
engine_id` — KHÔNG sanitize — nên tìm thư mục `qwen-1.7b` (còn dấu chấm), thư mục đó **không
bao giờ tồn tại**.

Hệ quả: `engine_install_status("qwen-1.7b")` báo `'missing'` VĨNH VIỄN dù model+runtime đã tải/
cài đủ 100% trên đĩa — verify thật bằng cách gọi thẳng hàm này trên máy dev (env
`VIENEU_ENGINES_DIR` trỏ đúng thư mục thật):

| | Trước fix | Sau fix |
|---|---|---|
| `engine_dir_name("qwen-1.7b")` | (không có hàm này) | `qwen-1_7b` |
| `engine_install_status("qwen-1.7b")` (dữ liệu ĐÃ CÓ ĐỦ trên đĩa) | `missing` | `installed` |
| `engine_install_status("voxcpm")` (ID không có dấu chấm, không bị ảnh hưởng) | `installed` | `installed` (không đổi) |

Chỉ 2 engine_id trong registry hiện tại có dấu chấm: `qwen-0.6b`, `qwen-1.7b` — bug này KHÔNG
ảnh hưởng `moss-tts-nano`/`voxcpm` (không có dấu chấm, raw ID trùng luôn với ID đã sanitize).
Đây cũng là lý do bug tồn tại từ lúc thêm Qwen (cùng ngày) mà không bị phát hiện ngay — chưa có
engine_id nào khác chứa dấu chấm trước đó để lộ ra.

**Nghiêm trọng hơn UI**: `_model_dir()` (dùng khi THẬT SỰ load model để chạy inference) cũng bị
lỗi y hệt — nghĩa là kể cả nếu người dùng lách qua được UI để "chọn dùng" Qwen, việc load model
vẫn sẽ ném `RuntimeError: Model ... chưa tải` do tìm sai thư mục. Bug này không chỉ khiến UI
hiển thị sai — Qwen **chưa từng thật sự dùng được** dù cài "thành công" bao nhiêu lần.

**Sửa**: thêm hàm dùng chung `engine_dir_name(engine_id)` (`engine_registry.py`) — sanitize
CHÍNH XÁC theo cùng quy tắc Electron dùng (`re.sub(r"[^a-zA-Z0-9_-]", "_", engine_id)`). Áp dụng
ở cả 3 chỗ ghép `engine_id` vào path: `_engine_data_dir()` (engine_registry.py),
`_model_dir()` (engine_qwen.py, engine_qwen_mlx.py) — `engine_qwen_mlx.py`/`engine_qwen.py`
import hàm này từ `engine_registry` (an toàn, không vòng lặp import vì `engine_registry.py`
chỉ import ngược lại 2 module đó BÊN TRONG hàm, lúc gọi, không phải ở đầu file).

**Liên hệ với Bug 1**: fix "đồng bộ lại progress theo `install_status` thật" ở Bug 1 CHỈ có tác
dụng nếu `install_status` bản thân nó ĐÚNG. Trước khi sửa Bug 3, `install_status` của Qwen luôn
sai ('missing' dù đã xong) — nên dù UI có tự đối chiếu lại, nó đối chiếu với 1 con số sai, không
bao giờ tự "khỏi" được. Bug 3 là điều kiện CẦN để Bug 1's fix thật sự phát huy tác dụng cho Qwen.

Test: 32/32 test cũ (`pytest tests/`) vẫn pass sau khi sửa. Verify thật bằng cách gọi trực tiếp
`engine_install_status()` với `VIENEU_ENGINES_DIR` trỏ đúng thư mục userData thật trên máy dev
(bảng số liệu ở trên) — chưa verify qua UI Electron thật (chưa restart app để nạp code Python
mới; process Python là tiến trình con sống lâu, KHÔNG tự nạp lại code khi sửa file, phải
restart app hoặc chờ lần tự respawn tiếp theo).

## Bug 1 — Progress cục bộ không tự đồng bộ lại theo trạng thái thật

`EngineManager.tsx`'s `progress` (state cục bộ, chỉ cập nhật qua event IPC
`tts:engine-install-progress`) không có cơ chế nào tự khớp lại với `install_status` thật lấy từ
`GET /engines` mỗi khi `refresh()` chạy. Nếu event `'done'` cuối cùng vì lý do gì đó không tới
được renderer (cửa sổ đổi webContents, dev HMR reload đúng lúc...), UI đứng mãi ở phase cũ dù
backend đã cài xong từ lâu — xác nhận thật trên máy dev: `manifest.json` báo `status: "installed"`
lúc 11:27, không có tiến trình `pip`/python nào chạy, nhưng UI vẫn hiện "Đang cài thư viện" lúc
13:3x (hơn 2 tiếng sau).

## Bug 2 — Hủy (Cancel) dùng chung đường phát progress với Tạm dừng (Pause), nhưng hành vi khác hẳn

`cancel()` (`engine-installer.ts`) gọi `this.ac.abort()` rồi `rmSync(this.dir(), {recursive:true})`
— xoá **toàn bộ** thư mục engine (model + runtime đã cài, không phân biệt đã xong hay dở). Nhưng
các nhánh `if (signal.aborted)` rải rác trong `runDownload`/`installRuntime`/`handleError` (viết
cho `pause()`, không phân biệt được nguồn abort) vẫn phát `phase: 'paused'` y hệt như khi người
dùng chủ động tạm dừng. Kết quả quan sát được: Sonth bấm "Hủy" lúc tưởng UI treo ở bước cài thư
viện → UI hiện lại y hệt "Đã tạm dừng" (progress bar/% không đổi) → cảm giác "bấm chẳng có tác
dụng gì" — trong khi thực tế **toàn bộ 4.5GB model + runtime MLX đã cài xong bị xoá sạch trong im
lặng**, xác nhận qua so sánh trực tiếp `tts-engines/qwen-1_7b/` biến mất hoàn toàn giữa 2 lần kiểm
tra filesystem trong cùng phiên hội thoại.

## Đã làm

### Phân biệt 'canceled' khỏi 'paused' (contract + backend)

- `packages/slide-shared/src/slide-api.ts`'s `EngineInstallProgress.phase` + `engine-installer.ts`'s
  `InstallProgress.phase`: thêm giá trị `'canceled'`.
- `cancel()`: set cờ `private canceling = false` (field mới) → `true` ngay trước `abort()`, xoá
  xong thì tự phát `phase: 'canceled'` (không phải dựa vào nhánh `signal.aborted` chung như trước).
  3 nơi phát `'paused'` khi `signal.aborted` (`runDownload`'s 2 chỗ, `installRuntime`, `handleError`)
  đều thêm điều kiện `if (!this.canceling)` — nhường việc báo tiến độ lại cho `cancel()`.
- **Cân nhắc timing quan trọng**: KHÔNG reset `canceling` về `false` ở cuối `cancel()`. `abort()`
  chỉ dispatch event đồng bộ cho listener `once` (vd `proc.kill()`), nhưng promise bọc ngoài
  (`await downloadFile()`, `await new Promise(...)` chờ `proc.on('close')`) chỉ settle ở **tick
  sau** — reset ngay trong `cancel()` sẽ khiến cờ về `false` TRƯỚC KHI các nhánh trên kịp đọc,
  quay lại y hệt bug cũ. Chỗ reset đúng: đầu `downloadFromHf()`/`importFromLocal()` — lượt tải
  MỚI mới cần cờ sạch, không phải lúc `cancel()` vừa gọi xong.
- `packages/slide-shared`: `pnpm build` để dist type propagate sang `service-contracts`/
  `tts-engine-ui` (2 package đó resolve type qua `@sky-app/slide-shared`'s `dist/*.d.ts`, không
  qua `src/` — sửa xong PHẢI build package nguồn, không chỉ sửa `.ts`).

### UI (`packages/tts-engine-ui/src/EngineManager.tsx`)

- Nút Hủy giờ có `confirm()` trước khi gọi (giống nút Xoá engine đã cài sẵn có) — nói rõ sẽ xoá
  HẲN cả phần đã tải xong, không resume được. Đây là hàng rào quan trọng nhất trong 3 thay đổi:
  ngăn xoá nhầm hàng GB chỉ vì tưởng UI bị treo.
- Subscribe progress: `phase === 'canceled'` cũng trigger `refresh()` (giống `done`/`error`) +
  hiện `msg` "Đã hủy — đã xoá dữ liệu tải dở" để có phản hồi rõ ràng thay vì im lặng.
- `refresh()`: thêm bước đồng bộ lại `progress` cục bộ theo `install_status` thật mỗi lần fetch —
  CHỈ xoá progress cũ khi 2 trạng thái **không thể nào đúng cùng lúc**:
  - `install_status === 'installed'` mà phase local khác `'done'` → chắc chắn cũ (đang cài dở thì
    server không thể đã báo xong).
  - `install_status === 'missing'` mà phase local là `installing-runtime`/`verifying`/`paused`/
    `importing` → chắc chắn cũ (các phase đó đòi hỏi ĐÃ có file thật trên đĩa, server tối thiểu
    phải báo `'partial'`).
  - **Cố ý KHÔNG** áp dụng cho `'resolving'`/`'downloading'` — 2 phase này có thể trùng
    `install_status === 'missing'` trong khoảnh khắc đầu (thư mục vừa `mkdirSync`, chưa byte nào
    rơi xuống đĩa) của 1 lượt tải THẬT đang chạy; xoá nhầm ở đây sẽ làm mất tiến độ hiển thị hợp
    lệ. Đánh đổi: nếu 1 lượt tải bị "chết" ngay từ giây đầu (0 byte, không bao giờ tiến), UI có thể
    vẫn kẹt — chấp nhận được vì hiếm hơn nhiều so với 2 bug đã xác nhận thật.

### i18n (`packages/tts-engine-ui/src/locales.ts`)

Thêm `engineManager.cancelConfirm` (câu hỏi xác nhận) + `engineManager.canceledMsg` (vi + en).

### UI: bỏ dòng "Thư viện dùng chung" khỏi màn danh sách (theo yêu cầu riêng của Sonth trong
cùng phiên, không phải bug)

Dòng "Thư viện dùng chung: PyTorch (nặng, chạy tiến trình riêng) — 0 B (voxcpm)..." (nguồn
`port.runtimeDiskUsage()`, thêm ở [GĐ C](./2026-08-11-runtime-dung-chung-theo-kind.md)) quá kỹ
thuật với người dùng thường — bỏ khỏi `EngineManager.tsx` (state `runtimeUsage` + fetch +
block render), bỏ luôn key i18n `sharedRuntime` (không còn nơi dùng). GIỮ NGUYÊN port method
`runtimeDiskUsage()`/IPC `tts:runtime-disk-usage` (service-contracts, platform-electron,
python-server.ts) — chỉ ẩn khỏi UI, dữ liệu vẫn có sẵn nếu sau này cần màn "Nâng cao"/debug.

## Chưa làm / còn mở

- **Process Python đang chạy dở KHÔNG tự nạp lại code mới** — sửa file `.py` không có tác dụng
  cho tới khi app restart (respawn tiến trình Python con). Nếu đang đọc bug này lúc app vẫn chạy
  từ trước khi fix được áp — Qwen vẫn sẽ báo 'missing' như cũ cho tới lúc restart. Áp dụng cho cả
  Bug 4 (chưa restart lại lần nữa sau khi thêm `self.providers`/`self.threads` thì `/capabilities`
  vẫn crash như cũ).
- Chưa rà toàn bộ `main.py` tìm thuộc tính "ngầm định" khác tương tự `providers`/`threads` mà
  `QwenMlxEngine` có thể còn thiếu — chỉ mới kiểm tra hết các chỗ gọi `_engine.<attr>` (Bug 4's
  mục "Sửa"), chưa test end-to-end 1 lượt tổng hợp giọng nói Qwen đầy đủ (encode_reference →
  synthesize → response) qua HTTP thật.
- Chưa click thật qua UI Electron để verify Bug 1/2 (không có cách drive renderer từ CLI trong
  phiên này) — đã đọc lại toàn bộ luồng + build `slide-shared` xanh, nhưng chưa xác nhận bằng mắt
  nút Hủy mới hiện đúng hộp `confirm()`. Bug 3 ĐÃ verify thật (bảng số liệu ở trên, gọi thẳng hàm
  Python với `VIENEU_ENGINES_DIR` trỏ đúng thư mục thật) — mức tin cậy cao hơn Bug 1/2.
- Edge case "lượt tải chết ngay từ 0 byte" (xem cân nhắc ở trên) chưa có cơ chế tự phục hồi —
  nếu gặp thật, cách xử lý hiện tại vẫn là đóng/mở lại app (dọn state cục bộ hoàn toàn).
- Chưa thêm test tự động cho `cancel()`'s cờ `canceling` (thuần logic, có thể test bằng cách mock
  `spawn`/`downloadFile` và assert phase phát ra là `'canceled'` không phải `'paused'`) — để dành
  đợt sau nếu cần.
- Chưa thêm test cho `engine_dir_name()`/dấu chấm trong `engine_id` — nên thêm case này vào
  `tests/test_engine_qwen.py`/`test_engine_qwen_mlx.py` (assert `_model_dir()` trỏ đúng thư mục
  đã sanitize) để tránh regress nếu sau này có ai lỡ quay lại dùng `self.engine_id` thẳng.
