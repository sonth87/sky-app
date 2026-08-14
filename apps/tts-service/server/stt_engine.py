"""
stt_engine.py — Speech-to-Text engine abstraction (Phase 1, xem
docs/dev/history/2026-08-14-stt-nen-tang-giai-doan-1.md cho lý do kiến trúc).

`SttEngine` là Protocol TÁCH HẲN `TTSEngine` (engine.py) — transcribe-shaped
(audio → text), không phải synthesize-shaped (text → audio). Không dùng chung interface
dù cả hai đều là "engine" trong `engine_registry.py`'s `_ENGINES` dict, vì bản chất việc
2 loại engine làm là ngược chiều nhau, ép chung 1 Protocol chỉ tạo ra method rỗng vô nghĩa
ở phía bên kia.

Để thêm engine STT mới: implement Protocol này + đăng ký entry `category: "stt"` trong
`engine_registry.py`'s `_ENGINES` — KHÔNG cần đụng endpoint `/stt/*` ở main.py.
"""
from __future__ import annotations

from typing import Protocol, TypedDict


class TranscriptionResult(TypedDict):
    text: str
    language: str | None
    duration_sec: float


class SttEngine(Protocol):
    """Minimal interface mà bất kỳ STT engine nào phải implement."""

    def capabilities(self) -> dict:
        """{id, label, languages: list[str] | None, supports_language_hint: bool}.
        `languages=None` nghĩa là đa ngôn ngữ không giới hạn danh sách cụ thể (Whisper)."""
        ...

    def transcribe(self, audio_path: str, language: str | None = None) -> TranscriptionResult:
        """Phiên âm 1 file audio thành text.

        `language` — mã ngôn ngữ ISO ngắn (vd "vi", "en") để ép engine, hoặc `None` để
        engine tự nhận diện (nếu hỗ trợ). Single-shot: nhận NGUYÊN file, không streaming
        (xem quyết định phạm vi ở docs/dev/history/2026-08-14-stt-nen-tang-giai-doan-1.md —
        khớp đúng giới hạn engine tham chiếu, voicebox cũng chỉ single-shot).
        """
        ...
