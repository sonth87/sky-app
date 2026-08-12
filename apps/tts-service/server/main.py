"""
main.py — FastAPI TTS server cho VieNeu.

Endpoints (backward compat với apps/slide, KHÔNG thay đổi):
  POST /synthesize  { text, speaker_id, speed }  → raw PCM Int16 bytes + X-Sample-Rate header
  GET  /health
  GET  /preview/{voice_id}

Endpoints mới (Giai đoạn 2+ mới integrate vào apps/slide):
  GET  /voices
  POST /voices/clone
  PUT  /voices/{voice_id}
  DELETE /voices/{voice_id}

Env vars (truyền từ Electron qua python-server.ts):
  VIENEU_PORT          — port server lắng nghe
  HF_HOME              — HuggingFace model cache dir
  HF_HUB_OFFLINE       — '1' để tắt auto-update
  RESOURCES_PATH       — resources/ dir của packaged app
  VIENEU_REF_DIR       — thư mục chứa ref WAV files (server GHI cloned-ref mới vào đây)
  VIENEU_CATALOG_DIR   — (optional, dev-only) thư mục CHỈ ĐỌC chứa {lang}/catalog.json —
                         override riêng cho việc browse catalog, tách khỏi VIENEU_REF_DIR
                         để dev test không ghi nhầm vào source tree có git track
  VIENEU_PREVIEW_DIR   — thư mục chứa preview WAV files
  LOG_FILE_PATH        — path ghi debug log
  VIENEU_REGISTRY_PATH — (optional) path tới voice-registry.json
"""
from __future__ import annotations

import asyncio
import inspect
import os
import traceback
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

# ── Globals — được init trong lifespan(), KHÔNG set tại module level ─────────
_engine = None            # engine ĐANG dùng — luôn trỏ tới 1 phần tử của _engines
_registry = None          # VoiceRegistryJson hoặc VoiceRegistrySqlite (xem create_voice_registry)
_config = None            # ConfigStore instance (advanced infer params + device + engine)
_preview_dir: Path | None = None  # FIX: không đọc env tại module level
_ref_dir: Path | None = None
_catalog_dir: Path | None = None
_synth_lock = asyncio.Lock()
_LOG_FILE: Path | None = None

# ── Cache engine (GĐ A: đổi engine KHÔNG cần restart process) ────────────────
# Trước đây `_engine` là biến đơn: mỗi process chỉ phục vụ đúng 1 engine, nên đổi
# engine bắt buộc giết + spawn lại process → nạp lại model từ đầu (đo thực tế VoxCPM
# ~118s CHỈ để đọc safetensors). Giữ engine đã nạp trong cache để lần đổi sau là tức
# thì. `_engine` vẫn còn (trỏ tới engine hiện hành) để mọi call site cũ chạy nguyên vẹn.
_engines: dict[str, object] = {}       # engine_id -> instance đã nạp (gồm cả engine hiện hành)
_engine_lru: list[str] = []            # thứ tự dùng, PHẦN TỬ CUỐI = mới dùng nhất
_current_engine_id: str | None = None
# Nạp engine mới mất hàng chục giây–vài phút; KHÔNG giữ _synth_lock suốt thời gian đó
# (sẽ chặn mọi request đọc). Khoá riêng này chỉ chống 2 lượt đổi engine chồng nhau.
_load_lock = asyncio.Lock()

# Hạn mức giữ ấm theo loại runtime. Engine torch ngốn vài GB RAM mỗi bản (VoxCPM 2B
# ~4.5GB) nên mặc định chỉ giữ 1; engine ONNX rẻ hơn nhiều nên giữ được vài bản.
_CACHE_MAX_ONNX = max(1, int(os.environ.get("VIENEU_CACHE_MAX_ONNX", "3")))
_CACHE_MAX_TORCH = max(1, int(os.environ.get("VIENEU_CACHE_MAX_TORCH", "1")))

# Ref codes (embedding giọng clone) — LỒNG THEO ENGINE, không phẳng theo voice_id.
# Embedding do encode_reference() của TỪNG engine sinh ra, KHÔNG dùng chéo được: cache
# phẳng như trước sẽ trả embedding của engine cũ cho engine mới sau khi đổi (sai giọng
# hoặc crash). Vô hại khi mỗi process chỉ có 1 engine, nhưng thành bug thật ngay khi
# cache nhiều engine chung process — nên sửa cùng lúc với _engines.
_ref_codes_cache: dict[str, dict[str, object]] = {}   # engine_id -> voice_id -> embedding


# ── Logging ──────────────────────────────────────────────────────────────────

def _write_log(message: str) -> None:
    if not _LOG_FILE:
        return
    try:
        _LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with _LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(f"{datetime.now().isoformat(timespec='seconds')} {message}\n")
    except Exception:
        pass


def _safe_console(message: str) -> None:
    """
    In ra stdout an toàn trên mọi nền tảng.
    Windows console mặc định dùng cp1252 → print() tiếng Việt/emoji sẽ ném
    UnicodeEncodeError và làm crash cả tiến trình. Bọc lại để không bao giờ crash.
    """
    try:
        print(message, flush=True)
    except UnicodeEncodeError:
        try:
            encoded = message.encode("utf-8", errors="replace").decode("utf-8")
            print(encoded, flush=True)
        except Exception:
            pass


# ── HF snapshot healing (giữ nguyên từ bản cũ) ───────────────────────────────

def _resolve_hf_snapshot_pointers(root: Path) -> int:
    resolved = 0
    if not root or not root.exists():
        return resolved
    is_windows = os.name == "nt"
    for path in root.rglob("*"):
        if path.is_symlink() or not path.is_file():
            continue
        try:
            content = path.read_text(encoding="utf-8").strip()
        except Exception:
            continue
        if not content.startswith("../"):
            continue
        target = (path.parent / content).resolve()
        if not target.exists() or not target.is_file():
            continue
        try:
            if is_windows:
                path.write_bytes(target.read_bytes())
            else:
                path.unlink()
                os.symlink(content, path)
            resolved += 1
            _safe_console(f"[TTS] Resolved pointer: {path}")
        except Exception as e:
            _safe_console(f"[TTS] WARN: failed to resolve {path}: {e}")
    return resolved


def _heal_hf_refs(root: Path) -> None:
    if not root or not root.exists():
        return
    hub_dir = root / "hub"
    if not hub_dir.exists():
        return
    for model_dir in hub_dir.iterdir():
        if not model_dir.is_dir() or not model_dir.name.startswith("models--"):
            continue
        refs_main = model_dir / "refs" / "main"
        snapshots_dir = model_dir / "snapshots"
        if not (refs_main.exists() and snapshots_dir.exists()):
            continue
        try:
            current_ref = refs_main.read_text(encoding="utf-8").strip()
        except Exception:
            continue
        if (snapshots_dir / current_ref).exists():
            continue
        try:
            snapshots = [p for p in snapshots_dir.iterdir() if p.is_dir() and not p.name.startswith(".")]
        except Exception:
            continue
        if len(snapshots) == 1:
            actual_hash = snapshots[0].name
            try:
                refs_main.write_text(actual_hash, encoding="utf-8")
                msg = f"[TTS] Healed refs/main: {model_dir.name}: {current_ref} -> {actual_hash}"
                _safe_console(msg)
                _write_log(msg)
            except Exception as e:
                _safe_console(f"[TTS] Failed to heal refs/main for {model_dir.name}: {e}")


# ── REF DIR resolution ────────────────────────────────────────────────────────

def _pick_ref_dir() -> Path:
    """Resolve ref dir theo thứ tự ưu tiên."""
    candidates: list[Path] = []

    env_dir = os.environ.get("VIENEU_REF_DIR", "")
    if env_dir:
        candidates.append(Path(env_dir))

    resources_env = os.environ.get("RESOURCES_PATH", "")
    if resources_env:
        rp = Path(resources_env)
        candidates.extend([rp / "voice-ref", rp / "voices"])

    # Relative fallbacks khi chạy dev từ source
    # server/main.py → server/ → tts-service/ → apps/ → monorepo root
    base = Path(__file__).resolve().parent.parent.parent.parent
    candidates.extend([
        base / "apps" / "slide" / "resources" / "voice-ref",
        Path(__file__).resolve().parent.parent / "resources" / "voice-ref",
    ])

    for c in candidates:
        if c and c.exists():
            _safe_console(f"[TTS] REF_DIR = {c}")
            _write_log(f"[TTS] REF_DIR = {c}")
            return c

    raise RuntimeError(
        f"Không tìm thấy voice-ref dir. Candidates: {[str(c) for c in candidates if c]}"
    )


