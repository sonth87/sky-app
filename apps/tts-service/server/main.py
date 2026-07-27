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
  VIENEU_REF_DIR       — thư mục chứa ref WAV files
  VIENEU_PREVIEW_DIR   — thư mục chứa preview WAV files
  LOG_FILE_PATH        — path ghi debug log
  VIENEU_REGISTRY_PATH — (optional) path tới voice-registry.json
"""
from __future__ import annotations

import asyncio
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
_engine = None            # VieneuEngine instance
_registry = None          # VoiceRegistry instance
_config = None            # ConfigStore instance (advanced infer params + device + engine)
_preview_dir: Path | None = None  # FIX: không đọc env tại module level
_ref_dir: Path | None = None
_catalog_dir: Path | None = None
_synth_lock = asyncio.Lock()
_ref_codes_cache: dict[str, object] = {}
_LOG_FILE: Path | None = None


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
    """Resolve catalog dir (read-only system voice library) with fallback to ref_dir."""
    resources_env = os.environ.get("RESOURCES_PATH", "")
    if resources_env:
        rp = Path(resources_env)
        cand = rp / "voice-ref"
        if cand.exists():
            return cand
        cand_voices = rp / "voices"
        if cand_voices.exists():
            return cand_voices

    # Kiểm tra xem ref_dir có chứa catalog.json không
    if (ref_dir / "vi-VN" / "catalog.json").exists():
        return ref_dir

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


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _engine, _registry, _config, _preview_dir, _ref_dir, _catalog_dir, _LOG_FILE

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
    from engine_registry import create_engine
    engine_id = os.environ.get("VIENEU_ENGINE", "").strip() or _config.get().get("engine", "vieneu")
    _safe_console(f"[TTS] Loading engine '{engine_id}'...")
    _write_log(f"[TTS] Loading engine '{engine_id}'...")
    try:
        _engine = create_engine(engine_id)
    except Exception as e:
        _safe_console(f"[TTS] Engine '{engine_id}' lỗi ({e}) — fallback 'vieneu'.")
        _write_log(f"[TTS] Engine '{engine_id}' lỗi: {e} — fallback vieneu")
        _engine = create_engine("vieneu")
    _safe_console("[TTS] Engine loaded.")
    _write_log("[TTS] Engine loaded.")

    # Init voice registry
    registry_path_env = os.environ.get("VIENEU_REGISTRY_PATH", "")
    registry_path = Path(registry_path_env) if registry_path_env else _ref_dir.parent / "voice-registry.json"

    from voice_registry import VoiceRegistry
    _registry = VoiceRegistry(registry_path, _ref_dir)
    _safe_console(f"[TTS] Voice registry loaded from {registry_path}")

    # Pre-encode cloned voices lúc startup để giảm latency request đầu tiên
    _safe_console("[TTS] Pre-encoding voice references...")
    for voice in _registry.list_voices(include_hidden=True):
        if voice.get("type") != "cloned":
            continue
        ref_path = _registry.get_ref_path(voice["id"])
        if ref_path and ref_path.exists():
            try:
                emb = _engine.encode_reference(str(ref_path))
                _ref_codes_cache[voice["id"]] = emb
                _safe_console(f"[TTS]   {voice['id']} ({voice.get('ref_file')}) OK")
                _write_log(f"[TTS]   {voice['id']} OK")
            except Exception as e:
                _safe_console(f"[TTS]   {voice['id']} WARN: {e}")
                _write_log(f"[TTS]   {voice['id']} WARN: {e}")
        else:
            _safe_console(f"[TTS]   {voice['id']} SKIP — ref not found: {ref_path}")

    _safe_console("[TTS] Ready.")
    _write_log("[TTS] Ready.")
    yield

    _engine = None
    _registry = None
    _config = None
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
        current = (os.environ.get("VIENEU_ENGINE", "").strip()
                   or (_config.get().get("engine", "vieneu") if _config is not None else "vieneu"))
    return {"engines": list_engines(), "current": current, "current_capabilities": live_caps}


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
        return existing

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

    try:
        emb = _engine.encode_reference(str(ref_path))
    except Exception as e:
        ref_path.unlink(missing_ok=True)
        raise HTTPException(500, f"Không thể encode voice: {e}")

    region_map = {"northern": "Bắc", "central": "Trung", "southern": "Nam"}
    voice = _registry.add_cloned(
        label=entry.get("name", entry["id"]),
        gender=entry.get("gender", "female"),
        region=region_map.get(entry.get("accent", ""), "Bắc"),
        ref_file=ref_filename,
        extra={
            "accent": entry.get("accent"),
            "category": entry.get("category", []),
            "tags": entry.get("tags", []),
            "source_catalog_id": entry["id"],
            "source_lang": lang,
        },
    )
    _ref_codes_cache[voice["id"]] = emb
    return voice


def _ensure_voice_ready(speaker_id: str) -> dict:
    """Trả về voice registry entry cho speaker_id — nếu chưa có trong registry nhưng
    khớp 1 catalog entry (theo id), tự động import ngầm (convert+encode+persist) rồi
    trả voice mới. Đây là nơi hiện thực hoá 'chọn giọng catalog = tự sẵn sàng dùng
    ngay, không cần bước Clone riêng' (UI không còn nút Clone cho catalog voice)."""
    assert _registry is not None
    voice = _registry.get_voice(speaker_id)
    if voice is not None:
        return voice

    found = _find_catalog_entry_any_lang(speaker_id)
    if found is None:
        raise HTTPException(
            400,
            f"Unknown speaker_id: '{speaker_id}'. Xem GET /voices và GET /voices/catalog để biết danh sách hợp lệ.",
        )
    entry, lang = found
    return _import_catalog_entry(entry, lang)


