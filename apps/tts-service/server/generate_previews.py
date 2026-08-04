"""Generate voice preview WAV files. Run with HF_HOME, VIENEU_PREVIEW_DIR, VIENEU_REF_DIR set."""
import json, os, random, wave, numpy as np
from pathlib import Path
from vieneu import Vieneu

SAMPLE_RATE = 48_000

# Câu mẫu: đọc từ sample_texts.json (cạnh file này) — NGUỒN DUY NHẤT, bản TypeScript dùng cho
# UI "Chọn template câu" ở modules/tts-studio/src/data/sampleTexts.ts PHẢI giữ đồng bộ nội dung
# với file này (2 runtime khác nhau, không import chéo được — xem comment ở file .ts đó).
# Mỗi giọng được RANDOM 1 câu trong danh sách khi generate (bug thật 2026-08-04: trước đây 1 câu
# cố định cho MỌI giọng — yêu cầu thêm sau: cho đa dạng, tránh nhàm khi nghe thử nhiều giọng).
_sample_texts_path = Path(__file__).resolve().parent / 'sample_texts.json'
SAMPLE_TEXTS = [entry['text'] for entry in json.loads(_sample_texts_path.read_text(encoding='utf-8'))]

preview_dir = os.environ.get('VIENEU_PREVIEW_DIR', '')
if not preview_dir:
    raise RuntimeError("VIENEU_PREVIEW_DIR not set")
os.makedirs(preview_dir, exist_ok=True)

ref_dir = Path(os.environ.get('VIENEU_REF_DIR', ''))
if not ref_dir or not ref_dir.exists():
    raise RuntimeError(f"VIENEU_REF_DIR not set or not found: {ref_dir}")

# speaker_id → ref audio filename: đọc TRỰC TIẾP từ voice-registry.json (mọi voice type='cloned'
# có ref_file, và KHÔNG có source_catalog_id trỏ tới 1 catalog entry THẬT — get_preview() (main.py)
# chỉ fallback được sang audio catalog gốc nếu source_catalog_id đó tồn tại thật trong
# catalog.json, nên vẫn cần preview tự tổng hợp cho những giọng có source_catalog_id GIẢ, vd
# preset-HoaiMy/preset-NamMinh gán id trùng chính nó để lên tab Hệ thống — xem hội thoại
# 2026-08-04) — cùng cách resolve path với main.py's VIENEU_REGISTRY_PATH.
#
# Bug thật 2026-08-04: bản cũ hard-code dict 5 giọng hệ thống gốc (NF/NF2/SF/NM1/SM). 2 giọng
# preset thêm sau (Hoài My, Nam Minh) không ai nhớ thêm vào dict này → get_preview() (main.py)
# không có file preview tĩnh, cũng không có source_catalog_id để fallback → 404 → phía renderer
# (audio.onerror) nuốt lỗi im lặng, người dùng bấm nghe thử không thấy gì cả, không hiểu vì sao.
# Đọc thẳng từ registry thay vì dict tay để KHÔNG lặp lại bug này mỗi lần thêm voice preset mới.
registry_path_env = os.environ.get('VIENEU_REGISTRY_PATH', '')
registry_path = Path(registry_path_env) if registry_path_env else ref_dir.parent / 'voice-registry.json'
if not registry_path.exists():
    raise RuntimeError(f"voice-registry.json not found: {registry_path}")
_registry_voices = json.loads(registry_path.read_text(encoding='utf-8')).get('voices', {})

_catalog_path = ref_dir / 'vi-VN' / 'catalog.json'
_real_catalog_ids = set()
if _catalog_path.exists():
    _real_catalog_ids = {e.get('id') for e in json.loads(_catalog_path.read_text(encoding='utf-8'))}

SPEAKER_TO_REF = {
    sid: v['ref_file']
    for sid, v in _registry_voices.items()
    if v.get('type') == 'cloned'
    and v.get('ref_file')
    and v.get('source_catalog_id') not in _real_catalog_ids  # None (chưa gán) hoặc id giả → vẫn cần
}

tts = Vieneu()
for sid, ref_file in SPEAKER_TO_REF.items():
    out_path = os.path.join(preview_dir, f"{sid}.wav")
    if os.path.exists(out_path):
        print(f"[Preview] Skip {sid}.wav (already exists)")
        continue
    ref_path = ref_dir / ref_file
    if not ref_path.exists():
        print(f"[Preview] WARN: ref audio not found: {ref_path}, skipping {sid}")
        continue
    text = random.choice(SAMPLE_TEXTS)
    print(f"[Preview] Generating {sid} (ref={ref_file}, text={text[:30]!r}...)...", flush=True)
    audio = tts.infer(text, ref_audio=str(ref_path), apply_watermark=False)
    int16 = np.clip(audio * 32767, -32768, 32767).astype(np.int16)
    with wave.open(out_path, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(int16.tobytes())
    print(f"[Preview]   -> {sid}.wav ({os.path.getsize(out_path)//1024} KB)", flush=True)

print("[Preview] Done.")
