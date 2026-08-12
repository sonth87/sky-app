"""
chunked_tts.py — cắt text dài thành đoạn theo ranh giới câu, sinh từng đoạn rồi nối lại
bằng crossfade; kèm phát hiện + thử lại khi model sinh lạc (runaway).

Port từ voicebox's `backend/utils/chunked_tts.py` (/Users/skyline/TEST/voicebox-main).
Khác bản gốc ở 2 điểm, đều có lý do:

  - ĐỒNG BỘ, không async. sky-app đã chạy toàn bộ phần nặng trong `asyncio.to_thread`
    (xem main.py's `/synthesize`), engine expose hàm sync — bọc thêm một lớp async ở đây
    chỉ thêm nhiễu chứ không thêm tính đồng thời nào.
  - KHÔNG có `seed`. Engine của sky-app không nhận seed nên không thể tái lập
    (reproducible) theo cặp (text, seed) như voicebox; bỏ hẳn thay vì giữ tham số chết.

Vì sao cần: mlx-audio bản đang cài (0.4.8) đã GỠ cap chống runaway trong `_generate_icl`,
nên khi model bỏ lỡ EOS nó sinh tới trần `max_tokens`. engine_qwen_mlx.py đã tự cap lại,
nhưng cap chỉ giới hạn ĐỘ DÀI — audio trong khoảng đó vẫn có thể là `[tiếng nói][im lặng
dài][tiếng ảo giác]`. `runaway_detector` bắt đúng dạng đó rồi chia nhỏ text thử lại, và
nếu vẫn hỏng thì NÉM LỖI chứ không trả audio hỏng về cho người dùng.
"""
from __future__ import annotations

import re
from typing import Callable

import numpy as np

# Ngưỡng ký tự mỗi đoạn. 800 theo voicebox — đủ dài để không cắt vụn ngữ điệu, đủ ngắn
# để model không trôi khỏi alignment giữa chừng.
DEFAULT_MAX_CHUNK_CHARS = 800
MAX_RUNAWAY_RETRIES = 2
MIN_RUNAWAY_RETRY_CHARS = 100

# Viết tắt KHÔNG được coi là hết câu (so khớp không phân biệt hoa thường).
# Danh sách gốc của voicebox là tiếng Anh; bổ sung phần tiếng Việt vì đây là ngôn ngữ
# chính của sky-app và các tiền tố học hàm/địa danh xuất hiện dày trong văn bản nghi lễ
# ("GS. Nguyễn Văn A", "TP. Hồ Chí Minh") — thiếu chúng thì mỗi cái tên bị cắt làm đôi.
_ABBREVIATIONS = frozenset({
    # Tiếng Anh (giữ nguyên từ voicebox)
    "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "ave", "blvd",
    "inc", "ltd", "corp", "dept", "est", "approx", "vs", "etc",
    "e.g", "i.e", "a.m", "p.m", "u.s", "u.s.a", "u.k",
    # Tiếng Việt: học hàm/học vị, đơn vị hành chính, tổ chức
    "gs", "pgs", "ts", "ths", "tskh", "bs", "ks", "cn", "th",
    "tp", "tt", "q", "p", "x", "h", "tx",
    "nxb", "đh", "cđ", "thpt", "thcs", "ubnd", "hđnd", "cty", "tnhh",
})

# Thẻ phi ngôn ngữ dạng [laugh] — không được cắt vào giữa.
_PARA_TAG_RE = re.compile(r"\[[^\]]*\]")


def split_text_into_chunks(text: str, max_chars: int = DEFAULT_MAX_CHUNK_CHARS) -> list[str]:
    """Cắt `text` tại ranh giới tự nhiên thành các đoạn tối đa `max_chars` ký tự.

    Thứ tự ưu tiên: hết câu (`.!?` không thuộc viết tắt, không nằm trong `[...]`) →
    ranh giới mệnh đề (`;:,—`) → khoảng trắng → cắt cứng.
    """
    text = text.strip()
    if not text:
        return []
    if len(text) <= max_chars:
        return [text]

    chunks: list[str] = []
    remaining = text

    while remaining:
        remaining = remaining.lstrip()
        if not remaining:
            break
        if len(remaining) <= max_chars:
            chunks.append(remaining)
            break

        segment = remaining[:max_chars]
        split_pos = _find_last_sentence_end(segment)
        if split_pos == -1:
            split_pos = _find_last_clause_boundary(segment)
        if split_pos == -1:
            split_pos = segment.rfind(" ")
        if split_pos == -1:
            split_pos = _safe_hard_cut(segment, max_chars)

        chunk = remaining[: split_pos + 1].strip()
        if chunk:
            chunks.append(chunk)
        remaining = remaining[split_pos + 1:]

    return chunks


def _find_last_sentence_end(text: str) -> int:
    """Vị trí dấu kết câu CUỐI CÙNG trong `text`, hoặc -1."""
    best = -1
    for m in re.finditer(r"[.!?](?:\s|$)", text):
        pos = m.start()
        if text[pos] == ".":
            # Lùi về đầu từ đứng trước dấu chấm để nhận diện viết tắt.
            word_start = pos - 1
            while word_start >= 0 and text[word_start].isalpha():
                word_start -= 1
            if text[word_start + 1: pos].lower() in _ABBREVIATIONS:
                continue
            # Số thập phân ("3.5") — chữ số ngay trước dấu chấm.
            if word_start >= 0 and text[word_start].isdigit():
                continue
        if _inside_bracket_tag(text, pos):
            continue
        best = pos
    # Dấu kết câu CJK (。！？) — không có khoảng trắng đi kèm nên tìm riêng.
    for m in re.finditer(r"[。！？]", text):
        if m.start() > best:
            best = m.start()
    return best


