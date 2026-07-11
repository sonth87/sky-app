"""
verify_engine.py — Dry-run kiểm tra một engine LOAD được (không phục vụ HTTP).

Dùng cho luồng tải-theo-nhu-cầu: sau khi tải model + runtime, chạy script này bằng
CHÍNH runtime của engine (Python + torch...) để chắc chắn engine khởi tạo được
TRƯỚC khi cho đổi sang nó. Tránh: tải xong nhưng lỗi → đổi engine → server không lên.

Usage:
    python verify_engine.py <engine_id>

Exit code 0 = OK (in "VERIFY_OK"); != 0 = lỗi (in "VERIFY_FAIL: <lý do>").
In JSON 1 dòng ra stdout để caller (Electron) parse: {"ok": bool, "error": str|null}.

Đọc env như server chính: VIENEU_ENGINES_DIR (nơi model/runtime), HF_HOME... để
engine tìm được model đã tải.
"""
from __future__ import annotations

import json
import sys


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "Thiếu engine_id"}), flush=True)
        return 2

    engine_id = sys.argv[1]
    try:
        from engine_registry import create_engine
        engine = create_engine(engine_id)
        # Kiểm capabilities gọi được (engine sống thật).
        caps = engine.capabilities() if hasattr(engine, "capabilities") else {}
        # Giải phóng nếu engine có close().
        if hasattr(engine, "close"):
            try:
                engine.close()
            except Exception:
                pass
        print(json.dumps({"ok": True, "error": None, "capabilities": caps}, ensure_ascii=False), flush=True)
        return 0
    except NotImplementedError as e:
        print(json.dumps({"ok": False, "error": f"Engine chưa nối factory: {e}"}, ensure_ascii=False), flush=True)
        return 1
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"{type(e).__name__}: {e}"}, ensure_ascii=False), flush=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