def _pick_catalog_dir(ref_dir: Path) -> Path:
    """Resolve catalog dir (read-only system voice library) with fallback to ref_dir.

    `VIENEU_CATALOG_DIR` (dev-only, xem python-server.ts's getDevVoiceRefDir) ưu tiên cao
    nhất — trỏ thẳng vào apps/tts-service/resources/voice-ref (nguồn thật có git track) để
    voice/thư mục ngôn ngữ mới thêm vào đó hiện ra ngay trong /voices/catalog, không cần
    build.sh sync/copy tay. Tách riêng khỏi VIENEU_REF_DIR (`ref_dir` tham số) vì dir đó còn
    bị server GHI file mới vào (cloned-ref WAV) — nếu catalog cũng đọc từ đó, mỗi lần dev bấm
    nghe thử/chọn 1 catalog voice sẽ tự đẻ file + sửa voice-registry.json ngay trong source
    tree, hiện lên git status ngoài ý muốn.
    """
    catalog_env = os.environ.get("VIENEU_CATALOG_DIR", "")
    if catalog_env and Path(catalog_env).exists():
        return Path(catalog_env)

    resources_env = os.environ.get("RESOURCES_PATH", "")
    if resources_env:
        rp = Path(resources_env)
        cand = rp / "voice-ref"
        if cand.exists():
            return cand
        cand_voices = rp / "voices"
        if cand_voices.exists():
            return cand_voices

    # Fallback khi dev
    base = Path(__file__).resolve().parent.parent.parent.parent
    dev_candidates = [
        base / "apps" / "slide" / "resources" / "voice-ref",
        Path(__file__).resolve().parent.parent / "resources" / "voice-ref",
    ]
    for c in dev_candidates:
        if c.exists():
            return c

    return ref_dir


# ── Cache engine + ref codes ─────────────────────────────────────────────────

def _ref_cache(engine_id: str | None = None) -> dict[str, object]:
    """Ngăn ref-codes của MỘT engine (tạo rỗng nếu chưa có)."""
    eid = engine_id or _current_engine_id or "vieneu"
    return _ref_codes_cache.setdefault(eid, {})


def _ref_cache_forget_voice(voice_id: str) -> None:
    """Xoá ref codes của 1 voice khỏi MỌI engine (dùng khi voice bị xoá khỏi registry)."""
    for per_engine in _ref_codes_cache.values():
        per_engine.pop(voice_id, None)


def _cache_bucket(engine_id: str) -> str:
    """Nhóm hạn mức RAM của engine: 'torch' (nặng, vài GB) hay 'onnx' (nhẹ).

    Gộp 'onnx-bundled' và 'onnx-ext' vào CHUNG một nhóm — chúng cùng mức tiêu thụ RAM,
    tách hạn mức riêng sẽ cho phép giữ ấm gấp đôi số engine so với ý định.
    """
    from engine_registry import engine_runtime_kind
    return "torch" if engine_runtime_kind(engine_id) == "torch" else "onnx"


def _cache_budget(bucket: str) -> int:
    return _CACHE_MAX_TORCH if bucket == "torch" else _CACHE_MAX_ONNX


def _evict_engines() -> list[str]:
    """Thải engine cũ nhất theo LRU khi vượt hạn mức của nhóm tương ứng.

    KHÔNG bao giờ thải engine đang dùng. Trả danh sách id đã thải (để ghi log).
    """
    evicted: list[str] = []
    by_kind: dict[str, list[str]] = {}
    for eid in _engine_lru:
        by_kind.setdefault(_cache_bucket(eid), []).append(eid)

    for kind, ids in by_kind.items():
        budget = _cache_budget(kind)
        # ids theo thứ tự LRU (cũ nhất trước) — thải từ đầu cho tới khi vừa hạn mức.
        for eid in list(ids):
            if len(ids) <= budget:
                break
            if eid == _current_engine_id:
                continue
            _engines.pop(eid, None)
            _ref_codes_cache.pop(eid, None)
            _engine_lru.remove(eid)
            ids.remove(eid)
            evicted.append(eid)

    if evicted:
        import gc
        gc.collect()
    return evicted


def _activate_engine_sync(engine_id: str):
    """Nạp engine vào cache (nếu chưa) và trả instance. CHẶN — gọi qua to_thread.

    Không đụng `_engine`/`_current_engine_id`: việc chuyển con trỏ do caller làm sau,
    dưới `_synth_lock`, để request đang đọc dở không bị đổi engine giữa chừng.
    """
    cached = _engines.get(engine_id)
    if cached is not None:
        return cached

    from engine_registry import create_engine
    eng = create_engine(engine_id)
    _engines[engine_id] = eng
    return eng


def _touch_engine(engine_id: str) -> None:
    """Đánh dấu engine vừa được dùng (đẩy xuống cuối danh sách LRU)."""
    if engine_id in _engine_lru:
        _engine_lru.remove(engine_id)
    _engine_lru.append(engine_id)


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _engine, _registry, _config, _preview_dir, _ref_dir, _catalog_dir, _LOG_FILE
    global _current_engine_id

    # FIX: đọc tất cả env vars tại đây — KHÔNG tại module level
    log_path = os.environ.get("LOG_FILE_PATH", "")
    _LOG_FILE = Path(log_path) if log_path else None

    _ref_dir = _pick_ref_dir()
    _catalog_dir = _pick_catalog_dir(_ref_dir)
    _safe_console(f"[TTS] CATALOG_DIR = {_catalog_dir}")
    _write_log(f"[TTS] CATALOG_DIR = {_catalog_dir}")

    # FIX: _preview_dir resolve trong lifespan sau khi env vars đã inject
    preview_env = os.environ.get("VIENEU_PREVIEW_DIR", "")
    if preview_env and Path(preview_env).exists():
        _preview_dir = Path(preview_env)
    else:
        _preview_dir = _ref_dir.parent / "voice-previews"
    _safe_console(f"[TTS] PREVIEW_DIR = {_preview_dir} exists={_preview_dir.exists()}")
    _write_log(f"[TTS] PREVIEW_DIR = {_preview_dir}")

    hf_home_str = os.environ.get("HF_HOME", "")
    hf_home = Path(hf_home_str) if hf_home_str else None
    if hf_home and hf_home.exists():
        _heal_hf_refs(hf_home)
        resolved = _resolve_hf_snapshot_pointers(hf_home)
        if resolved:
            _safe_console(f"[TTS] Resolved {resolved} HF snapshot pointer(s)")

    # Init config store TRƯỚC (biết engine nào cần load).
    from config_store import ConfigStore, resolve_config_path
    _config = ConfigStore(resolve_config_path())
    _safe_console(f"[TTS] Config loaded from {resolve_config_path()}")

    # Init engine qua registry (multi-engine). Engine chưa implement / lỗi → fallback VieNeu.
    # Ưu tiên VIENEU_ENGINE (Electron set khi spawn runtime engine mở rộng) rồi mới config.
    engine_id = os.environ.get("VIENEU_ENGINE", "").strip() or _config.get().get("engine", "vieneu")
    _safe_console(f"[TTS] Loading engine '{engine_id}'...")
    _write_log(f"[TTS] Loading engine '{engine_id}'...")
    try:
        _engine = _activate_engine_sync(engine_id)
    except Exception as e:
        _safe_console(f"[TTS] Engine '{engine_id}' lỗi ({e}) — fallback 'vieneu'.")
        _write_log(f"[TTS] Engine '{engine_id}' lỗi: {e} — fallback vieneu")
        engine_id = "vieneu"
        _engine = _activate_engine_sync(engine_id)
    _current_engine_id = engine_id
    _touch_engine(engine_id)
    _safe_console("[TTS] Engine loaded.")
    _write_log("[TTS] Engine loaded.")

    # Init voice registry
    registry_path_env = os.environ.get("VIENEU_REGISTRY_PATH", "")
    registry_path = Path(registry_path_env) if registry_path_env else _ref_dir.parent / "voice-registry.json"

    from voice_registry import create_voice_registry
    _registry = create_voice_registry(registry_path, _ref_dir)
    _safe_console(f"[TTS] Voice registry loaded from {registry_path}")

    # Pre-encode cloned voices lúc startup để giảm latency request đầu tiên
    _safe_console("[TTS] Pre-encoding voice references...")
    for voice in _registry.list_voices(include_hidden=True):
        if voice.get("type") != "cloned":
            continue
        samples = _registry.list_samples(voice["id"])
        if not samples:
            _safe_console(f"[TTS]   {voice['id']} SKIP — không có mẫu audio nào")
            continue
        try:
            ref_path, ref_text = _resolve_voice_ref(voice["id"])
            emb = _encode_reference(_engine, str(ref_path), ref_text)
            _ref_cache()[voice["id"]] = emb
            _safe_console(f"[TTS]   {voice['id']} ({len(samples)} mẫu) OK")
            _write_log(f"[TTS]   {voice['id']} OK")
        except Exception as e:
            _safe_console(f"[TTS]   {voice['id']} WARN: {e}")
            _write_log(f"[TTS]   {voice['id']} WARN: {e}")

    _safe_console("[TTS] Ready.")
    _write_log("[TTS] Ready.")
    yield

    _engine = None
    _registry = None
    _config = None
    _current_engine_id = None
    _engines.clear()
    _engine_lru.clear()
    _ref_codes_cache.clear()


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="TTS Service", lifespan=lifespan)

