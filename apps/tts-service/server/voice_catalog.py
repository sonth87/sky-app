"""
voice_catalog.py — Đọc thư viện voice mẫu (vendor) từ resources/voice-ref/{lang}/.

Khác với voice_registry.py (state runtime, ghi được, dùng để synthesize), module này
CHỈ ĐỌC — mỗi ngôn ngữ có 1 catalog.json + thư mục ref/ chứa file audio preview/clone-source.

Cấu trúc:
  resources/voice-ref/
    vi-VN/
      catalog.json   — list[VoiceCatalogEntry]
      ref/
        {id}.mp3|wav

Schema 1 entry trong catalog.json:
{
  "id": "bao_ngoc_gentle",
  "name": "Bảo Ngọc",
  "lang": "vi-VN",
  "language": "Vietnamese",
  "gender": "female",
  "age": "adult",
  "accent": "southern",
  "category": ["narrator"],       # nhóm nội dung phù hợp — dùng filter, nhiều giá trị
  "tagline": "Gentle, Calm, Genuine",  # mô tả ngắn tự do, hiển thị phụ, KHÔNG dùng filter
  "description": "...",
  "tags": ["calm", "gentle"],     # mood/chất giọng — hiển thị phụ
  "file": "bao_ngoc_gentle.mp3",  # tên file trong ref/, vừa là audio preview vừa là nguồn clone
  "clonable": true,
  "source": "vendor"
}
"""
from __future__ import annotations

import json
from pathlib import Path


def list_catalog_langs(voice_ref_root: Path) -> list[str]:
    """Liệt kê các thư mục ngôn ngữ có catalog.json hợp lệ (vd ['vi-VN'])."""
    if not voice_ref_root.exists():
        return []
    langs = []
    for child in sorted(voice_ref_root.iterdir()):
        if child.is_dir() and (child / "catalog.json").exists():
            langs.append(child.name)
    return langs


def load_catalog(voice_ref_root: Path, lang: str | None = None) -> list[dict]:
    """Đọc catalog.json của 1 hoặc tất cả ngôn ngữ. Bỏ qua ngôn ngữ lỗi/thiếu file."""
    langs = [lang] if lang else list_catalog_langs(voice_ref_root)
    entries: list[dict] = []
    for l in langs:
        catalog_path = voice_ref_root / l / "catalog.json"
        if not catalog_path.exists():
            continue
        try:
            with catalog_path.open(encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue
        for entry in data:
            entries.append(entry)
    return entries


def find_catalog_entry(voice_ref_root: Path, lang: str, entry_id: str) -> dict | None:
    for entry in load_catalog(voice_ref_root, lang):
        if entry.get("id") == entry_id:
            return entry
    return None


def get_catalog_ref_path(voice_ref_root: Path, lang: str, entry: dict) -> Path:
    return voice_ref_root / lang / "ref" / entry["file"]
