# 2026-08-12 — Một giọng nhiều mẫu audio (Phase 2)

> Tiếp theo [Phase 1 — Python nối vào DB dùng chung](./2026-08-12-python-noi-vao-db-dung-chung.md).
> Port tính năng có giá trị cao nhất trong danh sách đã khảo sát từ voicebox (app TTS tham
> chiếu): một giọng clone giờ ghép được NHIỀU file mẫu, không còn giới hạn 1 file ~4 giây
> cho model rất ít ngữ cảnh về giọng.

## Thiết kế dữ liệu: tách hẳn, không giữ 2 nơi

Bảng mới `tts_voice_sample` (migration 018) là **nguồn sự thật DUY NHẤT** cho sample của
MỌI voice, kể cả voice chỉ có 1 sample — không giữ "sample đầu tiên đặc biệt" trên
`tts_voice`. Cột `ref_file`/`ref_text` cũ (migration 017) **giữ nguyên không xoá** nhưng
trở thành di sản thuần tuý: migration backfill 1 lần rồi Python không đọc/ghi chúng nữa.

Lý do chọn tách hẳn thay vì "giữ sample đầu tại chỗ cũ, sample bổ sung ở bảng mới": cách đó
tạo ra 2 nguồn có thể LỆCH NHAU (sửa transcript qua API mới không đụng cột cũ, ngược lại).
Tách hẳn thì `list_samples()` luôn là một nguồn, `get_voice()`/`list_voices()` không còn lộ
`ref_file`/`ref_text` ra API công khai nữa ở CẢ HAI kho lưu trữ (SQL và JSON) — đây là thay
đổi hình dạng có chủ ý, không phải sơ suất.

`ON DELETE CASCADE` — xoá voice tự xoá sample theo. Viết migration này lộ ra
**`SqlJsExecutor` (driver web) chưa từng set `PRAGMA foreign_keys=ON`**, dù
`BetterSqlite3Executor` (Electron) đã có từ trước — nghĩa là mọi ràng buộc khoá ngoại
trong toàn bộ 18 bảng đã LẶNG LẼ không có tác dụng gì khi chạy qua web. Đã sửa cùng lúc
(`drivers/sql-js-executor.ts`), ảnh hưởng ngược tới toàn schema chứ không riêng bảng mới.

## Thuật toán ghép: chuẩn hoá 2 lần có chủ đích

Port `combine_voice_prompts` (voicebox `backend/backends/base.py:203-231`) vào
`audio_dsp.py`'s `combine_voice_samples`, tái dùng `rms_normalize` đã có sẵn từ bản sửa
0.7.0 (khớp chính xác `normalize_audio` của voicebox). Thuật toán: chuẩn hoá TỪNG clip →
nối → chuẩn hoá LẠI bản đã nối.

Đã đo thực nghiệm để xác nhận chuẩn hoá 2 lần thật sự cần thiết, không phải thừa: ghép 1
clip biên độ 0.9 với 1 clip biên độ 0.1, đo RMS 2 nửa của bản ghép.

| Cách làm | Chênh lệch RMS 2 nửa |
|---|---|
| Chuẩn hoá từng clip trước, nối, chuẩn hoá lại (thuật toán đã port) | **0.0000** |
| Chỉ nối rồi chuẩn hoá 1 lần | 0.1249 |

Không san bằng trước thì clip to áp đảo phép đo RMS của cả bản ghép, clip nhỏ gần như biến
mất trong bản mix.

## `_resolve_voice_ref` — điểm nối, có cache

1 sample → dùng thẳng, không tốn gì. Nhiều sample → ghép qua `combine_voice_samples`,
**cache ra file** thay vì ghép lại mỗi lần synthesize. Khoá cache: `(voice_id, hash sample
id, tần số engine)`.

Hai chi tiết cache dễ bỏ sót, cả hai đều được viết test riêng để chốt hành vi:
- **Hash đổi khi thêm/xoá sample** — danh sách sample thay đổi thì hash thay đổi, cache cũ
  tự động không còn được dùng (không cần code dọn dẹp chủ động).
- **Tần số nằm trong tên file cache** — đổi engine (Qwen 24kHz ↔ VieNeu 48kHz) không được
  dùng nhầm bản ghép của engine kia, vì `combine_voice_samples` resample theo engine ĐANG
  CHẠY lúc ghép. Dùng nhầm sẽ cho audio phát nhanh/chậm gấp đôi mà không có lỗi nào báo.

## `set_ref_text` đổi ý nghĩa: từ voice sang sample

Sau Phase 2, transcript về bản chất là thuộc tính của TỪNG SAMPLE. `set_ref_text(voice_id,
text)` vẫn nhận `voice_id` (không đổi API, vì UI Phase 1 chỉ có 1 ô transcript/voice) nhưng
giờ sửa **sample đầu tiên** — hành vi khớp thực tế: voice chỉ có 1 sample (đa số) thì đây
chính là sample đó, y hệt trước Phase 2.

## Bug thật phát hiện khi refactor: transcript catalog ghi đè transcript người dùng