# CORS — apps/shell-web (GĐ7 web parity, packages/platform-web's
# createWebTtsPort) fetch() thẳng tới service này từ trình duyệt, origin
# khác cổng (service tự chọn port rảnh, xem _find_free_port bên dưới) nên
# cần CORS. Electron's window.slide bridge (python-server.ts) gọi qua main
# process, không qua trình duyệt — không cần CORS, thêm middleware này
# không ảnh hưởng đường đó. allow_origin_regex thay vì "*" vì dev server
# (Vite) đổi port ngẫu nhiên giữa các lần chạy.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://localhost:\d+",
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
    expose_headers=["X-Sample-Rate", "X-Quality-Score", "X-Quality-Flags"],
)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


# ── Config API (advanced infer params + device + engine) ─────────────────────

@app.get("/config")
def get_config():
    if _config is None:
        raise HTTPException(503, "Config not ready")
    return _config.get()


@app.put("/config")
def put_config(body: dict):
    """Merge partial config (chỉ khóa hợp lệ được nhận), validate, lưu, trả config mới.

    LƯU Ý: đổi `infer` áp NGAY (đọc mỗi request). Đổi `device`/`engine` cần restart
    server mới có hiệu lực (session/engine tạo lúc init) — client tự gọi tts:restart.
    """
    if _config is None:
        raise HTTPException(503, "Config not ready")
    if not isinstance(body, dict):
        raise HTTPException(400, "Body phải là object JSON")
    return _config.update(body)


# ── Hiệu ứng hậu kỳ ──────────────────────────────────────────────────────────

@app.get("/effects")
def get_effects():
    """Danh sách hiệu ứng khả dụng + định nghĩa tham số (min/max/step/mặc định).

    UI dựng slider từ dữ liệu này thay vì khai lại bằng tay ở TypeScript — thêm hiệu ứng
    mới chỉ cần sửa `effects.py`, không phải sửa hai nơi rồi để chúng lệch nhau.

    `available: false` khi pedalboard chưa cài — UI ẩn phần hiệu ứng thay vì hiện bộ
    chỉnh bấm vào không có tác dụng gì.
    """
    from effects import available, get_available_effects
    if not available():
        return {"available": False, "effects": []}
    return {"available": True, "effects": get_available_effects()}


# ── Capabilities (provider/device detection cho UI switch CPU/GPU) ───────────

@app.get("/capabilities")
def get_capabilities():
    """Báo cáo provider onnxruntime khả dụng THEO ENGINE + số CPU core."""
    from onnx_providers import detect_providers
    # Engine đang chạy (từ capabilities.id) → provider list đúng cho engine đó.
    engine_id = None
    if _engine is not None and hasattr(_engine, "capabilities"):
        try:
            engine_id = _engine.capabilities().get("id")
        except Exception:
            pass
    if not engine_id:
        engine_id = (os.environ.get("VIENEU_ENGINE", "").strip()
                     or (_config.get().get("engine") if _config is not None else "vieneu"))
    return {
        "providers": detect_providers(engine_id),
        "cpu_count": os.cpu_count() or 1,
        "current_providers": _engine.providers if _engine is not None else [],
        "current_threads": _engine.threads if _engine is not None else 0,
        "engine": engine_id,
    }


# ── Engines (multi-engine) ────────────────────────────────────────────────────

@app.get("/engines")
def get_engines():
    """Liệt kê engine đăng ký + engine đang dùng (cho UI chọn engine)."""
    from engine_registry import list_engines
    live_caps = _engine.capabilities() if _engine is not None and hasattr(_engine, "capabilities") else None
    # 'current' = engine THỰC SỰ đang load (từ capabilities.id) — chính xác kể cả khi
    # fallback VieNeu. Fallback về config/env nếu engine không khai id.
    current = None
    if isinstance(live_caps, dict):
        current = live_caps.get("id")
    if not current:
        current = (_current_engine_id
                   or os.environ.get("VIENEU_ENGINE", "").strip()
                   or (_config.get().get("engine", "vieneu") if _config is not None else "vieneu"))
    return {
        "engines": list_engines(),
        "current": current,
        "current_capabilities": live_caps,
        # Engine đang giữ ấm trong RAM của process NÀY (cũ nhất trước). Đổi sang một
        # trong số này là tức thì — UI dùng để phân biệt "đổi ngay" với "phải nạp lại".
        "loaded": list(_engine_lru),
    }


class EngineSwitchRequest(BaseModel):
    engine_id: str


@app.post("/engines/switch")
async def switch_engine(req: EngineSwitchRequest):
    """Đổi engine đang dùng NGAY TRONG process này — không restart, không nạp lại 2 lần.

    Trả 409 kèm reason='unavailable_in_process' khi process hiện tại không có runtime cho
    engine đó (vd engine torch trong process ONNX). Đó KHÔNG phải lỗi: caller (Electron)
    dựa vào tín hiệu này để spawn process runtime riêng theo đường cũ.
    """
    global _engine, _current_engine_id

    engine_id = (req.engine_id or "").strip()
    if not engine_id:
        raise HTTPException(400, "Thiếu engine_id")

    async with _load_lock:
        if engine_id == _current_engine_id and _engine is not None:
            _touch_engine(engine_id)
            return {"ok": True, "current": engine_id, "reused": True,
                    "elapsed_ms": 0, "loaded": list(_engine_lru)}

        was_cached = engine_id in _engines
        started = datetime.now()
        try:
            eng = await asyncio.to_thread(_activate_engine_sync, engine_id)
        except (ImportError, NotImplementedError) as e:
            _write_log(f"[TTS] switch '{engine_id}' — không có runtime trong process này: {e}")
            raise HTTPException(409, detail={
                "reason": "unavailable_in_process",
                "engine_id": engine_id,
                "error": str(e),
            })
        except ValueError as e:
            raise HTTPException(404, detail={"reason": "unknown_engine", "error": str(e)})
        except Exception as e:
            traceback.print_exc()
            _write_log(f"[TTS] switch '{engine_id}' lỗi: {type(e).__name__}: {e}")
            raise HTTPException(500, detail={"reason": "load_failed", "error": str(e)})

        # Chuyển con trỏ DƯỚI _synth_lock: đảm bảo không có request đọc nào đang chạy dở
        # bị tráo engine giữa chừng. Phần nạp (chậm) đã xong ở trên, ngoài khoá này.
        async with _synth_lock:
            _engine = eng
            _current_engine_id = engine_id
        _touch_engine(engine_id)
        evicted = _evict_engines()

        # Ghi nhớ lựa chọn để lần khởi động sau vào đúng engine này. Lỗi ghi config không
        # được làm hỏng lượt đổi đang thành công.
        if _config is not None:
            try:
                _config.update({"engine": engine_id})
            except Exception as e:
                _write_log(f"[TTS] switch: không ghi được config.engine: {e}")

        elapsed_ms = int((datetime.now() - started).total_seconds() * 1000)
        _safe_console(f"[TTS] switched engine -> {engine_id} in {elapsed_ms}ms (cached={was_cached})")
        _write_log(f"[TTS] switched engine -> {engine_id} in {elapsed_ms}ms "
                   f"cached={was_cached} evicted={evicted}")
        return {"ok": True, "current": engine_id, "reused": was_cached,
                "elapsed_ms": elapsed_ms, "evicted": evicted, "loaded": list(_engine_lru)}


