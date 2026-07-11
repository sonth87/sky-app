"""Generate voice preview WAV files. Run with HF_HOME, VIENEU_PREVIEW_DIR, VIENEU_REF_DIR set."""
import os, wave, numpy as np
from pathlib import Path
from vieneu import Vieneu

SAMPLE_RATE = 48_000
TEXT = "Xin chúc mừng tân kỹ sư Nguyễn Văn An."

# speaker_id → ref audio filename (trong VIENEU_REF_DIR)
SPEAKER_TO_REF = {
    'NF':  'nu-bac.wav',
    'NF2': 'nu-bac-2.wav',
    'SF':  'nu-nam.wav',
    'NM1': 'nam-bac.wav',
    'SM':  'nam-nam.wav',
}

preview_dir = os.environ.get('VIENEU_PREVIEW_DIR', '')
if not preview_dir:
    raise RuntimeError("VIENEU_PREVIEW_DIR not set")
os.makedirs(preview_dir, exist_ok=True)

ref_dir = Path(os.environ.get('VIENEU_REF_DIR', ''))
if not ref_dir or not ref_dir.exists():
    raise RuntimeError(f"VIENEU_REF_DIR not set or not found: {ref_dir}")

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
    print(f"[Preview] Generating {sid} (ref={ref_file})...", flush=True)
    audio = tts.infer(TEXT, ref_audio=str(ref_path), apply_watermark=False)
    int16 = np.clip(audio * 32767, -32768, 32767).astype(np.int16)
    with wave.open(out_path, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(int16.tobytes())
    print(f"[Preview]   -> {sid}.wav ({os.path.getsize(out_path)//1024} KB)", flush=True)

print("[Preview] Done.")
