"""
onnx_providers.py — Chọn ONNX Runtime execution provider + số thread cho VieNeu.

Vấn đề: lib VieNeu vendored HARDCODE providers=["CPUExecutionProvider"] ở 2 chỗ
(onnx_runtime_lite.py:112 và :304) và KHÔNG forward tham số `threads`. Ta không sửa
site-packages (mất khi rebuild venv), nên module này:

  1. detect_providers(): liệt kê provider onnxruntime thật sự khả dụng + phân loại.
  2. resolve_providers(): map lựa chọn của người dùng ("cpu"/"coreml"/"cuda"/...) sang
     danh sách provider hợp lệ, luôn có CPUExecutionProvider làm fallback cuối.
  3. patched_session(): context manager monkeypatch ort.InferenceSession trong lúc
     KHỞI TẠO engine để tiêm providers + intra_op_num_threads vào MỌI session được
     tạo (bắt cả 2 chỗ hardcode). Patch chỉ sống trong `with`, khôi phục sau đó.

Đọc lựa chọn từ env do Electron truyền:
  VIENEU_ONNX_PROVIDERS  — CSV, vd "CoreMLExecutionProvider,CPUExecutionProvider"
                           hoặc alias ngắn "coreml"/"cuda"/"cpu"/"directml"/"auto".
  VIENEU_ONNX_THREADS    — int, số intra-op thread (0 = mặc định ORT).
"""
from __future__ import annotations

import contextlib
import os
from typing import Iterator, List, Optional

# Alias ngắn (từ UI/env) → tên provider đầy đủ của onnxruntime.
_ALIAS_TO_PROVIDER = {
    "cpu": "CPUExecutionProvider",
    "coreml": "CoreMLExecutionProvider",
    "cuda": "CUDAExecutionProvider",
    "directml": "DmlExecutionProvider",
    "dml": "DmlExecutionProvider",
}

# Phân loại provider → kind (để UI nhóm CPU vs accelerator).
_PROVIDER_KIND = {
    "CPUExecutionProvider": "cpu",
    "CoreMLExecutionProvider": "coreml",
    "CUDAExecutionProvider": "cuda",
    "DmlExecutionProvider": "directml",
    "AzureExecutionProvider": "remote",
}

# Provider ĐÃ BIẾT không chạy được graph VieNeu (dù onnxruntime báo "available"),
# hoặc không phải accelerator cục bộ hợp lệ để chọn.
# - CoreML: fail vì weights external-data + KV cache rỗng dynamic-shape (test 2026-07).
# - Azure: EP remote, không phải tăng tốc cục bộ → không cho chọn.
# → không bao giờ auto-chọn; UI hiển thị available nhưng works=false.
_KNOWN_BROKEN = frozenset({"CoreMLExecutionProvider", "AzureExecutionProvider"})

# ── Provider hỗ trợ THEO ENGINE ──────────────────────────────────────────────
# Mỗi engine hỗ trợ tập provider khác nhau (khả năng runtime + đã kiểm chứng):
#   - VieNeu: CPU chạy tốt; CoreML KHÔNG chạy (đã test); CUDA/DirectML chưa kiểm chứng.
#   - MOSS:   chỉ nhận cpu/cuda (code MOSS chỉ 2 lựa chọn — không có CoreML/DirectML).
# `supported`: engine CÓ THỂ nhận provider này không (ẩn hẳn nếu không).
# `broken`:    available nhưng đã biết không chạy được với engine (disable + chú thích).
_ENGINE_PROVIDER_SUPPORT: dict[str, dict] = {
    "vieneu": {
        "supported": {"CPUExecutionProvider", "CUDAExecutionProvider",
                      "DmlExecutionProvider", "CoreMLExecutionProvider"},
        "broken": {"CoreMLExecutionProvider"},   # test 2026-07: fail
    },
    "moss-tts-nano": {
        "supported": {"CPUExecutionProvider", "CUDAExecutionProvider"},  # MOSS chỉ cpu/cuda
        "broken": set(),                          # CUDA hỗ trợ chính thức (cần onnxruntime-gpu)
    },
}
# Mặc định (engine lạ): giữ như VieNeu để an toàn.
_DEFAULT_SUPPORT = _ENGINE_PROVIDER_SUPPORT["vieneu"]

# Nhãn hiển thị thân thiện cho UI.
_PROVIDER_LABEL = {
    "CPUExecutionProvider": "CPU",
    "CoreMLExecutionProvider": "CoreML (Apple)",
    "CUDAExecutionProvider": "CUDA (NVIDIA)",
    "DmlExecutionProvider": "DirectML (Windows GPU)",
    "AzureExecutionProvider": "Azure",
}


def _available_providers() -> List[str]:
    try:
        import onnxruntime as ort
        return list(ort.get_available_providers())
    except Exception:
        return ["CPUExecutionProvider"]