@app.post("/engines/unload")
async def unload_engine(req: EngineSwitchRequest):
    """Giải phóng RAM của 1 engine đang giữ ấm — GIỮ NGUYÊN file trên đĩa.

    Khác hẳn xoá engine (DELETE bên Electron): đây chỉ nhả bộ nhớ, lần dùng sau nạp lại
    từ đĩa được ngay, không cần tải lại gì.
    """
    engine_id = (req.engine_id or "").strip()
    if not engine_id:
        raise HTTPException(400, "Thiếu engine_id")

    async with _load_lock:
        if engine_id == _current_engine_id:
            raise HTTPException(400, "Không thể giải phóng engine ĐANG dùng — chuyển sang engine khác trước.")
        if engine_id not in _engines:
            return {"ok": True, "unloaded": False, "loaded": list(_engine_lru)}

        _engines.pop(engine_id, None)
        _ref_codes_cache.pop(engine_id, None)
        if engine_id in _engine_lru:
            _engine_lru.remove(engine_id)
        import gc
        gc.collect()
        _write_log(f"[TTS] unloaded engine '{engine_id}'")
        return {"ok": True, "unloaded": True, "loaded": list(_engine_lru)}


# ── Voices API ────────────────────────────────────────────────────────────────

@app.get("/voices")
def list_voices():
    if _registry is None:
        raise HTTPException(503, "Registry not ready")
    return _registry.list_voices(include_hidden=False)


# ── Voice catalog (thư viện vendor, read-only, resources/voice-ref/{lang}/) ──

@app.get("/voices/catalog")
def get_voice_catalog(lang: str | None = None):
    """Danh sách voice mẫu 'mặc định hệ thống' (tab riêng trên UI, khác tab 'Tuỳ chỉnh'
    của user tự clone) — dùng để search/filter/preview trước khi chọn. Chọn synthesize
    lần đầu tự động import ngầm (xem _ensure_voice_ready), KHÔNG có bước Clone riêng ở
    UI cho các voice này. `lang` optional (vd 'vi-VN'); bỏ trống trả tất cả ngôn ngữ."""
    if _catalog_dir is None:
        raise HTTPException(503, "Catalog dir not ready")
    from voice_catalog import load_catalog
    entries = load_catalog(_catalog_dir, lang)
    # `imported`: đã từng được chọn dùng (registry đã có sẵn embedding) — chỉ để UI biết
    # preview nên phát qua registry (nhanh hơn, tận dụng cache) hay phát file catalog gốc.
    imported_ids = set()
    if _registry is not None:
        for v in _registry.list_voices(include_hidden=True):
            src = v.get("source_catalog_id")
            if src:
                imported_ids.add(src)
    for e in entries:
        e["imported"] = e["id"] in imported_ids
    return entries


@app.get("/voices/catalog/{lang}/{entry_id}/audio")
def get_catalog_audio(lang: str, entry_id: str):
    """Phát file audio preview gốc (mp3/wav) của 1 catalog entry — nghe thử không
    cần engine (khác /preview/{voice_id} vốn cần voice đã ở trong registry)."""
    if _catalog_dir is None:
        raise HTTPException(503, "Catalog dir not ready")
    from voice_catalog import find_catalog_entry, get_catalog_ref_path
    entry = find_catalog_entry(_catalog_dir, lang, entry_id)
    if entry is None:
        raise HTTPException(404, f"Catalog entry not found: {lang}/{entry_id}")
    audio_path = get_catalog_ref_path(_catalog_dir, lang, entry)
    if not audio_path.exists():
        raise HTTPException(404, f"Audio file not found: {audio_path.name}")
    media_type = "audio/mpeg" if audio_path.suffix.lower() == ".mp3" else "audio/wav"
    return FileResponse(str(audio_path), media_type=media_type)


def _find_catalog_entry_any_lang(entry_id: str) -> tuple[dict, str] | None:
    """Tìm catalog entry theo id, quét tất cả ngôn ngữ có sẵn — synthesize request chỉ
    gửi speaker_id (không có lang), nên phải tự tra ngược ngôn ngữ chứa nó."""
    if _catalog_dir is None:
        return None
    from voice_catalog import list_catalog_langs, find_catalog_entry
    for lang in list_catalog_langs(_catalog_dir):
        entry = find_catalog_entry(_catalog_dir, lang, entry_id)
        if entry is not None:
            return entry, lang
    return None


def _backfill_ref_text_from_catalog(voice: dict) -> None:
    """Đồng bộ lại `ref_text` từ catalog.json cho 1 voice ĐÃ import — cần vì voice import
    TRƯỚC khi catalog có transcript (hoặc transcript catalog vừa được cập nhật sau) sẽ vĩnh
    viễn thiếu nó nếu không ai chủ động đồng bộ lại. Với Qwen, thiếu transcript = không
    synthesize được (xem engine_qwen_mlx's _run) — không phải giảm chất lượng, audio hỏng
    hoàn toàn.

    Gọi ở CẢ 2 nơi `_ensure_voice_ready` có thể trả về voice: (1) tìm thấy NGAY qua
    `get_voice(speaker_id)` khi speaker_id đã là id registry (đường phổ biến nhất — UI,
    lịch sử, mặc định của client đều nhớ id registry như "clone-xxxxx", KHÔNG phải id
    catalog gốc), và (2) nhánh idempotent trong `_import_catalog_entry` khi speaker_id vẫn
    còn là id catalog gốc. Bug thật đã gặp: chỉ có (2) từng được gọi, nên voice catalog imp-
    ort từ trước (đa số, vì UI mặc định dùng id registry) không bao giờ được backfill dù dữ
    liệu đúng đã nằm sẵn trong catalog.json.

    Kiểm qua `list_samples()`, KHÔNG phải `voice.get("ref_text")` — từ Phase 2 (nhiều mẫu/
    voice), `get_voice()` không còn trả field đó nữa (luôn None, sẽ khiến điều kiện "chưa có
    transcript" LUÔN đúng và ÂM THẦM GHI ĐÈ transcript người dùng đã tự sửa).
    """
    source_catalog_id = voice.get("source_catalog_id")
    lang = voice.get("source_lang")
    if not source_catalog_id or not lang or _catalog_dir is None:
        return

    from voice_catalog import find_catalog_entry
    entry = find_catalog_entry(_catalog_dir, lang, source_catalog_id)
    if entry is None:
        return
    cat_text = (entry.get("ref_text") or "").strip()
    if not cat_text:
        return

    existing_samples = _registry.list_samples(voice["id"])
    has_ref_text = bool(existing_samples and existing_samples[0].get("ref_text"))
    if not has_ref_text:
        _registry.set_ref_text(voice["id"], cat_text)
        _ref_cache_forget_voice(voice["id"])  # cache giữ dict {wav_path, ref_text} cũ


