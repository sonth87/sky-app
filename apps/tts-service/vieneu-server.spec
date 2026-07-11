# -*- mode: python ; coding: utf-8 -*-
"""
vieneu-server.spec — PyInstaller spec cho TTS service.

File này được TRACK trong git (khác với bản cũ trong python-backend/ bị ignore).

Fixes so với spec cũ:
1. Entry point là server/main.py (không phải main.py ở root)
2. pathex=[server_dir] — để PyInstaller resolve import engine, voice_registry
3. sea_g2p.bin: tìm tự động trong site-packages, bundle vào datas
4. Thêm hiddenimports: python_multipart, engine, voice_registry
"""
from PyInstaller.utils.hooks import collect_all
from pathlib import Path
import site

spec_dir = Path(SPECPATH)
server_dir = spec_dir / "server"

datas = []
binaries = []
hiddenimports = []

for pkg in ['vieneu', 'vieneu_utils', 'onnxruntime', 'soxr']:
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

# Bundle sea_g2p.bin — tìm trong venv site-packages
sea_g2p_bin = None
for sp in site.getsitepackages():
    candidate = Path(sp) / "sea_g2p" / "sea_g2p.bin"
    if candidate.exists():
        sea_g2p_bin = candidate
        break

if sea_g2p_bin:
    datas.append((str(sea_g2p_bin), "sea_g2p"))
    print(f"[spec] Bundling sea_g2p.bin from {sea_g2p_bin}")
else:
    print("[spec] WARNING: sea_g2p.bin not found — g2p may fail at runtime")

a = Analysis(
    [str(server_dir / 'main.py')],
    pathex=[str(server_dir)],  # cho phép import engine, voice_registry
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports + [
        'fastapi', 'uvicorn', 'uvicorn.logging', 'uvicorn.loops',
        'uvicorn.loops.auto', 'uvicorn.protocols', 'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto', 'uvicorn.lifespan', 'uvicorn.lifespan.on',
        'pydantic', 'pydantic.deprecated.decorator',
        'numpy', 'anyio', 'anyio._backends._asyncio',
        'starlette', 'starlette.routing',
        'python_multipart',  # cần cho POST /voices/clone (file upload)
        'soundfile',         # cần cho validate ref audio khi clone
        'engine',            # server/engine.py
        'voice_registry',    # server/voice_registry.py
        'config_store',      # server/config_store.py (advanced config)
        'onnx_providers',    # server/onnx_providers.py (device switch)
        'audio_dsp',         # server/audio_dsp.py (time-stretch + loudness)
        'engine_registry',   # server/engine_registry.py (multi-engine)
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['torch', 'torchvision', 'torchaudio', 'transformers', 'onnx'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='vieneu-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
