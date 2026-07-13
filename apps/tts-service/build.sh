#!/bin/bash
set -e

cd "$(dirname "$0")"   # apps/tts-service/

# ─── Check Python version >= 3.10 ─────────────────────────────────────────
PYTHON_BIN="python3"
PY_VERSION=$($PYTHON_BIN -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || echo "0.0")
PY_MAJOR=$(echo "$PY_VERSION" | cut -d. -f1)
PY_MINOR=$(echo "$PY_VERSION" | cut -d. -f2)
if [ "$PY_MAJOR" -lt 3 ] || ([ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 10 ]); then
  echo "[FAIL] VieNeu yêu cầu Python 3.10+ (phát hiện: $PY_VERSION)"
  echo "[FAIL] Cài Python 3.12: brew install python@3.12"
  echo "[FAIL] Đảm bảo python3 trỏ đúng version (vd: ln -sf python3.12 /usr/local/bin/python3)"
  exit 1
fi
echo "[Build] Python $PY_VERSION OK"

# ─── Đường dẫn tới apps/shell-electron/resources/ ─────────────────────────
# apps/tts-service/ → apps/shell-electron/resources/ là ../shell-electron/resources
SHELL_RESOURCES="$(cd "$(dirname "$0")/../shell-electron/resources" 2>/dev/null && pwd || (mkdir -p "$(dirname "$0")/../shell-electron/resources" && cd "$(dirname "$0")/../shell-electron/resources" && pwd))"
VIENEU_DIR="$SHELL_RESOURCES/vieneu"
PREVIEW_DIR="$SHELL_RESOURCES/voice-previews"
REF_DIR="$SHELL_RESOURCES/voice-ref"
VIENEU_SNAPSHOT_MARKER="$VIENEU_DIR/.snapshot"
PREVIEW_SNAPSHOT_MARKER="$PREVIEW_DIR/.snapshot"
VENV_REQ_MARKER="venv/.requirements.sha256"
VENV_PY_MARKER="venv/.python-version"
FORCE_REFRESH=0

# ─── Đồng bộ voice-ref/registry tĩnh (do dev tự thêm giọng) từ resources/
# nội bộ tts-service sang đích SHELL_RESOURCES — build.sh/build-win.js chỉ
# ĐỌC REF_DIR làm input (smoke test, generate preview), không tự tạo.
TTS_SERVICE_RESOURCES="$(cd "$(dirname "$0")" && pwd)/resources"
if [ -d "$TTS_SERVICE_RESOURCES/voice-ref" ] && [ ! -d "$REF_DIR" ]; then
  echo "[Build] Copy voice-ref vào $REF_DIR ..."
  mkdir -p "$SHELL_RESOURCES"
  cp -r "$TTS_SERVICE_RESOURCES/voice-ref" "$REF_DIR"
fi
if [ -f "$TTS_SERVICE_RESOURCES/voice-registry.json" ] && [ ! -f "$SHELL_RESOURCES/voice-registry.json" ]; then
  echo "[Build] Copy voice-registry.json vào $SHELL_RESOURCES ..."
  mkdir -p "$SHELL_RESOURCES"
  cp "$TTS_SERVICE_RESOURCES/voice-registry.json" "$SHELL_RESOURCES/voice-registry.json"
fi

for arg in "$@"; do
  case "$arg" in
    --force)
      FORCE_REFRESH=1
      ;;
  esac
done

if [ "${TTS_BUILD_FORCE:-0}" = "1" ]; then
  FORCE_REFRESH=1
fi

