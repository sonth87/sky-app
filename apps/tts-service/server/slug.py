"""slug.py — Chuyển tên tiếng Việt có dấu thành id ASCII ổn định.

Dùng cho id giọng preset built-in (vd "Minh Đức" → "minh-duc") — CẢ `main.py` (sinh id lúc
merge preset vào registry) LẪN `generate_previews.py` (đặt tên file preview) đều phải cho ra
CÙNG 1 slug cho cùng 1 tên, nếu không `/preview/{voice_id}` sẽ không tìm thấy file tĩnh đã
generate — import chung module này thay vì viết lại logic ở 2 nơi để tránh lệch nhau.
"""
from __future__ import annotations

import re
import unicodedata


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.replace("Đ", "D").replace("đ", "d")
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s
