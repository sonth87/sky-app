# 2026-08-24 — Nâng cấp `vieneu` 3.0.9 → 3.3.0 trong `apps/tts-service`

**Quyết định:** Bump `vieneu==3.0.9` → `vieneu==3.3.0` trong `apps/tts-service/requirements.txt`, sửa `VieneuEngine.encode_reference()`/`.synthesize()` (`server/engine.py`) theo API mới của thư viện.

**Lý do:** Tác giả VieNeu-TTS cập nhật nhiều kể từ 3.0.9 (torch-free voice cloning trên CPU/ONNX, 20 preset voices mới, v3 Turbo cải thiện chunk/hallucination...). Kiểm tra trực tiếp source (venv cài thật + repo GitHub) thấy 3.0.9 → 3.3.0 đổi contract của đúng 2 hàm sky-app đang gọi:

- `encode_reference()`: 3.0.9 trả 1 `np.ndarray`; 3.3.0 trả tuple `(speaker_emb, ref_codes)`.
- `infer()`: 3.0.9 nhận kwarg `ref_codes=` tường minh; 3.3.0 **bỏ hẳn** `ref_codes=` khỏi signature — rơi vào `**kwargs` và bị lờ đi lặng lẽ. Giọng clone giờ truyền qua `voice={"speaker_emb":…, "codes":…}` (hoặc `voice=`/`ref_audio=` cho preset/clone-từ-path).

Nếu chỉ bump version trong `requirements.txt` mà không sửa `engine.py`: server **không lỗi, không crash** — nhưng mọi giọng "cloned" (voice do người dùng tự ghi/tải lên) sẽ âm thầm fallback về preset mặc định của thư viện thay vì đọc bằng giọng đã clone. Đây là loại bug nguy hiểm nhất cho TTS: không ai biết cho tới khi nghe thấy sai giọng.

**Tác dụng phụ cần biết cho lần build/release tới:**

- `numpy` 1.26→2.5, `soxr` 0.3→1.1 (đã nới ceiling trong `requirements.txt` thành `numpy>=2,<3` / `soxr>=1.0,<2`; đã grep toàn bộ `server/*.py` không dùng alias numpy 1.x nào bị xoá ở numpy 2.0).
- 3.3.0 kéo thêm dependency **mới hoàn toàn** so với 3.0.9: `librosa`, `numba`, `llvmlite`, `scikit-learn`, `scipy`, `kaldi-native-fbank`, `pooch`, `joblib`. `gradio` đã có sẵn từ 3.0.9 (không phải mới thêm). Vẫn **không có torch** — giữ đúng tinh thần "CPU torch-free" ban đầu — nhưng footprint đĩa tăng đáng kể. `numba`/`llvmlite` (JIT compile + dynamic import) là loại thư viện nổi tiếng khó đóng gói với PyInstaller — **cần build thử thật** (`pnpm --filter @sky-app/tts-service build:mac` / `build:win`) để xác nhận `vieneu-server.spec` gom đủ trước khi release, chưa verify bước này.
- Model bundled cũ trong `apps/shell-electron/resources/vieneu` (snapshot `75ff82a72f54d55ed389e1eeb12041d3c4bac7d4`) thiếu file `speaker_encoder.onnx` mà 3.3.0 cần cho bước encode reference → tự tải bổ sung ~185MB qua HuggingFace khi chạy online lần đầu. Cơ chế cache-theo-hash-`requirements.txt` sẵn có trong `build.sh`/`build-win.js` (xem `docs/dev/build-and-release.md`) sẽ tự trigger việc này vì `requirements.txt` đã đổi — không cần sửa gì thêm, chỉ cần build máy có mạng lần đầu.
- `apps/tts-service` là 1 trong các `extraResources` bị electron-builder đóng gói → theo `docs/dev/versioning.md`, đây là thay đổi **Loại 2**: cần `pnpm dist` (rebuild binary TTS) + publish lại (GitHub Release cho Windows / `.dmg` thủ công cho macOS) trước khi tới tay người dùng thật — KHÔNG tự động qua OTA renderer-only.
- 10 preset voice cũ (Ngọc Lan, Gia Bảo...) trong `voice_registry.py`'s `PRESET_VOICES` dùng tên/`reserved_id` theo catalog của bản cũ, đang `hidden: True` nên không lộ ra UI — nếu sau này bật lên hoặc gọi `synthesize_preset()` với tên cũ, catalog 3.3.0 (Adam + 20 giọng mới) nhiều khả năng không còn tên đó → lỗi `ValueError` cứng (dễ phát hiện, chưa cần xử lý ngay vì đang ẩn).

**Verify:** `pytest tests/` 390/390 xanh. Smoke test thủ công ngoài suite — load `VieneuEngine` thật (model bundled, offline sau khi tải bổ sung), `encode_reference()` + `synthesize()` với ref wav thật (`nam_minh.wav`), chấm bằng chính `analyze_quality()` sẵn có trong `engine.py` → score 100/100, không cờ cảnh báo.

**Liên quan:** [`apps/tts-service/server/engine.py`](../../../apps/tts-service/server/engine.py), [`apps/tts-service/requirements.txt`](../../../apps/tts-service/requirements.txt), [`docs/dev/versioning.md`](../versioning.md), [`docs/dev/build-and-release.md`](../build-and-release.md).
