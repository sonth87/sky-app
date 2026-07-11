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
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

# ── Globals — được init trong lifespan(), KHÔNG set tại module level ─────────
_engine = None            # VieneuEngine instance
_registry = None          # VoiceRegistry instance
_config = None            # ConfigStore instance (advanced infer params + device + engine)
_preview_dir: Path | None = None  # FIX: không đọc env tại module level
_ref_dir: Path | None = None
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


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _engine, _registry, _config, _preview_dir, _ref_dir, _LOG_FILE

    # FIX: đọc tất cả env vars tại đây — KHÔNG tại module level
    log_path = os.environ.get("LOG_FILE_PATH", "")
    _LOG_FILE = Path(log_path) if log_path else None

    _ref_dir = _pick_ref_dir()

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
    if voice.get("type") == "cloned":
        ref_codes = _ref_codes_cache.get(req.speaker_id)
        if ref_codes is None:
            ref_path = _registry.get_ref_path(req.speaker_id)
            if not ref_path or not ref_path.exists():
                raise HTTPException(500, f"Ref audio not found: {req.speaker_id}")
            ref_codes = _engine.encode_reference(str(ref_path))
            _ref_codes_cache[req.speaker_id] = ref_codes
        return _engine.synthesize(req.text, ref_codes, req.speed, overrides=overrides)

    preset_id = _registry.get_preset_id(req.speaker_id)
    if preset_id is None:
        raise HTTPException(500, f"preset_id missing for: {req.speaker_id}")
    return _engine.synthesize_preset(req.text, preset_id, req.speed, overrides=overrides)


@app.post("/synthesize")
async def synthesize(req: TtsRequest):
    # Lock = single-flight (engine không thread-safe cho infer song song). Nhưng phần
    # nặng chạy trong to_thread nên event loop vẫn phục vụ /health khi đang gen.
    async with _synth_lock:
        if _engine is None or _registry is None:
            raise HTTPException(503, "TTS engine not ready")

        voice = _registry.get_voice(req.speaker_id)
        if voice is None:
            raise HTTPException(
                400,
                f"Unknown speaker_id: '{req.speaker_id}'. "
                f"Xem GET /voices để biết danh sách hợp lệ."
            )

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