def _import_catalog_entry(entry: dict, lang: str) -> dict:
    """Convert audio nguồn (mp3/wav bất kỳ) → WAV mono trong _ref_dir (phẳng, giống mọi
    cloned voice khác), rồi add_cloned() + pre-encode reference embedding. Idempotent:
    nếu entry này đã import trước đó, trả lại voice đã có thay vì tạo trùng.

    Chạy CPU-bound (đọc/ghi audio, encode_reference) — gọi qua asyncio.to_thread ở nơi
    dùng để không block event loop, giống _run_synthesis.
    """
    assert _registry is not None and _engine is not None and _ref_dir is not None

    existing = _registry.find_by_source_catalog_id(entry["id"])
    if existing is not None:
        _backfill_ref_text_from_catalog(existing)
        return _registry.get_voice(existing["id"]) or existing

    from voice_catalog import get_catalog_ref_path
    src_path = get_catalog_ref_path(_catalog_dir, lang, entry)
    if not src_path.exists():
        raise HTTPException(404, f"Audio file not found: {src_path.name}")

    import soundfile as sf
    data, sr = sf.read(str(src_path), dtype="float32", always_2d=True)
    mono = data.mean(axis=1)

    ref_filename = f"catalog-{entry['id']}.wav"
    ref_path = _ref_dir / ref_filename
    sf.write(str(ref_path), mono, sr, subtype="PCM_16")

    try:
        _validate_ref_audio(ref_path)
    except HTTPException:
        ref_path.unlink(missing_ok=True)
        raise

    cat_ref_text = (entry.get("ref_text") or "").strip()
    try:
        emb = _encode_reference(_engine, str(ref_path), cat_ref_text or None)
    except Exception as e:
        ref_path.unlink(missing_ok=True)
        raise HTTPException(500, f"Không thể encode voice: {e}")

    # region_map chỉ áp dụng cho 3 giọng miền tiếng Việt — entry không có accent (vd mọi
    # voice en-US hiện tại, hoặc 1 ngôn ngữ mới thêm sau này) để region rỗng thay vì mặc
    # định "Bắc" như trước (bug thật đã sửa 2026-08-04: khiến voice en-US bị gắn nhãn vùng
    # miền tiếng Việt vô nghĩa). `region` giờ chỉ còn ý nghĩa hiển thị phụ/legacy — ngôn ngữ
    # thật lấy từ `source_lang` (xem languageFromSourceLang phía service-contracts).
    region_map = {"northern": "Bắc", "central": "Trung", "southern": "Nam"}
    voice = _registry.add_cloned(
        label=entry.get("name", entry["id"]),
        gender=entry.get("gender", "female"),
        region=region_map.get(entry.get("accent", ""), ""),
        ref_file=ref_filename,
        extra={
            "accent": entry.get("accent"),
            "category": entry.get("category", []),
            "tags": entry.get("tags", []),
            "tagline": entry.get("tagline"),
            "description": entry.get("description"),
            "source_catalog_id": entry["id"],
            "source_lang": lang,
            # Bản chép lời do vendor cung cấp trong catalog.json — bắt buộc với Qwen,
            # cải thiện chất lượng với VoxCPM. Chỉ ghi khi có, tránh tạo key rỗng.
            **({"ref_text": cat_ref_text} if cat_ref_text else {}),
        },
    )
    _ref_cache()[voice["id"]] = emb
    return voice


def _ensure_voice_ready(speaker_id: str) -> dict:
    """Trả về voice registry entry cho speaker_id — nếu chưa có trong registry nhưng
    khớp 1 catalog entry (theo id), tự động import ngầm (convert+encode+persist) rồi
    trả voice mới. Đây là nơi hiện thực hoá 'chọn giọng catalog = tự sẵn sàng dùng
    ngay, không cần bước Clone riêng' (UI không còn nút Clone cho catalog voice)."""
    assert _registry is not None
    voice = _registry.get_voice(speaker_id)
    if voice is not None:
        _backfill_ref_text_from_catalog(voice)
        return _registry.get_voice(speaker_id) or voice

    found = _find_catalog_entry_any_lang(speaker_id)
    if found is None:
        raise HTTPException(
            400,
            f"Unknown speaker_id: '{speaker_id}'. Xem GET /voices và GET /voices/catalog để biết danh sách hợp lệ.",
        )
    entry, lang = found
    return _import_catalog_entry(entry, lang)


# Giới hạn ref clone — tránh file quá lớn/dài làm mọi request về sau chậm vĩnh viễn
# (clone in-context: ref codes nhét vào prompt, prefill tỉ lệ độ dài ref).
# Ngưỡng thời lượng lấy từ check_ref_audio.py (nguồn chuẩn duy nhất — CLI chấm điểm và
# server PHẢI cùng ngưỡng, xem comment ở đó).
_CLONE_MAX_BYTES = 15 * 1024 * 1024   # 15MB
_CLONE_MIN_RMS = 0.01                 # khớp voicebox's validate_and_load_reference_audio


def _validate_ref_audio(path: Path) -> list[str]:
    """
    LÀM SẠCH rồi kiểm tra file ref, GHI ĐÈ bản đã xử lý xuống `path`.

    Raise HTTPException nếu không dùng được; trả list cảnh báo (không chặn) cho vấn đề nhẹ.

    Trước đây hàm này chỉ ĐỌC metadata rồi cảnh báo bằng chữ — file upload đi thẳng vào
    engine y nguyên, kèm cả DC offset, im lặng thừa hai đầu và đỉnh quá nóng. Với engine
    clone in-context (Qwen/VoxCPM) những thứ đó đi thẳng vào speech tokenizer thành ref
    codes bẩn. voicebox làm sạch TRƯỚC KHI LƯU (`add_profile_sample` →
    `validate_and_load_reference_audio` → `preprocess_reference_audio`); đây là bản port.
    """
    import soundfile as sf
    from audio_dsp import preprocess_reference_audio
    from check_ref_audio import MAX_SECONDS, MIN_SECONDS

    try:
        data, sr = sf.read(str(path), dtype="float32", always_2d=True)
    except Exception as e:
        raise HTTPException(400, f"Không đọc được file audio: {e}")

    # Chấm điểm trên bản GỐC, trước khi làm sạch: mọi gợi ý của check_ref_audio đều nói
    # về cách THU LẠI (đứng gần mic hơn, phòng bớt vang...), nên phải mô tả đúng bản ghi
    # người dùng đưa vào. Chấm sau khi trim sẽ làm tụt `silence_pct` và sinh cảnh báo
    # "không có khoảng lặng sạch" hoàn toàn do bước xử lý của ta gây ra.
    warnings: list[str] = []
    try:
        from check_ref_audio import analyze, grade
        for check in grade(analyze(path)):
            if check["level"] in ("FAIL", "WARN"):
                detail = f"{check['label']}: {check['detail']}"
                warnings.append(f"{detail} — {check['hint']}" if check.get("hint") else detail)
    except Exception:
        pass  # chấm điểm hỏng không được chặn clone — nó chỉ là cảnh báo

    mono = data.mean(axis=1)
    cleaned = preprocess_reference_audio(mono, sr)

    dur = cleaned.size / sr if sr else 0.0
    if dur < MIN_SECONDS:
        raise HTTPException(400, f"Audio quá ngắn ({dur:.1f}s) — cần ít nhất {MIN_SECONDS:g}s.")
    if dur > MAX_SECONDS:
        raise HTTPException(400, f"Audio quá dài ({dur:.1f}s) — tối đa {MAX_SECONDS:.0f}s. Hãy cắt ngắn.")

    rms = float(np.sqrt(np.mean(cleaned ** 2))) if cleaned.size else 0.0
    if rms < _CLONE_MIN_RMS:
        raise HTTPException(400, "Audio gần như im lặng — hãy thu lại to rõ hơn.")

    # Ghi đè bằng bản đã làm sạch (mono, giữ nguyên sample rate). Ghi ra file tạm rồi
    # replace: nếu process chết giữa chừng, file ref cũ vẫn còn nguyên thay vì thành WAV
    # cụt không đọc được (cùng cách voicebox's save_audio làm).
    try:
        tmp = path.with_suffix(path.suffix + ".tmp")
        sf.write(str(tmp), cleaned, sr, subtype="PCM_16", format="WAV")
        os.replace(tmp, path)
    except Exception as e:
        raise HTTPException(500, f"Không ghi được audio đã xử lý: {e}")

    return warnings


def _looks_like_audio(content: bytes) -> bool:
    """Nhận diện WAV/MP3 qua magic byte — không tin đuôi file (người dùng đổi tên tuỳ ý).
    WAV: header RIFF. MP3: tag ID3v2 ở đầu, hoặc frame sync MPEG thô (11 bit 1 liên tiếp:
    byte đầu 0xFF, 3 bit cao byte sau cũng 1) khi file không có tag ID3.
    """
    if len(content) >= 44 and content[:4] == b"RIFF":
        return True
    if len(content) >= 4 and content[:3] == b"ID3":
        return True
    if len(content) >= 2 and content[0] == 0xFF and (content[1] & 0xE0) == 0xE0:
        return True
    return False


