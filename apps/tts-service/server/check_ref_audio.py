#!/usr/bin/env python3
"""
check_ref_audio.py — Chấm chất lượng file audio tham chiếu TRƯỚC khi clone giọng.

VÌ SAO CẦN
VieNeu clone theo kiểu in-context: file ref được mã hoá thành token âm thanh rồi
nhét thẳng vào prompt (xem _v3_turbo_engine/onnx_runtime_lite.py::_build_rows).
Model "nghe" nguyên bản ghi đó rồi nói tiếp trong cùng khung âm học. Bản ghi bít
tiếng / vang phòng → token nghèo nàn → mất đặc trưng TINH (accent vùng miền) dù
vẫn giữ đặc trưng THÔ (cao độ, giới tính) vì chúng nằm ở dải tần thấp còn nguyên.

Đã kiểm chứng bằng thực nghiệm (07/2026): lấy mẫu ref chuẩn clone ĐÚNG accent Nam,
cắt bỏ tần số > 5.5kHz rồi clone lại → accent vỡ thành Bắc/lơ lớ. Cùng người nói,
cùng nội dung, cùng pipeline — chỉ khác phổ tần.

Ngưỡng dưới đây hiệu chuẩn từ hai nhóm file thật trong dự án:
  ĐẠT : vieneu/assets/samples/Vĩnh, nam-nam.wav (Gia Huy), adam-low-tone.wav,
        nu-bac-2.wav  → clone giữ đúng accent
  HỎNG: gia_bao.wav (bít tiếng), truc_lam.mp3 (vang phòng nặng)
        → clone lệch sang giọng Bắc

LƯU Ý về nu-bac.wav (Lan Anh): file này bít tiếng ngang gia_bao (cắt ~5.2kHz, >8kHz
chỉ 0.1%) nên bị chấm KHÔNG ĐẠT, dù xưa nay vẫn "chạy tốt". Không mâu thuẫn: Lan Anh
là giọng BẮC, mà accent model rơi về khi mất dữ liệu cũng là BẮC — lỗi bị che nên
không ai nhận ra. Cùng khiếm khuyết đó trên một giọng Nam thì lộ ngay. Script chấm
chất lượng BẢN GHI, không chấm "nghe có vẻ ổn".

GIỚI HẠN — đọc kỹ trước khi tin kết quả
Script KHÔNG đo trực tiếp accent (không có bộ phân loại vùng miền). Nó đo các yếu
tố âm học đã được chứng minh là NGUYÊN NHÂN làm mất accent. File qua hết ngưỡng
vẫn có thể clone kém vì lý do khác — ví dụ bao_ngoc_gentle.mp3 đạt phần lớn chỉ số
nhưng vẫn lệch, do nén lossy cộng lối đọc thì thầm. Đạt = "không có lỗi đã biết",
không phải "chắc chắn clone đúng".

CÁCH DÙNG
    python check_ref_audio.py file.wav [file2.mp3 ...]
    python check_ref_audio.py duong/dan/ref-dir/
    python check_ref_audio.py file.wav --json

Exit code: 0 nếu mọi file ĐẠT hoặc chỉ CẢNH BÁO; 1 nếu có file KHÔNG ĐẠT.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

AUDIO_EXTS = {".wav", ".mp3", ".flac", ".m4a", ".ogg", ".opus", ".aac", ".wma"}
LOSSY_EXTS = {".mp3", ".m4a", ".ogg", ".opus", ".aac", ".wma"}

# Độ dài — NGUỒN CHUẨN DUY NHẤT cho cả CLI này lẫn `/voices/clone` (main.py import
# thẳng 2 hằng dưới đây, không khai lại). Trước đây main.py có bản sao riêng
# `_CLONE_MIN/MAX_SECONDS` và comment ở đây chỉ dặn "khớp với main.py" bằng niềm tin —
# hai nơi lệch nhau thì CLI báo ĐẠT còn server từ chối, không ai hiểu vì sao.
#
# Trần 30s (không phải 15s như trước): khớp voicebox, và clone kiểu in-context ổn định
# hơn khi ref dài — ref càng dài model càng nhiều ngữ cảnh về giọng. Ràng buộc thời
# gian prefill vẫn còn nhưng 30s là mức voicebox chạy production được.
MIN_SECONDS, MAX_SECONDS = 1.5, 30.0
IDEAL_MIN, IDEAL_MAX = 4.0, 10.0

# Băng thông — nhóm chỉ số quyết định accent.
#
# Đã thử và LOẠI hai chỉ số nghe có vẻ hợp lý nhưng không tách được nhóm:
#   - Tỉ lệ năng lượng dải 4-8kHz: gia_bao (hỏng) đạt 7.2%, cao hơn cả Vĩnh
#     (tốt) 4.5% — vì vách cắt của gia_bao rơi đúng ~5.5kHz, phần 4-5.5kHz vẫn dày.
#   - rolloff 95%: bị chi phối bởi phân bố năng lượng tần thấp nên giọng nam trầm
#     thu tốt (nam-nam: 5637Hz) trông còn "tệ" hơn file hỏng.
# Hai chỉ số đó giờ chỉ để tham khảo, không dùng để chấm.
#
# Chỉ số tách sạch là TẦN SỐ CẮT và tỉ lệ năng lượng > 8kHz (đo trên khung có tiếng):
#   nhóm clone đúng : cutoff 10.9-12.3kHz, >8kHz 2.5-5.2%
#   nhóm bít tiếng  : cutoff 4.9-8.1kHz,  >8kHz 0.1-0.4%
CUTOFF_FAIL, CUTOFF_WARN = 9000.0, 10000.0     # Hz
BAND_8K_FAIL, BAND_8K_WARN = 1.2, 2.2          # % tổng năng lượng
MIN_USABLE_NYQUIST = 9000.0                    # Hz — dưới mức này không đủ dải để đánh giá

# Vang phòng: tỉ lệ khung nằm ở "đuôi vang" (-20..-40 dB so với đỉnh).
REVERB_FAIL, REVERB_WARN = 25.0, 16.0          # %
SILENCE_WARN = 3.0                             # % khung im lặng thật (< -50 dB)

# Nhiễu nền
SNR_FAIL, SNR_WARN = 30.0, 50.0                # dB

# Mức tín hiệu và méo
CLIP_FAIL, CLIP_WARN = 1.0, 0.1                # % mẫu chạm trần
LEVEL_LOW, LEVEL_HIGH = -35.0, -12.0           # dBFS RMS

FRAME_MS = 20.0
N_FFT, HOP = 2048, 512


def _db(x: float) -> float:
    return 20.0 * np.log10(x) if x > 1e-9 else -120.0


def analyze(path: Path) -> dict:
    """Đo các chỉ số âm học của 1 file. Raise nếu không đọc được."""
    data, sr = sf.read(str(path), dtype="float32", always_2d=True)
    channels = int(data.shape[1])
    audio = data.mean(axis=1)
    n = int(audio.size)
    dur = n / sr if sr else 0.0

    peak = float(np.max(np.abs(audio))) if n else 0.0
    rms = float(np.sqrt(np.mean(audio ** 2))) if n else 0.0
    clip_ratio = float(np.mean(np.abs(audio) > 0.99)) * 100.0 if n else 0.0
    dc_offset = float(np.mean(audio)) if n else 0.0

    # ── Miền năng lượng: khung 20ms, độc lập sample rate ─────────────────────
    flen = max(1, int(sr * FRAME_MS / 1000.0))
    nfr = n // flen
    if nfr >= 4:
        frames = audio[: nfr * flen].reshape(nfr, flen)
        frame_rms = np.sqrt(np.mean(frames ** 2, axis=1) + 1e-12)
        top = float(np.max(frame_rms))
        fdb = 20.0 * np.log10(frame_rms / (top + 1e-12) + 1e-12)
        reverb_tail = float(np.mean((fdb > -40) & (fdb < -20))) * 100.0
        silence = float(np.mean(fdb < -50)) * 100.0
        noise_floor = float(np.percentile(frame_rms, 10))
        snr = _db(top) - _db(noise_floor)
    else:
        reverb_tail = silence = snr = float("nan")

    # ── Miền phổ: chỉ lấy khung CÓ TIẾNG, tránh nền nhiễu phẳng làm lệch ─────
    rolloff95 = band_4_8 = band_8p = cutoff = float("nan")
    if n >= N_FFT + HOP:
        nsp = (n - N_FFT) // HOP + 1
        win = np.hanning(N_FFT)
        specs = np.stack([
            np.abs(np.fft.rfft(audio[i * HOP: i * HOP + N_FFT] * win))
            for i in range(nsp)
        ])
        freqs = np.fft.rfftfreq(N_FFT, 1.0 / sr)
        energy = np.sqrt(np.mean(specs ** 2, axis=1))
        voiced = specs[energy >= 0.2 * float(np.max(energy))]
        spec = (voiced if len(voiced) else specs).mean(axis=0)

        total = float(spec.sum()) + 1e-12
        csum = np.cumsum(spec)
        rolloff95 = float(freqs[int(np.searchsorted(csum, 0.95 * total))])
        band_4_8 = float(spec[(freqs >= 4000) & (freqs < 8000)].sum()) / total * 100.0
        band_8p = float(spec[freqs >= 8000].sum()) / total * 100.0

        # Tần số cắt: điểm cao nhất còn trên (đỉnh - 50dB) — lộ dấu nén lossy
        sdb = 20.0 * np.log10(spec / (float(spec.max()) + 1e-12) + 1e-12)
        above = np.where(sdb > -50)[0]
        cutoff = float(freqs[int(above[-1])]) if len(above) else 0.0

    return {
        "file": str(path),
        "name": path.name,
        "sample_rate": sr,
        "channels": channels,
        "duration_s": dur,
        "peak": peak,
        "rms_dbfs": _db(rms),
        "clip_pct": clip_ratio,
        "dc_offset": dc_offset,
        "reverb_tail_pct": reverb_tail,
        "silence_pct": silence,
        "snr_db": snr,
        "rolloff95_hz": rolloff95,
        "band_4_8k_pct": band_4_8,
        "band_8k_plus_pct": band_8p,
        "cutoff_hz": cutoff,
        "lossy_source": path.suffix.lower() in LOSSY_EXTS,
    }


def _worst(*levels: str) -> str:
    for lv in ("FAIL", "WARN"):
        if lv in levels:
            return lv
    return "OK"


def grade(m: dict) -> list[dict]:
    """Chấm từng tiêu chí → list {level, label, detail, hint}."""
    out: list[dict] = []

    def add(level, label, detail, hint=""):
        out.append({"level": level, "label": label, "detail": detail, "hint": hint})

    # Độ dài
    d = m["duration_s"]
    if d < MIN_SECONDS:
        add("FAIL", "Độ dài", f"{d:.2f}s", f"Ngắn hơn mức tối thiểu {MIN_SECONDS}s — server sẽ từ chối.")
    elif d > MAX_SECONDS:
        add("FAIL", "Độ dài", f"{d:.2f}s", f"Dài hơn mức tối đa {MAX_SECONDS:.0f}s — server sẽ từ chối.")
    elif d < IDEAL_MIN:
        add("WARN", "Độ dài", f"{d:.2f}s", f"Nên {IDEAL_MIN:.0f}-{IDEAL_MAX:.0f}s để model đủ tín hiệu ngữ điệu.")
    else:
        add("OK", "Độ dài", f"{d:.2f}s")

    # Băng thông — tiêu chí quyết định accent
    co, b8 = m["cutoff_hz"], m["band_8k_plus_pct"]
    nyquist = m["sample_rate"] / 2.0
    if np.isnan(co):
        add("WARN", "Băng thông", "không đo được (file quá ngắn)")
    elif nyquist < MIN_USABLE_NYQUIST:
        add("FAIL", "Băng thông", f"sample rate {m['sample_rate']}Hz (trần {nyquist:.0f}Hz)",
            "Sample rate quá thấp — bản ghi không thể chứa dải phụ âm cần cho accent. "
            "Cần nguồn ≥ 24kHz.")
    else:
        detail = (f"cắt ở {co:.0f}Hz  >8kHz={b8:.1f}%"
                  f"   (tham khảo: 4-8kHz={m['band_4_8k_pct']:.1f}% rolloff95={m['rolloff95_hz']:.0f}Hz)")
        if co < CUTOFF_FAIL or b8 < BAND_8K_FAIL:
            add("FAIL", "Băng thông", detail,
                "Bản ghi BỊ BÍT TIẾNG — mất dải phụ âm mang đặc trưng vùng miền. Đây là "
                "nguyên nhân số 1 làm clone lệch accent (đã kiểm chứng nhân quả). Tần số "
                "cao đã mất thì hậu kỳ KHÔNG tái tạo lại được — phải thu lại.")
        elif co < CUTOFF_WARN or b8 < BAND_8K_WARN:
            add("WARN", "Băng thông", detail,
                "Hơi tối tiếng — accent có thể bị lơ lớ. Nên thu lại gần mic hơn.")
        else:
            add("OK", "Băng thông", detail)

    # Vang phòng
    rv, si = m["reverb_tail_pct"], m["silence_pct"]
    if np.isnan(rv):
        add("WARN", "Vang phòng", "không đo được")
    else:
        detail = f"đuôi vang={rv:.0f}%  im lặng sạch={si:.0f}%"
        if rv > REVERB_FAIL:
            add("FAIL", "Vang phòng", detail,
                "Phòng vang nặng — đuôi vang trộn vào giọng làm nhiễu đặc trưng "
                "người nói. Thu lại ở phòng nhiều đồ mềm (rèm, giường, tủ quần áo).")
        elif rv > REVERB_WARN or si < SILENCE_WARN:
            add("WARN", "Vang phòng", detail, "Có tiếng vang hoặc không có khoảng lặng sạch.")
        else:
            add("OK", "Vang phòng", detail)

    # Nhiễu nền
    snr = m["snr_db"]
    if np.isnan(snr):
        add("WARN", "Nhiễu nền", "không đo được")
    elif snr < SNR_FAIL:
        add("FAIL", "Nhiễu nền", f"SNR≈{snr:.0f}dB", "Ồn nền cao — thu lại ở nơi yên tĩnh, tắt quạt/điều hoà.")
    elif snr < SNR_WARN:
        add("WARN", "Nhiễu nền", f"SNR≈{snr:.0f}dB", "Có nhiễu nền nhẹ.")
    else:
        add("OK", "Nhiễu nền", f"SNR≈{snr:.0f}dB")

    # Méo / mức tín hiệu
    cl, lvl = m["clip_pct"], m["rms_dbfs"]
    if cl > CLIP_FAIL:
        add("FAIL", "Méo tiếng", f"clip={cl:.2f}%", "Thu quá to gây vỡ tiếng — giảm gain rồi thu lại.")
    elif cl > CLIP_WARN:
        add("WARN", "Méo tiếng", f"clip={cl:.2f}%", "Có mẫu chạm trần biên độ.")
    else:
        add("OK", "Méo tiếng", f"clip={cl:.2f}%  peak={m['peak']:.2f}")

    if lvl < LEVEL_LOW:
        add("WARN", "Mức tín hiệu", f"{lvl:.1f} dBFS", "Quá nhỏ tiếng — nói gần mic hơn.")
    elif lvl > LEVEL_HIGH:
        add("WARN", "Mức tín hiệu", f"{lvl:.1f} dBFS", "Quá to, dễ méo.")
    else:
        add("OK", "Mức tín hiệu", f"{lvl:.1f} dBFS")

    # Nguồn nén lossy
    co = m["cutoff_hz"]
    if m["lossy_source"]:
        add("WARN", "Định dạng nguồn", f"{Path(m['file']).suffix} (nén lossy), cắt ~{co:.0f}Hz",
            "Nén lossy làm mất chi tiết phổ. Nên lấy bản WAV gốc nếu có.")
    elif not np.isnan(co) and m["sample_rate"] >= 44100 and co < 16000:
        add("WARN", "Định dạng nguồn", f"WAV nhưng phổ cắt ~{co:.0f}Hz",
            "Có dấu hiệu từng qua nén lossy rồi đổi lại sang WAV.")
    else:
        add("OK", "Định dạng nguồn", f"{Path(m['file']).suffix}  {m['sample_rate']}Hz  {m['channels']}ch")

    return out


def report(m: dict, checks: list[dict], verbose: bool = True) -> str:
    verdict = _worst(*[c["level"] for c in checks])
    head = {
        "OK": "ĐẠT — dùng để clone được",
        "WARN": "ĐẠT CÓ ĐIỀU KIỆN — dùng được nhưng có rủi ro",
        "FAIL": "KHÔNG ĐẠT — nên thu lại, clone sẽ dễ sai accent",
    }[verdict]
    mark = {"OK": "[OK]", "WARN": "[!!]", "FAIL": "[XX]"}

    lines = [f"\n{m['name']}", f"  KẾT LUẬN: {head}"]
    for c in checks:
        if not verbose and c["level"] == "OK":
            continue
        lines.append(f"  {mark[c['level']]} {c['label']:<16} {c['detail']}")
        if c["hint"] and c["level"] != "OK":
            lines.append(f"       → {c['hint']}")
    return "\n".join(lines)


def collect(args: list[str]) -> list[Path]:
    paths: list[Path] = []
    for a in args:
        p = Path(a).expanduser()
        if p.is_dir():
            paths += sorted(f for f in p.iterdir() if f.suffix.lower() in AUDIO_EXTS)
        elif p.exists():
            paths.append(p)
        else:
            print(f"Bỏ qua (không tồn tại): {a}", file=sys.stderr)
    return paths


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    as_json = "--json" in sys.argv
    quiet = "--quiet" in sys.argv

    if not args:
        print(__doc__)
        return 2

    paths = collect(args)
    if not paths:
        print("Không có file audio nào để kiểm tra.", file=sys.stderr)
        return 2

    results, worst = [], "OK"
    for p in paths:
        try:
            m = analyze(p)
        except Exception as e:
            print(f"\n{p.name}\n  LỖI ĐỌC FILE: {e}", file=sys.stderr)
            worst = "FAIL"
            continue
        checks = grade(m)
        verdict = _worst(*[c["level"] for c in checks])
        worst = _worst(worst, verdict)
        results.append({"metrics": m, "checks": checks, "verdict": verdict})
        if not as_json:
            print(report(m, checks, verbose=not quiet))

    if as_json:
        print(json.dumps(results, ensure_ascii=False, indent=2, default=float))
    elif len(results) > 1:
        n_fail = sum(1 for r in results if r["verdict"] == "FAIL")
        n_warn = sum(1 for r in results if r["verdict"] == "WARN")
        print(f"\n{'─' * 60}")
        print(f"Tổng: {len(results)} file — {len(results) - n_fail - n_warn} đạt, "
              f"{n_warn} cảnh báo, {n_fail} không đạt")

    return 1 if worst == "FAIL" else 0


if __name__ == "__main__":
    sys.exit(main())