def detect_providers(engine_id: str | None = None) -> List[dict]:
    """
    Liệt kê provider onnxruntime THEO ENGINE (UI switch CPU/GPU).

    Returns list of:
      { id, label, kind, available, works, supported }
    - available: onnxruntime + nền tảng cho phép (get_available_providers).
    - supported: engine CÓ THỂ nhận provider này (ẩn hẳn ở UI nếu False).
    - works:     available VÀ supported VÀ không nằm trong danh sách broken của engine
                 → cho chọn. Nếu available nhưng !works → disable + chú thích.
    """
    support = _ENGINE_PROVIDER_SUPPORT.get(engine_id or "", _DEFAULT_SUPPORT)
    supported_set = support["supported"]
    broken_set = support["broken"]

    avail = set(_available_providers())
    known = [
        "CPUExecutionProvider",
        "CoreMLExecutionProvider",
        "CUDAExecutionProvider",
        "DmlExecutionProvider",
    ]
    for p in avail:
        if p not in known:
            known.append(p)

    out = []
    for pid in known:
        supported = pid in supported_set
        if not supported:
            continue  # ẩn hẳn provider engine không nhận (vd CoreML với MOSS)
        available = pid in avail
        works = available and pid not in broken_set and pid not in _KNOWN_BROKEN
        # CPU luôn works nếu available.
        out.append({
            "id": pid,
            "label": _PROVIDER_LABEL.get(pid, pid),
            "kind": _PROVIDER_KIND.get(pid, "other"),
            "available": available,
            "supported": supported,
            "works": works,
        })
    return out


def resolve_providers(selection: Optional[str] = None) -> List[str]:
    """
    Map lựa chọn người dùng → danh sách provider onnxruntime hợp lệ.

    `selection` có thể là:
      - None / "" / "auto"  → dùng cái tốt nhất khả dụng (accelerator > CPU).
      - alias ngắn "cpu"/"coreml"/"cuda"/"directml"
      - CSV tên đầy đủ "CoreMLExecutionProvider,CPUExecutionProvider"

    Luôn bảo đảm CPUExecutionProvider có ở CUỐI danh sách (fallback an toàn), và
    lọc bỏ provider không thực sự khả dụng để ORT không ném lỗi.
    """
    avail = set(_available_providers())
    sel = (selection or "").strip()

    chosen: List[str] = []
    if not sel or sel.lower() == "auto":
        # AUTO = CPU. KHÔNG tự chọn accelerator: CoreML hỏng với VieNeu, CUDA/DirectML
        # chưa kiểm chứng + cần lib cài thêm. Người dùng phải chọn tường minh (và qua
        # probe) mới bật accelerator. Đây là mặc định AN TOÀN sau sự cố CoreML 500.
        pass
    else:
        for token in sel.split(","):
            t = token.strip()
            if not t:
                continue
            full = _ALIAS_TO_PROVIDER.get(t.lower(), t)
            # Bỏ provider đã biết hỏng dù người dùng có cố chọn (tránh 500 hàng loạt).
            if full in _KNOWN_BROKEN:
                continue
            if full in avail and full not in chosen:
                chosen.append(full)

    # CPU luôn là fallback cuối.
    if "CPUExecutionProvider" not in chosen:
        chosen.append("CPUExecutionProvider")
    return chosen


def resolve_threads(threads: Optional[int] = None) -> int:
    """Số intra-op thread; 0 = để ORT tự quyết. Đọc env nếu không truyền tường minh."""
    if threads is None:
        raw = os.environ.get("VIENEU_ONNX_THREADS", "").strip()
        try:
            threads = int(raw) if raw else 0
        except ValueError:
            threads = 0
    return max(0, int(threads))


@contextlib.contextmanager
def patched_session(providers: List[str], threads: int = 0) -> Iterator[None]:
    """
    Trong khối `with`, mọi ``onnxruntime.InferenceSession(...)`` được tạo sẽ dùng
    `providers` + `intra_op_num_threads=threads` — bất kể caller (lib vendored) truyền gì.

    Đây là cách tiêm provider/thread vào 2 chỗ hardcode của lib mà không sửa site-packages.
    Patch phục hồi ngay khi thoát khối, nên không ảnh hưởng phần còn lại của tiến trình.
    """
    import onnxruntime as ort

    orig_cls = ort.InferenceSession
    log = __import__("logging").getLogger("Vieneu.OnnxProviders")

    class _PatchedSession(orig_cls):  # type: ignore[misc, valid-type]
        def __init__(self, *args, **kwargs):
            # Ép SessionOptions với thread mong muốn.
            so = kwargs.get("sess_options")
            if so is None and len(args) >= 2 and isinstance(args[1], ort.SessionOptions):
                so = args[1]
            if so is None:
                so = ort.SessionOptions()
                kwargs["sess_options"] = so
            if threads and threads > 0:
                so.intra_op_num_threads = threads
            # Ép providers mong muốn (ghi đè list hardcode của lib).
            kwargs["providers"] = list(providers)
            # Bỏ providers nếu nó lỡ nằm trong positional args (lib truyền kwarg nên hiếm).
            try:
                super().__init__(*args, **kwargs)
            except Exception as e:
                # Fallback: nếu provider chọn lỗi (vd CoreML từ chối 1 graph), lùi về CPU.
                log.warning("Provider %s lỗi (%s) — fallback CPUExecutionProvider", providers, e)
                kwargs["providers"] = ["CPUExecutionProvider"]
                super().__init__(*args, **kwargs)

    ort.InferenceSession = _PatchedSession  # type: ignore[assignment]
    try:
        log.info("ONNX providers=%s threads=%s", providers, threads or "default")
        yield
    finally:
        ort.InferenceSession = orig_cls  # type: ignore[assignment]
