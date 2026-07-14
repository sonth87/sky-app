"""
moss_runtime — Runtime ONNX/CPU của MOSS-TTS-Nano, vendored + vá TORCH-FREE.

Nguồn: https://github.com/OpenMOSS/MOSS-TTS-Nano (đường ONNX CPU). Giữ license gốc
tại MOSS_LICENSE. Chỉ lấy các module cần cho suy luận ONNX (không lấy đường torch):
  - onnx_tts_runtime.py            (ĐÃ VÁ: _load_reference_audio dùng soundfile+soxr thay torchaudio)
  - ort_cpu_runtime.py             (core inference, vốn torch-free)
  - text_normalization_pipeline.py (WeText wrapper — có thể tắt)
  - tts_robust_normalizer_single_script.py
  - moss_tts_nano/defaults.py

Adapter khớp TTSEngine Protocol của app nằm ở server/engine_moss_nano.py.
"""
from .onnx_tts_runtime import OnnxTtsRuntime  # noqa: F401
