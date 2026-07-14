# tts-studio

## Mục đích

App độc lập để tổng hợp giọng nói: chọn giọng đọc, chỉnh tốc độ, nhập văn bản, tạo audio, nghe/tải file WAV. Tách từ TTS UI của Ceremony (Slide) — dùng chung `apps/tts-service` nhưng nghiệp vụ hoàn toàn tách biệt (không có studentCode/pregen/ceremony logic).

## Dữ liệu chính

- `StudioVoice { id, name, gender? }` — map từ `TtsPort.listVoices()`.
- `HistoryEntry { id, text, voiceId, voiceLabel, speed, sampleRate, createdAt, audioBlob, durationMs }` — lưu trong IndexedDB (database `tts-studio`, object store `history`), tối đa 30 bản ghi, tự xoá bản cũ nhất khi vượt.

## Capabilities cần

- `tts` — bắt buộc (`requiredCapabilities: ['tts']`). Nếu môi trường không cấp (`platform.services.get('tts')` trả `undefined`), app hiện thông báo "Dịch vụ TTS không khả dụng" thay vì crash.

## Services dùng

- `TtsPort` (`packages/service-contracts/src/tts.ts`) qua `platform.services.get<TtsPort>('tts')`:
  - `listVoices()` — chỉ trả 6 cloned voices mặc định của `apps/tts-service` (`NF`, `NF2`, `SF`, `NM1`, `SM`, `ADAM`); 10 preset voices bị `GET /voices` ẩn mặc định (`hidden: true`), không hiện trong app này.
  - `getPreviewUrl(voiceId)` — URL nghe thử giọng trước khi chọn.
  - `synthesizeBuffer(text, opts)` — sinh audio, trả `{buffer, sampleRate}` thô (không tự phát) để lưu lịch sử/tải file. Khác `speak()` (tự phát, trả `void`) mà Ceremony dùng.

## Entitlements

Miễn phí (`entitlement: undefined`) — không gate license ở v1.

## Đặc thù

- **Lịch sử lưu local, không đồng bộ**: IndexedDB trong trình duyệt/app, mất khi clear cache hoặc đổi máy. Muốn giữ lâu dài, dùng nút tải file WAV.
- **Không có preset voices**: chỉ 6 giọng cloned mặc định. Muốn thêm preset cần gọi `PUT /voices/{id}` để unhide phía server (thay đổi state dùng chung với Ceremony) — chưa làm ở v1, cần đánh giá chất lượng từng giọng trước khi bật.
- **Điện thoại IPC riêng (Electron)**: dùng channel `tts-studio:synthesize` (`apps/shell-electron/electron/slide/tts-studio.ts` + `ipc.ts`), KHÔNG dùng chung `tts:speak` của Ceremony (channel đó gánh theo pregen cache theo studentCode, in-memory cache, activity log — không phù hợp).
- **Không giới hạn độ dài text**: chỉ hiện số ký tự đã gõ; server tự cắt qua `max_new_frames` (trần ~64s audio).