get_current_snapshot() {
  local snapshot_root="$VIENEU_DIR/hub/models--pnnbao-ump--VieNeu-TTS-v3-Turbo/snapshots"
  local snapshot_dir

  if [ ! -d "$snapshot_root" ]; then
    return 1
  fi

  for snapshot_dir in "$snapshot_root"/*; do
    if [ -d "$snapshot_dir" ]; then
      basename "$snapshot_dir"
      return 0
    fi
  done

  return 1
}

has_required_snapshot() {
  local snapshot_name="$1"
  [ -n "$snapshot_name" ] && \
  [ -f "$VIENEU_DIR/hub/models--pnnbao-ump--VieNeu-TTS-v3-Turbo/snapshots/$snapshot_name/config.json" ] && \
  [ -f "$VIENEU_DIR/hub/models--pnnbao-ump--VieNeu-TTS-v3-Turbo/snapshots/$snapshot_name/tokenizer.json" ] && \
  [ -d "$VIENEU_DIR/hub/models--pnnbao-ump--VieNeu-TTS-v3-Turbo/snapshots/$snapshot_name/onnx" ]
}

previews_are_current() {
  [ -f "$PREVIEW_DIR/NF.wav" ] && \
  [ -f "$PREVIEW_DIR/NF2.wav" ] && \
  [ -f "$PREVIEW_DIR/SF.wav" ] && \
  [ -f "$PREVIEW_DIR/NM1.wav" ] && \
  [ -f "$PREVIEW_DIR/SM.wav" ]
}

echo "[Build] SHELL_RESOURCES = $SHELL_RESOURCES"

# ─── Rebuild venv ──────────────────────────────────────────────────────────
REQ_HASH=$(shasum -a 256 requirements.txt | awk '{print $1}')
USE_EXISTING_VENV=0

if [ "$FORCE_REFRESH" -ne 1 ] && [ -x venv/bin/python ] && [ -f "$VENV_REQ_MARKER" ] && [ -f "$VENV_PY_MARKER" ]; then
  STORED_REQ_HASH=$(cat "$VENV_REQ_MARKER" 2>/dev/null || true)
  STORED_PY_VERSION=$(cat "$VENV_PY_MARKER" 2>/dev/null || true)
  CURRENT_PY_VERSION=$(venv/bin/python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || true)
  if [ "$STORED_REQ_HASH" = "$REQ_HASH" ] && [ "$STORED_PY_VERSION" = "$CURRENT_PY_VERSION" ] && \
     venv/bin/python -c "import fastapi, uvicorn, soxr, onnxruntime, vieneu, PyInstaller" >/dev/null 2>&1; then
    USE_EXISTING_VENV=1
    echo "[Build] Reuse venv hien co (requirements + smoke test OK)."
  fi
fi

if [ "$USE_EXISTING_VENV" -ne 1 ]; then
  echo "[Build] Xóa venv cũ và tạo mới..."
  rm -rf venv
  $PYTHON_BIN -m venv venv
  source venv/bin/activate
  pip install --upgrade pip
  pip install -r requirements.txt
  pip install pyinstaller
  printf '%s\n' "$REQ_HASH" > "$VENV_REQ_MARKER"
  venv/bin/python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" > "$VENV_PY_MARKER"
else
  source venv/bin/activate
fi

# ─── Download VieNeu models vào apps/shell-electron/resources/vieneu/ ─────
CURRENT_SNAPSHOT=$(get_current_snapshot || true)
if [ "$FORCE_REFRESH" -ne 1 ] && has_required_snapshot "$CURRENT_SNAPSHOT"; then
  echo "[Build] VieNeu cache OK ($CURRENT_SNAPSHOT), skip download."
  printf '%s\n' "$CURRENT_SNAPSHOT" > "$VIENEU_SNAPSHOT_MARKER"
else
  echo "[Build] Tải VieNeu models về $VIENEU_DIR ..."
  mkdir -p "$VIENEU_DIR"

  HF_HOME="$VIENEU_DIR" python3 - <<'PYEOF'
import os
print(f"[Model] HF_HOME = {os.environ['HF_HOME']}")
from vieneu import Vieneu
print("[Model] Đang download VieNeu-TTS v3 Turbo... (có thể mất vài phút)")
tts = Vieneu()
import numpy as np
audio = tts.infer("Xin chúc mừng sinh viên", voice="Ngọc Lan", apply_watermark=False)
print(f"[Model] Test inference OK: shape={audio.shape}, dtype={audio.dtype}")
print("[Model] VieNeu models đã được download và verified.")
PYEOF

  echo "[Build] Download hoàn tất. Kích thước:"
  du -sh "$VIENEU_DIR"

  CURRENT_SNAPSHOT=$(get_current_snapshot || true)
  if [ -n "$CURRENT_SNAPSHOT" ]; then
    printf '%s\n' "$CURRENT_SNAPSHOT" > "$VIENEU_SNAPSHOT_MARKER"
  fi
fi

# ─── Generate voice preview WAVs ───────────────────────────────────────────
if [ "$FORCE_REFRESH" -ne 1 ] && [ -n "$CURRENT_SNAPSHOT" ] && [ -f "$PREVIEW_SNAPSHOT_MARKER" ] && [ "$(cat "$PREVIEW_SNAPSHOT_MARKER" 2>/dev/null || true)" = "$CURRENT_SNAPSHOT" ] && previews_are_current; then
  echo "[Build] Voice previews OK ($CURRENT_SNAPSHOT), skip generation."
else
  echo "[Build] Tạo file WAV preview cho từng giọng..."
  mkdir -p "$PREVIEW_DIR"

  HF_HOME="$VIENEU_DIR" VIENEU_PREVIEW_DIR="$PREVIEW_DIR" VIENEU_REF_DIR="$REF_DIR" \
    python3 server/generate_previews.py

  if [ -n "$CURRENT_SNAPSHOT" ]; then
    printf '%s\n' "$CURRENT_SNAPSHOT" > "$PREVIEW_SNAPSHOT_MARKER"
  fi

  echo "[Build] Voice previews hoàn tất:"
  ls -lh "$PREVIEW_DIR"
fi

# ─── Stage bundled models vào resources/vn/ ───────────────────────────────
# paths.ts (Electron) khi packaged trỏ HF_HOME = resources/vn cho cả mac + win.
# Flatten HF cache (vieneu/, có symlink) → vn/ (file thật) để runtime load ổn định.
# Logic dùng chung với build-win.js (xem stage-models.js).
echo "[Build] Staging bundled models vào resources/vn/ ..."
if [ "$FORCE_REFRESH" -eq 1 ]; then
  TTS_BUILD_FORCE=1 node stage-models.js
else
  node stage-models.js
fi

# ─── Đóng gói bằng PyInstaller (spec file) ────────────────────────────────
echo "[Build] Đóng gói vieneu-server bằng PyInstaller..."
pyinstaller --clean vieneu-server.spec

# ─── Copy binary vào apps/shell-electron/resources/ ───────────────────────
echo "[Build] Copy binary vào $SHELL_RESOURCES ..."
mkdir -p "$SHELL_RESOURCES"
cp dist/vieneu-server "$SHELL_RESOURCES/vieneu-server"

echo "[Build] Đóng gói hoàn tất!"
echo "[Build] Binary: $SHELL_RESOURCES/vieneu-server"