def _find_last_clause_boundary(text: str) -> int:
    best = -1
    for m in re.finditer(r"[;:,—](?:\s|$)", text):
        pos = m.start()
        if _inside_bracket_tag(text, pos):
            continue
        best = pos
    return best


def _inside_bracket_tag(text: str, pos: int) -> bool:
    return any(m.start() < pos < m.end() for m in _PARA_TAG_RE.finditer(text))


def _safe_hard_cut(segment: str, max_chars: int) -> int:
    """Vị trí cắt cứng không rơi vào giữa một thẻ `[...]`."""
    cut = max_chars - 1

    # Thẻ nằm TRỌN trong segment và vị trí cắt rơi vào giữa nó.
    for m in _PARA_TAG_RE.finditer(segment):
        if m.start() < cut < m.end():
            return m.start() - 1 if m.start() > 0 else cut

    # Thẻ bị chính `segment` cắt cụt: dấu '[' mở ra nhưng ']' nằm ngoài `max_chars` nên
    # `_PARA_TAG_RE` (đòi có ']') KHÔNG khớp, vòng lặp trên không thấy gì và ta cắt ngay
    # giữa thẻ. Bản gốc voicebox bỏ sót đúng ca này — nó chỉ đúng khi thẻ nằm gọn trong
    # segment, mà thẻ ở sát mép mới là lúc cần bảo vệ nhất.
    last_open = segment.rfind("[")
    if last_open > segment.rfind("]") and last_open <= cut:
        return last_open - 1 if last_open > 0 else cut

    return cut


def concatenate_audio_chunks(chunks: list[np.ndarray], sample_rate: int,
                             crossfade_ms: int = 50) -> np.ndarray:
    """Nối các đoạn audio, crossfade ngắn ở mối nối để không nghe thấy tiếng "cụp"."""
    if not chunks:
        return np.array([], dtype=np.float32)
    if len(chunks) == 1:
        return np.asarray(chunks[0], dtype=np.float32)

    crossfade_samples = int(sample_rate * crossfade_ms / 1000)
    result = np.array(chunks[0], dtype=np.float32, copy=True)

    for chunk in chunks[1:]:
        chunk = np.asarray(chunk, dtype=np.float32)
        if chunk.size == 0:
            continue
        overlap = min(crossfade_samples, result.size, chunk.size)
        if overlap > 0:
            fade_out = np.linspace(1.0, 0.0, overlap, dtype=np.float32)
            fade_in = np.linspace(0.0, 1.0, overlap, dtype=np.float32)
            result[-overlap:] = result[-overlap:] * fade_out + chunk[:overlap] * fade_in
            result = np.concatenate([result, chunk[overlap:]])
        else:
            result = np.concatenate([result, chunk])

    return result


def generate_chunked(
    generate_fn: Callable[[str], np.ndarray],
    text: str,
    sample_rate: int,
    max_chunk_chars: int = DEFAULT_MAX_CHUNK_CHARS,
    crossfade_ms: int = 50,
    runaway_detector: Callable[[np.ndarray, int], bool] | None = None,
) -> np.ndarray:
    """Sinh audio cho `text`, tự chia đoạn khi quá dài.

    `generate_fn(chunk_text) -> np.ndarray` — sinh audio THÔ cho một đoạn (chưa hậu xử
    lý). Gọi ở tầng `synthesize()` của engine để `_post_process` (đổi tốc độ, cân
    loudness, nối đuôi im lặng) chạy MỘT LẦN trên toàn bộ audio đã ghép: chạy trên từng
    đoạn sẽ chèn 200ms im lặng vào giữa câu và cân RMS mỗi đoạn một kiểu.

    `runaway_detector(audio, sample_rate) -> bool` — nếu báo động, đoạn text đó bị chia
    đôi và thử lại (tối đa `MAX_RUNAWAY_RETRIES` lần, không chia nhỏ hơn
    `MIN_RUNAWAY_RETRY_CHARS`). Hết đường thì raise: audio hỏng mà trả về vẫn là hỏng,
    thà báo lỗi để người dùng thử lại còn hơn giao một file rác.

    Text ngắn (≤ `max_chunk_chars`) đi đường tắt: gọi thẳng `generate_fn`, không tốn gì.
    """
    def generate_one(chunk_text: str, retry_depth: int = 0) -> np.ndarray:
        audio = np.asarray(generate_fn(chunk_text), dtype=np.float32)

        if runaway_detector is not None and runaway_detector(audio, sample_rate):
            if retry_depth >= MAX_RUNAWAY_RETRIES or len(chunk_text) <= MIN_RUNAWAY_RETRY_CHARS:
                raise RuntimeError(
                    "Audio sinh ra vẫn lỗi sau khi đã thử chia nhỏ văn bản. "
                    "Hãy thử lại, rút ngắn câu, hoặc đổi giọng khác."
                )

            retry_max_chars = max(MIN_RUNAWAY_RETRY_CHARS, len(chunk_text) // 2)
            retry_chunks = split_text_into_chunks(chunk_text, retry_max_chars)
            if len(retry_chunks) <= 1:
                raise RuntimeError("Không chia nhỏ được văn bản để thử lại phần audio lỗi.")

            return concatenate_audio_chunks(
                [generate_one(t, retry_depth + 1) for t in retry_chunks],
                sample_rate, crossfade_ms=crossfade_ms,
            )

        return audio

    chunks = split_text_into_chunks(text, max_chunk_chars)
    if len(chunks) <= 1:
        return generate_one(text)

    return concatenate_audio_chunks(
        [generate_one(c) for c in chunks], sample_rate, crossfade_ms=crossfade_ms,
    )
