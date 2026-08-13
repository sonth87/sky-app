# 2026-07-27 — Truy nguyên lỗi clone giọng sai vùng miền, và sửa đường dẫn ref khi dev

> Tài liệu đầy đủ (giải thích + sơ đồ + số liệu): [`docs/services/tts-clone-giong-accent.md`](../../services/tts-clone-giong-accent.md)

## Bối cảnh

TTS Studio: chọn giọng **Bảo Ngọc** / **Trúc Lam** (đều nam/nữ **miền Nam**) nhưng audio sinh ra là **giọng miền Bắc**. Giới tính giữ đúng, chỉ accent sai. Trong khi giọng **Gia Huy** (cũng miền Nam) hoạt động bình thường.

## Kết luận

**Không phải lỗi code.** Nguyên nhân là **chất lượng bản ghi ref**: file bị mất dải tần cao (bít tiếng) hoặc vang phòng nặng → mô hình mất tín hiệu nhận diện accent → rơi về prior trội trong dữ liệu huấn luyện là **giọng Bắc**.

Cơ chế: VieNeu clone **in-context** — ref codes được nối thẳng vào prompt ([`onnx_runtime_lite.py::_build_rows`](../../../apps/tts-service/venv/lib/python3.13/site-packages/vieneu/_v3_turbo_engine/onnx_runtime_lite.py)). Model sinh tiếp trong cùng khung âm học của bản ghi, nên chất lượng ref ảnh hưởng trực tiếp. Đặc trưng thô (F0, giới tính) ở dải thấp còn nguyên; đặc trưng tinh (accent, ở dải trung–cao) mất trước.

## Bằng chứng nhân quả

Thí nghiệm có đối chứng, chạy qua server thật:

1. Mẫu `vieneu/assets/samples/Vĩnh (nam miền Nam).wav` → clone **đúng accent Nam** ✅
2. **Chính file đó**, chỉ lọc bỏ tần số > 5.5kHz (mô phỏng độ bít của `gia_bao.wav`) → clone ra **giọng Bắc** ❌

Cùng người nói, cùng nội dung, cùng pipeline — chỉ khác phổ tần.

## Các giả thuyết đã loại trừ (đều bằng thực nghiệm, không suy đoán)

| Giả thuyết | Cách bác bỏ |
|---|---|
| Định dạng mp3 vs wav | `gia_bao.wav` là WAV thuần, vẫn lỗi |
| Luồng catalog vs luồng `/voices/clone` | Cùng file qua cả hai luồng → `ref_codes` giống hệt `(61,16)`, audio không phân biệt được |
| Bước re-encode trong `_import_catalog_entry` | Với WAV mono: byte-for-byte identical (sai số ~3e-5 do lượng tử PCM16) |
| Sai routing/ID | Log server: `synthesize voice=GIABAO_TEST` — đúng ID |
| Kết quả ngẫu nhiên | Gọi lại 3 lần, kết quả nhất quán |
| Độ dài văn bản / chunking | Text ngắn và dài đều lệch |
| Nhiễu nền (SNR) | `bao_ngoc` sạch 75dB nhưng vẫn lỗi |
| Sample rate sai | Metadata codec MOSS xác nhận 48kHz là đúng |
| Băng thông (band-limit 24k→48k) | Test trực tiếp: không cải thiện |

## Phát hiện phụ đáng chú ý

`nu-bac.wav` (Lan Anh) **bít tiếng ngang `gia_bao`** (cắt 5227Hz, >8kHz chỉ 0.1%) nhưng xưa nay "vẫn chạy tốt" — vì Lan Anh là giọng **Bắc**, trùng đúng prior mà model rơi về. Lỗi vẫn xảy ra nhưng bị che.

→ Không được dùng "nghe có vẻ ổn" làm tiêu chí nghiệm thu cho giọng Bắc.

## Số liệu quét kho catalog (44 file)

**1 đạt / 22 cảnh báo / 21 không đạt.** Chia theo nguyên nhân: 13 file bít tiếng (không cứu được bằng hậu kỳ), 8 file vang phòng (có thể khử vang).

Kho giọng vendor về cơ bản không đủ chất lượng cho clone chính xác — đây mới là gốc rễ.

## Thay đổi mã nguồn

### 1. Thêm `apps/tts-service/server/check_ref_audio.py`

Script chấm chất lượng ref trước khi clone. Ngưỡng hiệu chuẩn từ 10 file có kết quả thực tế đã biết; không đánh trượt oan file nào.