async def _save_and_validate_ref_upload(file: UploadFile, prefix: str = "clone") -> tuple[str, list[str]]:
    """Đọc 1 file upload, kiểm định dạng/kích thước, lưu + làm sạch qua
    `_validate_ref_audio`. Dùng chung cho tạo voice mới (nhiều file) và thêm sample cho
    voice đã có — cả hai đường đều là "1 file WAV/MP3 → 1 sample WAV trên đĩa" (mp3 được
    `soundfile` giải mã rồi `_validate_ref_audio` ghi đè lại thành WAV chuẩn, xem đó), khác
    nhau ở chỗ gắn vào voice nào sau đó.

    Trả (tên file đã lưu trong `_ref_dir`, cảnh báo chất lượng). Raise HTTPException và tự
    dọn file nếu validate thất bại — caller không cần try/except riêng cho phần này.
    """
    content = await file.read()
    if not _looks_like_audio(content):
        raise HTTPException(400, f"File '{file.filename}' phải là WAV hoặc MP3 hợp lệ")
    if len(content) > _CLONE_MAX_BYTES:
        raise HTTPException(
            400, f"File '{file.filename}' quá lớn ({len(content) // (1024*1024)}MB) — tối đa 15MB.",
        )

    ref_filename = f"{prefix}-{uuid.uuid4().hex[:8]}.wav"
    ref_path = _ref_dir / ref_filename
    ref_path.write_bytes(content)

    try:
        warnings = _validate_ref_audio(ref_path)
    except HTTPException:
        ref_path.unlink(missing_ok=True)
        raise

    return ref_filename, warnings


@app.post("/voices/clone")
async def clone_voice(
    files: list[UploadFile] = File(...),
    label: str = Form(...),
    gender: str = Form("female"),
    region: str = Form("Bắc"),
    # Cùng SỐ LƯỢNG và THỨ TỰ với `files` — client gửi field `ref_texts` lặp lại nhiều lần
    # (multipart cho phép), FastAPI tự gom thành list theo đúng thứ tự gửi lên. Phần tử
    # rỗng hợp lệ (mẫu không có transcript, chỉ chặn ở engine BẮT BUỘC — xem bên dưới).
    ref_texts: list[str] = Form(...),
):
    """Upload MỘT HOẶC NHIỀU file WAV mẫu → validate từng file → tạo 1 voice clone, mỗi
    file thành 1 sample của nó (nhiều mẫu ghép lại lúc synthesize cho model nhiều ngữ cảnh
    hơn — xem audio_dsp.py's combine_voice_samples, port từ voicebox's
    combine_voice_prompts). Encode xảy ra LƯỜI ở lần synthesize đầu tiên
    (main.py's _run_synthesis), không encode ngay ở đây — khác hẳn bản 1-file cũ vốn encode
    ngay lúc clone, vì giờ với >1 file phải ghép trước mới encode được (tốn hơn hẳn, không
    đáng chặn HTTP request chờ).

    `ref_texts[i]` — bản chép lời của `files[i]`. Optional ở tầng HTTP (engine như
    VieNeu/MOSS không dùng tới), nhưng SAMPLE ĐẦU TIÊN bắt buộc có khi engine đang chạy
    khai `requires_ref_text` — chặn ngay tại đây thay vì để người dùng clone xong mới phát
    hiện giọng không đọc được.
    """
    if _registry is None or _engine is None:
        raise HTTPException(503, "Service not ready")
    if not files:
        raise HTTPException(400, "Cần ít nhất 1 file audio mẫu.")
    if len(ref_texts) != len(files):
        raise HTTPException(400, "Số lượng ref_texts phải khớp số lượng files.")
    if not (label or "").strip():
        raise HTTPException(400, "Cần nhập tên giọng (label).")

    ref_texts = [(t or "").strip() for t in ref_texts]
    if not ref_texts[0] and _engine.capabilities().get("requires_ref_text"):
        raise HTTPException(
            400,
            f"{_engine.capabilities().get('label', 'Engine hiện tại')} cần bản chép lời "
            f"của audio mẫu — hãy nhập nội dung mẫu đầu tiên đang nói.",
        )

    saved: list[tuple[str, str]] = []  # [(ref_filename, ref_text), ...] — dọn nếu lỗi giữa chừng
    all_warnings: list[str] = []
    try:
        for f, text in zip(files, ref_texts):
            ref_filename, warnings = await _save_and_validate_ref_upload(f)
            saved.append((ref_filename, text))
            all_warnings.extend(warnings)
    except HTTPException:
        for ref_filename, _ in saved:
            (_ref_dir / ref_filename).unlink(missing_ok=True)
        raise

    first_file, first_text = saved[0]
    voice = _registry.add_cloned(
        label=label.strip(), gender=gender, region=region, ref_file=first_file,
        extra={"ref_text": first_text} if first_text else None,
    )
    for ref_filename, text in saved[1:]:
        _registry.add_sample(voice["id"], ref_filename, text or None)

    return {**voice, "warnings": all_warnings}


@app.get("/voices/{voice_id}/samples")
def list_voice_samples(voice_id: str):
    """Danh sách mẫu audio của 1 voice clone — UI dùng khi mở lại giọng để sửa (thêm/xoá
    mẫu, sửa transcript từng mẫu)."""
    if _registry is None:
        raise HTTPException(503, "Registry not ready")
    return _registry.list_samples(voice_id)


@app.post("/voices/{voice_id}/samples")
async def add_voice_sample(voice_id: str, file: UploadFile = File(...), ref_text: str = Form("")):
    """Thêm 1 mẫu audio cho voice clone ĐÃ CÓ. Xoá ref-codes cache của voice này — thêm
    sample làm thay đổi bản ghép dùng để clone (xem main.py's _resolve_voice_ref), cache cũ
    (nếu voice đã từng synthesize) sẽ dùng nhầm bản ghép THIẾU mẫu vừa thêm nếu không xoá."""
    if _registry is None:
        raise HTTPException(503, "Registry not ready")
    voice = _registry.get_voice(voice_id)
    if voice is None or voice.get("type") != "cloned":
        raise HTTPException(404, f"Voice không tồn tại hoặc không phải giọng clone: {voice_id}")

    ref_filename, warnings = await _save_and_validate_ref_upload(file, prefix="sample")
    try:
        sample = _registry.add_sample(voice_id, ref_filename, (ref_text or "").strip() or None)
    except ValueError as e:
        (_ref_dir / ref_filename).unlink(missing_ok=True)
        raise HTTPException(400, str(e))

    _ref_cache_forget_voice(voice_id)
    return {**sample, "warnings": warnings}


@app.delete("/voices/{voice_id}/samples/{sample_id}")
def delete_voice_sample(voice_id: str, sample_id: str):
    """Xoá 1 mẫu audio. Từ chối nếu đó là mẫu CUỐI CÙNG của voice (voice phải có ít nhất 1
    mẫu để còn dùng được — xoá hẳn voice thì dùng DELETE /voices/{voice_id})."""
    if _registry is None:
        raise HTTPException(503, "Registry not ready")
    ok, reason = _registry.delete_sample(sample_id)
    if not ok:
        if reason == "not_found":
            raise HTTPException(404, f"Sample not found: {sample_id}")
        if reason == "last_sample":
            raise HTTPException(
                400, "Không thể xoá mẫu cuối cùng — giọng phải có ít nhất 1 mẫu audio.",
            )
        raise HTTPException(500, "Xoá thất bại")
    _ref_cache_forget_voice(voice_id)
    return {"ok": True}


@app.put("/voices/{voice_id}")
def update_voice(voice_id: str, body: dict):
    """Sửa voice. Nhận `hidden` (bool) và/hoặc `ref_text` (str) — ít nhất một trong hai."""
    if _registry is None:
        raise HTTPException(503, "Registry not ready")

    hidden = body.get("hidden")
    ref_text = body.get("ref_text")
    if hidden is None and ref_text is None:
        raise HTTPException(400, "Cần trường 'hidden' (true/false) hoặc 'ref_text' (chuỗi)")

    if hidden is not None:
        if not _registry.set_hidden(voice_id, bool(hidden)):
            raise HTTPException(404, f"Voice not found: {voice_id}")

    if ref_text is not None:
        if not isinstance(ref_text, str):
            raise HTTPException(400, "'ref_text' phải là chuỗi")
        if not _registry.set_ref_text(voice_id, ref_text):
            raise HTTPException(404, f"Voice not found: {voice_id}")
        # Embedding đã cache giữ nguyên dict {wav_path, ref_text} cũ suốt vòng đời
        # process — không xoá thì transcript vừa sửa không có tác dụng gì cho tới lần
        # restart, và người dùng sẽ nghĩ việc sửa không ăn thua.
        _ref_cache_forget_voice(voice_id)

    return _registry.get_voice(voice_id)