# Giới hạn ref clone — tránh file quá lớn/dài làm mọi request về sau chậm vĩnh viễn
# (VieNeu clone in-context: ref codes nhét vào prompt, prefill tỉ lệ độ dài ref).
_CLONE_MAX_BYTES = 15 * 1024 * 1024   # 15MB
_CLONE_MAX_SECONDS = 15.0
_CLONE_MIN_SECONDS = 1.5


def _validate_ref_audio(path: Path) -> list[str]:
    """
    Kiểm tra file ref trước khi encode. Raise HTTPException nếu KHÔNG dùng được;
    trả list cảnh báo (không chặn) cho các vấn đề nhẹ.
    """
    import soundfile as sf

    warnings: list[str] = []
    try:
        info = sf.info(str(path))
    except Exception as e:
        raise HTTPException(400, f"Không đọc được file audio: {e}")

    dur = info.frames / info.samplerate if info.samplerate else 0.0
    if dur < _CLONE_MIN_SECONDS:
        raise HTTPException(400, f"Audio quá ngắn ({dur:.1f}s) — cần ít nhất {_CLONE_MIN_SECONDS:g}s.")
    if dur > _CLONE_MAX_SECONDS:
        raise HTTPException(400, f"Audio quá dài ({dur:.1f}s) — tối đa {_CLONE_MAX_SECONDS:.0f}s. Hãy cắt ngắn.")

    # Cảnh báo (không chặn): sample rate thấp, và chất lượng qua analyze_quality.
    if info.samplerate < 24000:
        warnings.append(f"Sample rate thấp ({info.samplerate}Hz) — nên dùng ≥24kHz để giọng rõ.")
    try:
        from engine import analyze_quality
        data, sr = sf.read(str(path), dtype="float32", always_2d=True)
        mono = data.mean(axis=1)
        q = analyze_quality(mono, "x" * max(1, int(dur * 15)), sr)
        if "clipping" in q["flags"]:
            warnings.append("Audio bị méo/clipping — giọng clone có thể rè.")
        if "low_energy" in q["flags"]:
            warnings.append("Audio quá nhỏ tiếng — giọng clone có thể yếu.")
    except HTTPException:
        raise
    except Exception:
        pass  # phân tích cảnh báo lỗi không được chặn clone
    return warnings


