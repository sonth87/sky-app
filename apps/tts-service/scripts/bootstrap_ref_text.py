#!/usr/bin/env python3
"""
bootstrap_ref_text.py — sinh BẢN NHÁP transcript cho toàn bộ audio mẫu dựng sẵn.

CHỈ CHẠY LÚC DEV, KHÔNG đóng gói vào app. Kết quả phải được NGƯỜI ĐỌC LẠI VÀ SỬA rồi
mới commit — xem phần "Vì sao bắt buộc rà tay" bên dưới.

Vì sao cần: engine clone kiểu in-context (Qwen bắt buộc, VoxCPM tuỳ chọn) cần biết audio
mẫu ĐANG NÓI GÌ để căn text↔codec. Thiếu nó thì Qwen cho ra audio hỏng hoàn toàn (xem
engine_qwen_mlx.py's `_run`). 46 giọng vi-VN + 23 giọng en-US trong catalog vendor và
các file ref rời hiện KHÔNG có transcript nào — script này tạo bản nháp cho chúng.

Vì sao bắt buộc rà tay: Whisper sai chính tả TÊN RIÊNG tiếng Việt là chuyện thường
("Vũ" ↔ "Vu", "Nghệ An" ↔ "Nghệ Anh"), và transcript sai làm ICL KÉM ĐI chứ không phải
vô hại — model học sai mapping chữ→âm ngay trong prompt. Bản nháp sai còn tệ hơn không
có, vì không ai biết mà nghi ngờ nó.

Cách dùng:

    # 1. Cài Whisper vào venv dev (chỉ Apple Silicon; ~150MB model tải lần đầu)
    venv/bin/pip install mlx-audio==0.4.8

    # 2. Sinh bản nháp cho catalog + thư mục ref rời
    venv/bin/python scripts/bootstrap_ref_text.py --catalog resources/voice-ref/vi-VN
    venv/bin/python scripts/bootstrap_ref_text.py --refs ~/Library/Application\\ Support/...

    # 3. ĐỌC LẠI file .draft.json, sửa tên riêng, rồi ghi đè vào catalog
    venv/bin/python scripts/bootstrap_ref_text.py --apply resources/voice-ref/vi-VN

Mô hình dùng: `mlx_audio.stt` (Whisper). Cùng đường mà voicebox dùng cho nút "Transcribe"
(backend/backends/mlx_backend.py's MLXSTTBackend) — khác chỗ voicebox chạy nó lúc RUNTIME
trên máy người dùng, còn ở đây chạy lúc dev rồi commit kết quả, nên bản phát hành không
phải kèm Whisper.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

AUDIO_EXTS = {".wav", ".mp3", ".flac", ".m4a", ".ogg"}
DRAFT_SUFFIX = ".ref-text-draft.json"

# Whisper cỡ "base" đủ cho câu ngắn rõ ràng của audio mẫu và tải nhanh; nâng lên
# "small"/"medium" nếu bản nháp sai quá nhiều (đằng nào cũng phải rà tay).
DEFAULT_MODEL = "mlx-community/whisper-base-mlx"


def _load_stt(model: str):
    try:
        from mlx_audio.stt import load
    except ImportError:
        sys.exit(
            "Chưa cài mlx-audio. Chạy:  venv/bin/pip install mlx-audio==0.4.8\n"
            "(chỉ chạy được trên Apple Silicon — Whisper qua MLX cần Metal)"
        )
    print(f"Đang nạp {model} ...", file=sys.stderr)
    return load(model)


def _transcribe(stt, path: Path, language: str | None) -> str:
    opts = {"language": language} if language else {}
    result = stt.generate(str(path), **opts)
    if isinstance(result, str):
        return result.strip()
    if isinstance(result, dict):
        return str(result.get("text", "")).strip()
    return str(getattr(result, "text", result)).strip()


def _lang_hint(lang_dir_name: str) -> str | None:
    """'vi-VN' → 'vi'. Whisper nhận mã 2 chữ; None = tự nhận diện."""
    prefix = lang_dir_name.split("-")[0].lower()
    return prefix if len(prefix) == 2 else None


def cmd_catalog(catalog_dir: Path, model: str) -> None:
    """Sinh bản nháp cho mọi entry trong <catalog_dir>/catalog.json."""
    catalog_path = catalog_dir / "catalog.json"
    if not catalog_path.exists():
        sys.exit(f"Không thấy {catalog_path}")

    entries = json.loads(catalog_path.read_text(encoding="utf-8"))
    ref_dir = catalog_dir / "ref"
    language = _lang_hint(catalog_dir.name)
    stt = _load_stt(model)

    draft: dict[str, str] = {}
    for i, entry in enumerate(entries, 1):
        audio = ref_dir / entry["file"]
        if not audio.exists():
            print(f"  [{i}/{len(entries)}] {entry['id']}: THIẾU FILE {audio.name}", file=sys.stderr)
            continue
        try:
            text = _transcribe(stt, audio, language)
        except Exception as e:
            print(f"  [{i}/{len(entries)}] {entry['id']}: LỖI {type(e).__name__}: {e}", file=sys.stderr)
            continue
        draft[entry["id"]] = text
        print(f"  [{i}/{len(entries)}] {entry['id']}: {text}", file=sys.stderr)

    out = catalog_dir / f"catalog{DRAFT_SUFFIX}"
    out.write_text(json.dumps(draft, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nĐã ghi bản nháp: {out}\n"
          f"⚠️  ĐỌC LẠI và SỬA tên riêng trước khi chạy --apply.", file=sys.stderr)


def cmd_refs(ref_dir: Path, model: str, language: str | None) -> None:
    """Sinh sidecar .txt cho mọi file audio rời trong 1 thư mục ref.

    Dùng cho các file ref không thuộc catalog (vd thư mục vieneu-voices/ref của người
    dùng). Ghi thẳng .txt vì đó chính là quy ước `_ref_text_for()` đọc — nhưng vẫn nên
    đọc lại từng file trước khi tin.
    """
    files = sorted(p for p in ref_dir.iterdir() if p.suffix.lower() in AUDIO_EXTS)
    if not files:
        sys.exit(f"Không thấy file audio nào trong {ref_dir}")

    stt = _load_stt(model)
    for i, audio in enumerate(files, 1):
        sidecar = audio.with_suffix(".txt")
        if sidecar.exists():
            print(f"  [{i}/{len(files)}] {audio.name}: đã có .txt, bỏ qua", file=sys.stderr)
            continue
        try:
            text = _transcribe(stt, audio, language)
        except Exception as e:
            print(f"  [{i}/{len(files)}] {audio.name}: LỖI {type(e).__name__}: {e}", file=sys.stderr)
            continue
        sidecar.write_text(text + "\n", encoding="utf-8")
        print(f"  [{i}/{len(files)}] {audio.name}: {text}", file=sys.stderr)

    print(f"\n⚠️  Đã ghi {len(files)} sidecar .txt — ĐỌC LẠI và SỬA tên riêng.", file=sys.stderr)


def cmd_apply(catalog_dir: Path) -> None:
    """Chép bản nháp ĐÃ RÀ TAY vào field `ref_text` của catalog.json."""
    catalog_path = catalog_dir / "catalog.json"
    draft_path = catalog_dir / f"catalog{DRAFT_SUFFIX}"
    if not draft_path.exists():
        sys.exit(f"Không thấy bản nháp {draft_path} — chạy --catalog trước.")

    entries = json.loads(catalog_path.read_text(encoding="utf-8"))
    draft = json.loads(draft_path.read_text(encoding="utf-8"))

    applied = 0
    for entry in entries:
        text = (draft.get(entry["id"]) or "").strip()
        if text:
            entry["ref_text"] = text
            applied += 1

    catalog_path.write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    missing = [e["id"] for e in entries if not (e.get("ref_text") or "").strip()]
    print(f"Đã ghi ref_text cho {applied}/{len(entries)} entry vào {catalog_path}", file=sys.stderr)
    if missing:
        print(f"⚠️  Còn thiếu ({len(missing)}): {', '.join(missing)}\n"
              f"   Những giọng này sẽ KHÔNG dùng được với Qwen.", file=sys.stderr)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--catalog", metavar="DIR", type=Path,
                   help="Thư mục chứa catalog.json + ref/ (vd resources/voice-ref/vi-VN)")
    g.add_argument("--refs", metavar="DIR", type=Path,
                   help="Thư mục audio rời — ghi sidecar .txt cạnh mỗi file")
    g.add_argument("--apply", metavar="DIR", type=Path,
                   help="Chép bản nháp đã rà tay vào catalog.json")
    ap.add_argument("--model", default=DEFAULT_MODEL, help=f"Model Whisper (mặc định {DEFAULT_MODEL})")
    ap.add_argument("--language", default=None, help="Mã ngôn ngữ 2 chữ (vd 'vi'). Bỏ trống = tự nhận diện")
    args = ap.parse_args()

    if args.catalog:
        cmd_catalog(args.catalog, args.model)
    elif args.refs:
        cmd_refs(args.refs, args.model, args.language)
    else:
        cmd_apply(args.apply)


if __name__ == "__main__":
    main()