Quá trình hiệu chuẩn đã **loại bỏ 2 chỉ số ban đầu tưởng đúng**:
- *Năng lượng dải 4–8kHz*: `gia_bao` (hỏng) đạt 7.2% > `Vĩnh` (tốt) 4.5% — vách cắt rơi đúng 5.5kHz nên phần 4–5.5kHz vẫn dày
- *rolloff 95%*: bị chi phối bởi năng lượng tần thấp → giọng nam trầm thu tốt trông tệ hơn file hỏng

Chỉ số giữ lại: **tần số cắt** (tốt 10.9–12.3kHz vs bít tiếng 4.9–8.1kHz) và **tỉ lệ năng lượng >8kHz**.

**Điểm mù đã biết, ghi rõ trong docstring:** `bao_ngoc_gentle.mp3` qua mọi ngưỡng âm học nhưng vẫn lỗi (nghi do nén lossy + lối đọc thì thầm, chưa kiểm chứng). ĐẠT = "không có lỗi đã biết", không phải "chắc chắn clone đúng".

### 2. Sửa `apps/shell-electron/electron/slide/python-server.ts`

**Vấn đề dev-experience phát hiện trong lúc điều tra:** `voice-registry.json` + ref audio bị `seedUserVoiceDir()` copy sang `userData` và **chỉ seed một lần** (`if (!existsSync(...))`), nên sửa file trong repo không có tác dụng. Mất khá nhiều thời gian mới phát hiện server thật đang đọc `~/Library/Application Support/@sky-app/shell-electron/vieneu-voices/` chứ không phải file trong repo.

Sửa: khi `!app.isPackaged`, `VIENEU_REF_DIR` / `VIENEU_REGISTRY_PATH` / `VIENEU_CONFIG_PATH` trỏ thẳng vào `resources/` trong repo và **bỏ qua** `seedUserVoiceDir()`.

Bản đóng gói **giữ nguyên hành vi cũ** (ghi vào `userData`) — bắt buộc, vì `resources/` là read-only trên macOS đã ký và Windows per-machine install.

An toàn với git: `apps/shell-electron/resources/` đã nằm trong `.gitignore` (dòng 31) nên ghi runtime lúc dev không tạo diff.

> **Lưu ý version:** thay đổi này nằm trong `apps/shell-electron/electron/` nên theo `AGENTS.md` §4 thuộc **Loại 2**. Tuy nhiên hành vi bản đóng gói **không đổi một byte nào** (mọi nhánh `isPackaged` giữ nguyên giá trị cũ) — đây thuần tuý là sửa trải nghiệm dev. Chưa bump version; cần người quyết định có phát hành hay gộp vào lần release sau. Nếu bump, đề xuất **PATCH** và **`breaking: false`** vì không đụng IPC contract và không ảnh hưởng app đã cài.

### 3. Thêm `docs/services/tts-clone-giong-accent.md`

Tài liệu 2 phần: phần A giải thích cho người không chuyên (kèm sơ đồ mermaid), phần B chi tiết kỹ thuật (luồng dữ liệu, neo mã nguồn, bảng hiệu chuẩn, đánh giá engine thay thế).

## Hướng xử lý đề xuất (xếp theo hiệu quả/công sức)

1. **Mở 10 giọng preset đang ẩn** — preset dùng speaker token nhúng sẵn, không qua ref audio → miễn nhiễm. Đã test `preset-GiaBao` → đúng giọng Nam. Bẫy: `_load_or_init` chỉ thêm preset *còn thiếu*, không cập nhật cờ `hidden` của entry cũ → cần migration.
2. **Port bộ chỉ số vào `_validate_ref_audio`** để cảnh báo ngay lúc import (hạ tầng warnings đã sẵn). Đúng phần mà comment ở `engine.py:37` ghi "để giai đoạn sau".
3. **Thu lại ref** cho giọng thực sự cần.
4. **Enhancement trước encode** — khử vang cứu được 8 file; bít tiếng thì bandwidth extension chỉ "bịa" lại tần số, không đảm bảo.
5. **Đổi engine** — xem đánh giá VoxCPM trong tài liệu chính (§B8). Tóm tắt: bản có tiếng Việt nhẹ nhất là VoxCPM1.5 GGUF 582MB, nhưng RTF 4.3–5.6 (chậm 4–6× so với VieNeu) và là binary C++ nên phá khuôn mẫu installer Python hiện tại. **Khuyến nghị kiểm chứng trên `gia_bao.wav` trước khi bỏ công tích hợp.**