@app.post("/voices/clone")
async def clone_voice(
    file: UploadFile = File(...),
    label: str = Form(...),
    gender: str = Form("female"),
    region: str = Form("Bắc"),
):
    """Upload WAV → validate → encode embedding → persist vào registry."""
    if _registry is None or _engine is None:
        raise HTTPException(503, "Service not ready")

    content = await file.read()
    if len(content) < 44 or content[:4] != b"RIFF":
        raise HTTPException(400, "File phải là WAV format hợp lệ")
    if len(content) > _CLONE_MAX_BYTES:
        raise HTTPException(400, f"File quá lớn ({len(content) // (1024*1024)}MB) — tối đa 15MB.")
    if not (label or "").strip():
        raise HTTPException(400, "Cần nhập tên giọng (label).")

    ref_filename = f"clone-{uuid.uuid4().hex[:8]}.wav"
    ref_path = _ref_dir / ref_filename
    ref_path.write_bytes(content)

    # Validate độ dài/định dạng TRƯỚC khi encode (encode tốn thời gian).
    try:
        warnings = _validate_ref_audio(ref_path)
    except HTTPException:
        ref_path.unlink(missing_ok=True)
        raise

    try:
        emb = _engine.encode_reference(str(ref_path))
    except Exception as e:
        ref_path.unlink(missing_ok=True)
        raise HTTPException(500, f"Không thể encode voice: {e}")

    voice = _registry.add_cloned(label=label.strip(), gender=gender, region=region, ref_file=ref_filename)
    _ref_codes_cache[voice["id"]] = emb
    return {**voice, "warnings": warnings}


@app.put("/voices/{voice_id}")
def update_voice(voice_id: str, body: dict):
    if _registry is None:
        raise HTTPException(503, "Registry not ready")
    hidden = body.get("hidden")
    if hidden is None:
        raise HTTPException(400, "Cần trường 'hidden' (true/false)")
    if not _registry.set_hidden(voice_id, bool(hidden)):
        raise HTTPException(404, f"Voice not found: {voice_id}")
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
    _ref_codes_cache.pop(voice_id, None)
    return {"deleted": voice_id}


# ── Preview ───────────────────────────────────────────────────────────────────

@app.get("/preview/{voice_id}")
def get_preview(voice_id: str):
    """Trả về WAV preview. Backward compat: nhận speaker_id cũ (NF, SF, v.v.)."""
    if _registry is None:
        raise HTTPException(503, "Registry not ready")
    voice = _registry.get_voice(voice_id)
    if voice is None:
        raise HTTPException(404, f"Unknown voice_id: {voice_id}")
    if _preview_dir is None:
        raise HTTPException(503, "Preview dir not initialized")
    wav_path = _preview_dir / f"{voice_id}.wav"
    if not wav_path.exists():
        raise HTTPException(404, f"Preview not found: {voice_id}.wav")
    return FileResponse(str(wav_path), media_type="audio/wav")


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

    overrides = {
        "temperature": _pick("temperature"),
        "top_k": _pick("top_k"),
        "top_p": _pick("top_p"),
        "repetition_penalty": _pick("repetition_penalty"),
        "max_new_frames": _pick("max_new_frames"),
    }
    # LƯU Ý: dùng voice["id"] (id THẬT trong registry), KHÔNG dùng req.speaker_id —
    # khi speaker_id gốc là 1 catalog id vừa được _ensure_voice_ready() auto-import,
    # registry sinh id mới (vd "clone-xxxxx"), khác hẳn catalog id gốc client gửi lên.
    voice_id = voice["id"]
    if voice.get("type") == "cloned":
        ref_codes = _ref_codes_cache.get(voice_id)
        if ref_codes is None:
            ref_path = _registry.get_ref_path(voice_id)
            if not ref_path or not ref_path.exists():
                raise HTTPException(500, f"Ref audio not found: {voice_id}")
            ref_codes = _engine.encode_reference(str(ref_path))
            _ref_codes_cache[voice_id] = ref_codes
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

        # Chấm chất lượng để cảnh báo file khả nghi (không chặn — vẫn trả audio).
        headers = {"X-Sample-Rate": str(SAMPLE_RATE)}
        try:
            q = analyze_quality(audio_np, req.text, SAMPLE_RATE, speed=req.speed)
            headers["X-Quality-Score"] = str(q["score"])
            headers["X-Quality-Flags"] = ",".join(q["flags"])  # ASCII slugs — an toàn cho HTTP header
            if q["flags"]:
                _write_log(f"[TTS] quality voice={req.speaker_id} score={q['score']} flags={q['flags']} metrics={q['metrics']}")
        except Exception as e:  # phân tích lỗi không được làm hỏng response
            _write_log(f"[TTS] quality analysis failed: {type(e).__name__}: {e}")

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