`_import_catalog_entry`'s guard idempotent kiểm "voice đã có transcript chưa" bằng
`existing.get("ref_text")` — sau khi `get_voice()` đổi hình dạng (không còn lộ field đó),
điều kiện này **luôn đúng theo hướng sai**: coi mọi voice là "chưa có transcript", nên
transcript catalog gốc sẽ **âm thầm ghi đè** transcript người dùng đã tự sửa qua UI, mỗi
lần app khởi động lại. Sửa bằng cách kiểm qua `list_samples(existing["id"])[0]` thay vì đọc
field đã không còn tồn tại.

Không phải lỗi tưởng tượng — phát hiện được chính vì có nghi ngờ và grep lại toàn bộ chỗ
đọc `ref_file`/`ref_text` trực tiếp trong `main.py` sau khi đổi hình dạng API, thay vì tin
suông rằng "chỉ 2 chỗ tôi đã sửa là đủ".

## `/voices/clone` — nhiều file, encode lười

Đổi từ `file: UploadFile` sang `files: list[UploadFile]` + `ref_texts: list[str]` (cùng số
lượng, cùng thứ tự — multipart cho phép field trùng tên). Sample đầu tạo voice qua
`add_cloned()`, các sample sau gọi `add_sample()`.

**Khác hành vi cũ**: trước đây encode NGAY lúc clone (1 file, rẻ). Giờ để LƯỜI — encode xảy
ra ở lần synthesize đầu tiên (`_resolve_voice_ref` gọi khi cache rỗng). Với >1 file, ghép
trước rồi mới encode được, tốn hơn hẳn — không đáng chặn HTTP request chờ việc đó.

Thêm 3 endpoint quản lý sample cho voice ĐÃ CÓ: `GET/POST /voices/{id}/samples`,
`DELETE /voices/{id}/samples/{sample_id}` (từ chối nếu là sample CUỐI CÙNG — voice phải có
≥1 sample để còn dùng được).

## Kiểm chứng

**199 test Python** (thêm 46 so với cuối Phase 1: `test_combine_voice_samples.py` 4,
`test_resolve_voice_ref.py` 7, `test_clone_endpoint.py` 14 qua `TestClient`, cộng test mới
trong `test_voice_registry_sqlite.py`/`test_voice_registry_json.py` cho `list_samples`/
`add_sample`/`delete_sample`).

**File test riêng cho `VoiceRegistryJson` — chưa từng tồn tại trước Phase 2**, dù class này
đã có từ đầu dự án. Bổ sung `test_voice_registry_json.py` (26 test) nhân dịp sửa nó, vì các
thay đổi ở đây (ẩn `ref_file`/`ref_text` khỏi output, thêm 3 method mới) đủ lớn để đáng có
lưới an toàn riêng, không chỉ dựa vào việc test gián tiếp qua nơi khác.

**`TestClient` không dùng context manager** — `with TestClient(app)` trigger `lifespan()`
THẬT (nạp engine VieNeu ONNX thật, ~50s, rồi ghi đè mọi monkeypatch bằng `global`). Xác
nhận qua thực nghiệm: không dùng `with` thì `lifespan()` không chạy, request vẫn phục vụ
bình thường với state tự set bằng tay. 14 test HTTP chạy trong 0.33s thay vì hàng chục
phút nếu mỗi test đều khởi động engine thật.

**Test bắt được 1 lỗi có sẵn trong tài liệu test** (không phải lỗi thật): `WAV_HEADER`
dùng ở nhiều nơi trong repo chỉ 16 byte — đủ cho test hàm nội bộ (không check độ dài), thiếu
cho test qua endpoint HTTP thật (endpoint kiểm `len(content) < 44`, kích thước header WAV
chuẩn). Đệm thêm cho `test_clone_endpoint.py`'s fixture.

`pnpm typecheck` 35/35. `pnpm -w test` — 1 lỗi timing `module-tts-studio` đỏ **từ trước**,
xác nhận không liên quan qua đối chiếu tên test.

## Còn phải làm

- **Chưa kiểm bằng Electron + Python thật** với file audio thật (nghe được sự khác biệt
  chất lượng giữa clone 1 mẫu và nhiều mẫu). Toàn bộ kiểm chứng ở trên là test tự động với
  audio tổng hợp (sine wave) — đủ để chốt đúng thuật toán/luồng dữ liệu, chưa đủ để nghe
  chất lượng thật.
- **UI thêm/xoá sample cho voice ĐÃ CÓ** (nút "+" trong danh sách giọng, dùng
  `addVoiceSample`/`deleteVoiceSample`/`listVoiceSamples` đã có ở tầng port) — chưa làm ở
  Phase này, `VoiceCloneModal` chỉ hỗ trợ multi-sample lúc TẠO MỚI. Sửa giọng đã có vẫn chỉ
  sửa được transcript của sample đầu (qua `updateVoiceRefText` cũ).
- Phase 3 (lịch sử sinh audio trong DB) là bước tiếp theo trong kế hoạch.