@app.delete("/voices/{voice_id}")
def delete_voice(voice_id: str):
    if _registry is None:
        raise HTTPException(503, "Registry not ready")
    ok, reason = _registry.delete_cloned(voice_id)
    if not ok:
        if reason == "not_found":
            raise HTTPException(404, f"Voice not found: {voice_id}")
        if reason == "is_preset":
            raise HTTPException(403, "Không thể xóa preset voice. Dùng PUT /voices/{id} để ẩn.")
        raise HTTPException(500, "Xóa thất bại")
    # Xoá khỏi MỌI engine — voice đã biến mất khỏi registry, ref codes của bất kỳ engine
    # nào cũng thành rác (trước đây cache phẳng nên 1 lệnh pop là đủ).
    _ref_cache_forget_voice(voice_id)
    return {"deleted": voice_id}


# ── Preview ───────────────────────────────────────────────────────────────────

@app.get("/preview/{voice_id}")
def get_preview(voice_id: str):
    """Trả về WAV preview. Nếu không có file preview tĩnh trong _preview_dir, kiểm tra
    xem voice có source_catalog_id hoặc thuộc catalog vendor không để phát audio gốc."""
    if _registry is None:
        raise HTTPException(503, "Registry not ready")
    
    # 1. Thử lấy file preview tĩnh (NF.wav, SF.wav, v.v.)
    if _preview_dir is not None:
        wav_path = _preview_dir / f"{voice_id}.wav"
        if wav_path.exists():
            return FileResponse(str(wav_path), media_type="audio/wav")

    # 2. Nếu là voice từ catalog (hoặc direct catalog_id như 'cam_hong', 'bao_ngoc_gentle')
    voice = _registry.get_voice(voice_id)
    catalog_id = voice.get("source_catalog_id") if voice else voice_id

    if _catalog_dir is not None and catalog_id:
        found = _find_catalog_entry_any_lang(catalog_id)
        if found is not None:
            entry, lang = found
            from voice_catalog import get_catalog_ref_path
            audio_path = get_catalog_ref_path(_catalog_dir, lang, entry)
            if audio_path.exists():
                media_type = "audio/mpeg" if audio_path.suffix.lower() == ".mp3" else "audio/wav"
                return FileResponse(str(audio_path), media_type=media_type)

    raise HTTPException(404, f"Preview not found for voice: {voice_id}")


# ── Synthesize ────────────────────────────────────────────────────────────────

class TtsRequest(BaseModel):
    text: str
    speaker_id: str        # backward compat: giữ tên field speaker_id
    speed: float = 1.0
    word_gap: float = 1.0  # nhận nhưng bỏ qua
    model_dir: str = ""    # nhận nhưng bỏ qua
    # Advanced infer params (Phase 2) — None = dùng config global / mặc định engine.
    temperature: float | None = None
    top_k: int | None = None
    top_p: float | None = None
    repetition_penalty: float | None = None
    max_new_frames: int | None = None
    # Engine-specific overrides — dict theo engine id (vd {"vieneu": {"emotion": "happy"}, "moss": {"max_new_frames": 500}})
    engine_overrides: dict | None = None
    # Chuỗi hiệu ứng hậu kỳ ĐÃ RESOLVE (vd [{"type":"reverb","enabled":true,"params":{...}}]).
    # Client tự tra preset rồi gửi chuỗi cuối cùng xuống — server không biết khái niệm
    # "preset" vì preset nằm trong ceremony-db, mà tiến trình Python này cách ly với DB
    # đó (xem docstring effects.py).
    effects_chain: list | None = None


def _encode_reference(engine: object, ref_path: str, ref_text: str | None) -> object:
    """Gọi `engine.encode_reference()` đúng SIGNATURE THẬT của engine đang chạy.

    Không phải engine nào cũng nhận `ref_text`: engine kiểu in-context (Qwen, VoxCPM) cần
    nó để căn text↔codec, còn engine kiểu preset/embedding thuần (VieneuEngine,
    MossNanoEngine) không khai tham số này — `TTSEngine` Protocol khai `ref_text` optional
    với default `None` để MỌI concrete class đều thoả Protocol, nhưng Python không tự bỏ
    bớt đối số thừa khi gọi: truyền `ref_text` cho engine không khai nó ra
    `TypeError: encode_reference() takes 2 positional arguments but 3 were given` (bug thật
    gặp khi bật MossNanoEngine, xem history/2026-08-12-fix-encode-reference-2-doi-so.md).
    Kiểm signature TRƯỚC khi gọi thay vì hard-code danh sách engine nào nhận/không nhận —
    engine mới thêm sau tự đúng, không cần sửa thêm ở đây.
    """
    if len(inspect.signature(engine.encode_reference).parameters) >= 2:
        return engine.encode_reference(ref_path, ref_text)
    return engine.encode_reference(ref_path)


def _resolve_voice_ref(voice_id: str) -> tuple[Path, str | None]:
    """Trả (đường dẫn audio, transcript) dùng để `encode_reference()` cho 1 voice clone.

    1 sample → dùng thẳng, không tốn gì. NHIỀU sample (Phase 2 — một giọng nhiều file mẫu,
    port từ voicebox's `combine_voice_prompts`) → ghép bằng `combine_voice_samples`, CACHE
    kết quả ra file thay vì ghép lại mỗi lần synthesize.

    Cache khoá theo (voice_id, hash danh sách sample id, tần số của engine hiện tại) — hash
    thay đổi khi thêm/xoá sample nên tự động vô hiệu bản cache cũ; tần số engine nằm trong
    tên file vì `combine_voice_samples` resample theo engine đang chạy — đổi từ Qwen
    (24kHz) sang VieNeu (48kHz) mà dùng nhầm cache của engine kia sẽ cho ra audio sai tốc độ.
    """
    assert _registry is not None and _ref_dir is not None and _engine is not None

    samples = _registry.list_samples(voice_id)
    if not samples:
        raise HTTPException(500, f"Voice không có mẫu audio nào: {voice_id}")

    if len(samples) == 1:
        s = samples[0]
        return _ref_dir / s["ref_file"], s.get("ref_text")

    import hashlib
    from audio_dsp import combine_voice_samples

    sample_rate = int(_engine.capabilities().get("sample_rate") or 24000)
    key = hashlib.md5("-".join(sorted(s["id"] for s in samples)).encode()).hexdigest()[:12]
    cache_dir = _ref_dir / "_combined"
    cache_dir.mkdir(parents=True, exist_ok=True)
    combined_path = cache_dir / f"{voice_id}-{key}-{sample_rate}hz.wav"
    combined_text = " ".join(s.get("ref_text") or "" for s in samples).strip()

    if not combined_path.exists():
        import soundfile as sf
        mixed = combine_voice_samples([_ref_dir / s["ref_file"] for s in samples], sample_rate)
        sf.write(str(combined_path), mixed, sample_rate, subtype="PCM_16")

    return combined_path, (combined_text or None)


def _run_synthesis(req: TtsRequest, voice: dict) -> np.ndarray:
    """
    Phần CPU-bound thuần — chạy trong thread (asyncio.to_thread) để KHÔNG block
    event loop, nhờ đó /health vẫn trả lời được trong lúc đang generate.
    """
    # Advanced params: ưu tiên override per-request; nếu None → lấy config global.
    cfg_infer = _config.get_infer() if _config is not None else {}

    def _pick(field: str):
        v = getattr(req, field, None)
        return v if v is not None else cfg_infer.get(field)

    engine_caps = _engine.capabilities() if _engine is not None else {}

    # Khối `infer` GLOBAL (config.json) là namespace DÙNG CHUNG nhưng giá trị mặc định
    # trong đó là tuning riêng của VieNeu (temperature=0.1/top_k=5/rep=1.3 — xem
    # config_store.py's DEFAULTS và engine.py's VieneuEngine._INFER_KWARGS: "đủ thấp
    # tránh random bad sample" cho ĐỌC TÊN NGHI LỄ). Chỉ rót các key mà engine hiện tại
    # TỰ KHAI trong `sampling_params` — engine không khai thì không nhận gì.
    #
    # Bug thật: trước đây rót nguyên 5 key cho MỌI engine. VoxCPM phải tự bỏ qua bằng
    # tay (xem comment dài ở engine_voxcpm.py's _run), còn Qwen thì nguy hiểm hơn hẳn —
    # `top_k=5` của VieNeu ép Qwen chỉ xét 5 token mỗi bước, mà token EOS của Qwen
    # thường KHÔNG nằm trong top-5, nên model gần như không bao giờ dừng được đúng lúc
    # (chính mlx-audio 0.4.1 ghi lý do cap max_tokens là "EOS logit is suppressed by
    # top-k"). Tức là cấu hình tuned cho engine này lại là nguyên nhân runaway ở engine
    # kia — đúng loại lỗi mà việc lọc theo khai báo ngăn được tận gốc.
    declared = (engine_caps.get("sampling_params") or {}).keys()
    overrides = {k: _pick(k) for k in ("temperature", "top_k", "top_p",
                                       "repetition_penalty", "max_new_frames")
                 if k in declared}

    # Merge engine-specific overrides — ưu tiên cao nhất, KHÔNG lọc: người gọi chỉ đích
    # danh engine này thì họ biết mình đang chỉnh gì (đây là đường DUY NHẤT để chỉnh
    # sampling của engine không khai `sampling_params`, vd Qwen).
    if _engine is not None and req.engine_overrides:
        engine_id = engine_caps.get("id")
        if engine_id and engine_id in req.engine_overrides:
            engine_specific = req.engine_overrides[engine_id]
            if isinstance(engine_specific, dict):
                overrides.update(engine_specific)
    # LƯU Ý: dùng voice["id"] (id THẬT trong registry), KHÔNG dùng req.speaker_id —
    # khi speaker_id gốc là 1 catalog id vừa được _ensure_voice_ready() auto-import,
    # registry sinh id mới (vd "clone-xxxxx"), khác hẳn catalog id gốc client gửi lên.
    voice_id = voice["id"]
    if voice.get("type") == "cloned":
        # Ngăn cache theo ĐÚNG engine đang chạy — embedding của engine khác không dùng được.
        per_engine = _ref_cache()
        ref_codes = per_engine.get(voice_id)
        if ref_codes is None:
            ref_path, ref_text = _resolve_voice_ref(voice_id)
            ref_codes = _encode_reference(_engine, str(ref_path), ref_text)
            per_engine[voice_id] = ref_codes
        return _engine.synthesize(req.text, ref_codes, req.speed, overrides=overrides)

    preset_id = _registry.get_preset_id(voice_id)
    if preset_id is None:
        raise HTTPException(500, f"preset_id missing for: {voice_id}")
    return _engine.synthesize_preset(req.text, preset_id, req.speed, overrides=overrides)


@app.post("/synthesize")
async def synthesize(req: TtsRequest):
    # Lock = single-flight (engine không thread-safe cho infer song song). Nhưng phần
    # nặng chạy trong to_thread nên event loop vẫn phục vụ /health khi đang gen.
    async with _synth_lock:
        if _engine is None or _registry is None:
            raise HTTPException(503, "TTS engine not ready")

        # speaker_id có thể là catalog voice chưa từng dùng — import ngầm (encode+persist)
        # ngay trong request này, trong suốt với client (không có bước "Clone" riêng ở UI).
        try:
            voice = await asyncio.to_thread(_ensure_voice_ready, req.speaker_id)
        except HTTPException:
            raise

        _write_log(f"[TTS] synthesize voice={req.speaker_id} len={len(req.text)} speed={req.speed}")
        _safe_console(
            f"[TTS] synthesize voice={req.speaker_id} text_len={len(req.text)} "
            f"speed={req.speed} text={req.text!r}"
        )

        try:
            audio = await asyncio.to_thread(_run_synthesis, req, voice)

            # Validate output — tránh trả về audio rỗng/NaN/Inf gây lỗi phát ở client
            if hasattr(audio, "__len__") and len(audio) == 0:
                raise RuntimeError("Engine trả về audio rỗng")
            audio_np = np.asarray(audio)
            if np.isnan(audio_np).any() or np.isinf(audio_np).any():
                raise RuntimeError("Engine trả về audio chứa NaN/Inf")

        except HTTPException:
            raise
        except Exception as e:
            traceback.print_exc()
            _write_log(f"[TTS] infer error: {type(e).__name__}: {e}\n{traceback.format_exc()}")
            raise HTTPException(500, str(e))

        from engine import SAMPLE_RATE, analyze_quality

        # Tần số THẬT của engine đang phục vụ, không phải hằng 48kHz của VieNeu: Qwen
        # xuất 24kHz và giờ giữ nguyên tần số gốc (xem engine_qwen_mlx.py). Báo sai con
        # số này thì client phát audio nhanh/chậm gấp đôi. `SAMPLE_RATE` chỉ còn là
        # fallback cho engine chưa khai (mọi engine hiện có đều khai).
        sample_rate = int(_engine.capabilities().get("sample_rate") or SAMPLE_RATE)

        # Chấm chất lượng để cảnh báo file khả nghi (không chặn — vẫn trả audio).
        headers = {"X-Sample-Rate": str(sample_rate)}
        try:
            q = analyze_quality(audio_np, req.text, sample_rate, speed=req.speed)
            headers["X-Quality-Score"] = str(q["score"])
            headers["X-Quality-Flags"] = ",".join(q["flags"])  # ASCII slugs — an toàn cho HTTP header
            if q["flags"]:
                _write_log(f"[TTS] quality voice={req.speaker_id} score={q['score']} flags={q['flags']} metrics={q['metrics']}")
        except Exception as e:  # phân tích lỗi không được làm hỏng response
            _write_log(f"[TTS] quality analysis failed: {type(e).__name__}: {e}")

        # Hiệu ứng hậu kỳ — bước CUỐI, sau cả chấm chất lượng.
        #
        # Vị trí này quan trọng theo cả hai phía:
        #   - SAU `_post_process` của engine: reverb/delay cố ý thay đổi mức tín hiệu, cân
        #     loudness lại sau đó sẽ triệt tiêu đúng cái người dùng vừa chỉnh.
        #   - SAU `analyze_quality`: điểm chất lượng nói về việc MODEL đọc có tốt không.
        #     Chấm sau khi áp hiệu ứng thì preset "Radio" (lọc băng hẹp) hay "Echo Chamber"
        #     (vang dày) sẽ dính cờ noisy/clipping — báo động giả về đúng thứ người dùng
        #     chủ động chọn.
        if req.effects_chain:
            try:
                from effects import apply_effects, validate_effects_chain
                err = validate_effects_chain(req.effects_chain)
                if err:
                    raise HTTPException(400, f"Chuỗi hiệu ứng không hợp lệ: {err}")
                audio_np = apply_effects(audio_np, sample_rate, req.effects_chain)
            except HTTPException:
                raise
            except ImportError:
                # pedalboard không có (vd bản đóng gói chưa gom được binary native) —
                # trả audio KHÔNG hiệu ứng thay vì hỏng cả request. Ghi log để phân biệt
                # "hiệu ứng không ăn thua" với "hiệu ứng chỉnh sai".
                _write_log("[TTS] effects bị bỏ qua: pedalboard chưa cài")
            except Exception as e:
                raise HTTPException(500, f"Lỗi khi áp hiệu ứng: {type(e).__name__}: {e}")

        int16_audio = np.clip(audio_np * 32767, -32768, 32767).astype(np.int16)
        return Response(
            content=int16_audio.tobytes(),
            media_type="application/octet-stream",
            headers=headers,
        )


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import socket as _socket
    import uvicorn

    def _find_free_port(preferred: int) -> int:
        for port in range(preferred, preferred + 20):
            try:
                with _socket.socket(_socket.AF_INET, _socket.SOCK_STREAM) as s:
                    s.bind(("127.0.0.1", port))
                    return port
            except OSError:
                continue
        raise RuntimeError(f"No free port in range {preferred}–{preferred + 20}")

    preferred = int(os.environ.get("VIENEU_PORT", "8089"))
    actual = _find_free_port(preferred)
    _safe_console(f"VIENEU_PORT={actual}")
    uvicorn.run(app, host="127.0.0.1", port=actual, log_level="warning", access_log=False)
