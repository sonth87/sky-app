# 2026-08-17 — Stories: timeline nhiều track ghép audio đã sinh (Phase 4)

> Tiếp nối kế hoạch port tính năng từ voicebox (Phase 0-3 đã xong: DB dùng chung, Python nối
> DB, một giọng nhiều mẫu, lịch sử sinh audio trong DB). Đây là **Phase 4**: cho phép người
> dùng xâu chuỗi nhiều lần sinh audio đã có (từ tab "Sinh giọng") thành 1 timeline nhiều
> track, chỉnh trim/volume/vị trí từng đoạn, rồi trộn ra 1 file WAV hoàn chỉnh — port từ
> voicebox's `services/stories.py`.
>
> **Sửa lại hiểu nhầm ban đầu**: Story KHÔNG phải kịch bản do LLM chia đoạn — nó là timeline
> kiểu DAW (Audacity/GarageBand đơn giản) xâu chuỗi các audio ĐÃ sinh sẵn. `services/
> stories.py` của voicebox không có lời gọi LLM nào.
>
> **2 quyết định UI chốt cùng Sonth sau khi giải thích lại khái niệm**: (1) gộp vào TTS
> Studio bằng sidebar icon dọc + tooltip, không phải app riêng trong dock — tái dùng nguyên
> mẫu `ConfigWindow.tsx` (cửa sổ "Cấu hình" gộp gần đây, tham khảo voicebox) đã dựng đúng kiểu
> nav này; (2) canvas kéo-thả pixel thật ngay từ bản đầu, không phải danh sách tự sắp xếp —
> ưu tiên trải nghiệm giống DAW thật hơn tốc độ ra bản đầu.

## Phát hiện quan trọng làm đổi thiết kế so với voicebox

`tts_generation_history` (Phase 3, migration 019) — bảng mà tưởng chừng Story items sẽ tham
chiếu tới bằng FK (như voicebox làm với `generations.id`) — **là nhật ký cuộn tự xoá**
(`history_store.py`'s `_prune()`: xoá khi vượt 5000 dòng HOẶC quá 90 ngày, kèm unlink file
WAV), khác hẳn voicebox's `generations` (bảng vĩnh viễn, chỉ mất khi người dùng chủ động
xoá). Thêm nữa: dòng nguồn `'pregen'` (nhiều nhất thực tế, 1 sự kiện có thể 500-1000+ dòng)
**cố ý không có file audio** — audio thật nằm ở `ttsPregenWavPath` phía Electron, không nhân
bản.

FK thẳng vào `tts_generation_history` sẽ tạo tham chiếu treo ngay khi dòng bị prune, và không
dùng được với nguồn `pregen`. **Quyết định**: `tts_story_item.audio_file` là **bản copy
riêng** của Story, không FK tới history. "Thêm vào Story" đọc audio qua
`HistoryStore.get_audio_path()` + text/voice_label/duration snapshot từ dòng history, copy
WAV sang thư mục riêng của Story (`VIENEU_STORIES_DIR/<story_id>/`) — từ đó độc lập hoàn toàn
với vòng đời prune của history. Dòng history không có audio đơn giản không thêm được vào
Story, báo lỗi 400 rõ ràng ngay tại API (không phải 500 — đây là lỗi người dùng chọn sai, có
thể tránh bằng cách lọc trước ở picker).

**Hệ quả của việc "item sở hữu file riêng"**: khác voicebox (2 story item có thể cùng trỏ 1
`audio_file` do `generation` sở hữu vĩnh viễn), `split_item`/`duplicate_item` ở đây phải
**copy thêm 1 bản file độc lập** — xoá 1 item không bao giờ được phép ảnh hưởng item khác. Tốn
đĩa hơn (nhân đôi dung lượng đoạn bị tách/nhân bản) nhưng đổi lại mỗi row luôn tự chủ vòng đời
file của nó, không cần đếm tham chiếu.

## Schema — migration 021

`tts_story` (id, name, description, created_at, updated_at) + `tts_story_item` (id, story_id
FK CASCADE, audio_file, source_text/voice_label snapshot, duration_ms, start_time_ms, track,
trim_start_ms, trim_end_ms, volume). Chủ ghi duy nhất: Python (`stories.py`), đúng AGENTS.md
§2.1. `db.py`'s `REQUIRED_SCHEMA_VERSION` bump 20 → 21 **cùng commit** với migration — đúng
bài học đã trả giá ở lần 17→19 (Phase 2, bỏ sót bump khi `tts_voice_sample` ra đời).

Verify migration 2 chiều: chạy qua driver sql.js xác nhận CASCADE delete hoạt động đúng (lúc
đầu test dùng nhầm `new SqlJsExecutor(db)` bỏ qua factory `create()` — nơi thật sự set
`PRAGMA foreign_keys=ON` — cho kết quả giả "CASCADE không chạy"; sửa lại gọi đúng
`SqlJsExecutor.create()` thì CASCADE đúng như thiết kế).

## Backend — `apps/tts-service/server/stories.py`

Port từ voicebox's `services/stories.py`, những điểm khác voicebox ngoài phần audio-ownership
đã nói ở trên:

- **`move_item` nhận toạ độ TUYỆT ĐỐI** (`start_time_ms`, `track`) do client (canvas kéo-thả)
  tự tính từ vị trí con trỏ rồi gọi 1 lần lúc thả — khác voicebox's `move_story_item` (chỉ đổi
  track, tự đặt cuối track đích). Vì UI đã chốt là kéo-thả tự do 2D, không phải danh sách tự
  sắp xếp.
- Không có `reorder_story_items` — không cần khi vị trí đã tự do tuyệt đối.
- `add_item_from_history` vẫn giữ logic "nối tiếp + cách 200ms" của voicebox
  (`add_item_to_story`) làm vị trí MẶC ĐỊNH khi thêm mới (trước khi người dùng kéo đi đâu đó).
- `export_audio()` port gần nguyên văn `export_story_audio` (~60 dòng): buffer zeros theo
  tổng độ dài → mỗi item cắt theo trim, nhân volume, `final[start:end] += audio` theo offset
  mẫu → chỉ peak-normalize khi VƯỢT 1.0. Trả kèm `(audio, sample_rate)` — theo đúng convention
  mọi engine trong repo dùng, thay vì để caller import hằng số riêng của module (sửa lại giữa
  chừng, xem "Bug tự phát hiện" bên dưới).

## API — `main.py`, 13 route `/stories/*`

CRUD Story + item (add/delete/move/trim/volume/split/duplicate) + export-audio. Mọi route
trả **503** khi `_stories is None` (DB chưa sẵn sàng) — khác `/history` (rơi về mảng rỗng êm):
Story là tính năng CHỦ ĐỘNG tạo/sửa dữ liệu, im lặng trả "danh sách rỗng" sẽ khiến người dùng
tưởng Story của họ biến mất thay vì hiểu đúng là tính năng chưa sẵn sàng.

### Bug tự phát hiện — `/stories/{id}/export-audio` trả sai định dạng lúc mới viết

Route ban đầu trả PCM thô + header `X-Sample-Rate` (đúng khuôn `/synthesize`). Nhưng
`StoryPort.exportAudioUrl` tài liệu rõ "đúng pattern `getPreviewUrl`/`getHistoryAudioUrl`" —
cả 2 cái đó serve file phát được THẲNG qua `<audio src>`/`playUrlAudio` (`new Audio(url)`,
trình duyệt tự nhận dạng qua RIFF header). PCM trần không có header thì `new Audio(url)`
không phát được gì. Phát hiện lúc viết `Timeline.tsx`'s nút "Nghe thử" (dùng `playUrlAudio`,
không phải `playPcmAudio`) — sửa route đóng gói WAV thật bằng `wave.open(io.BytesIO(), 'wb')`
trước khi trả. Thêm test HTTP-layer riêng xác nhận `content[:4] == b"RIFF"` và
`soundfile.read()` đọc thẳng được từ response bytes — không chỉ tin route trả đúng
Content-Type suông.

## Port + IPC — isomorphic (Electron + Web)

`StoryPort` (service-contracts) mới, camelCase, khai báo **throw lỗi** (không trả
`{ok,error}` như vài API cũ) — để canvas kéo-thả bắt lỗi bằng try/catch đơn giản, có thể
rollback UI lạc quan nếu cần sau này. `get`/`update`/`moveItem`/`setItemVolume` là ngoại lệ:
trả `T | null` khi 404 (tài nguyên đã bị xoá ở nơi khác, vd tab khác vừa xoá) — lỗi KHÁC 404
(mạng đứt, 500 thật) vẫn throw.

Electron: `ipc.ts`'s 13 kênh `story:*`, dùng chung 1 helper `storyFetch()` trả envelope
`{ok:true,data}|{ok:false,error,status}` — gom vì 13 kênh gần giống hệt nhau (khác
path/method/body), khác các khối `tts:history-*` phía trên (mỗi kênh hình dạng response khác
nhau nhiều nên không đáng gom). `status` trong envelope cho adapter phân biệt 404 (trả `null`)
với lỗi thật (throw) — ban đầu định string-match `"HTTP 404"` trong message lỗi, đổi sang
field số tường minh vì giòn hơn hẳn.

Web: `platform-web/src/adapters/story.ts` gọi thẳng `${ttsBaseUrl}/stories/*` — **dùng chung
`ttsBaseUrl` với TTS/History, KHÔNG phải `dataBaseUrl`** (khác `EffectPresetPort`, sống ở
app-db/data-service). Đăng ký unconditional giống `tts`/`stt` port, không điều kiện theo
`dataServiceAvailable` như `effectPreset`.

## UI — tab "Câu chuyện" trong TTS Studio

`TtsStudioApp.tsx` đổi từ layout 1 trang cố định (`grid grid-cols-[280px_1fr]`) sang có sidebar
icon dọc (`w-14`, chỉ hiện khi `storyPort` sẵn sàng — 1 tab duy nhất thì rail chỉ tốn chỗ mà
không phân biệt được gì). **Không sửa bất kỳ dòng nào bên trong khối grid cũ** — chỉ bọc nó
thành nhánh `activeTab === 'generate'`, giữ nguyên 100% hành vi tab "Sinh giọng" đã có.

`modules/tts-studio/src/components/stories/` (mới):

- **`StoriesTab.tsx`** — danh sách Story bên trái (tạo/chọn/xoá) + `Timeline` bên phải.
- **`Timeline.tsx`** — canvas: nền track (hàng ngang trang trí), items định vị `absolute`
  trong 1 container `relative` DUY NHẤT (không lồng container riêng mỗi track — vì item cần
  kéo tự do GIỮA các track, `top = track * TRACK_HEIGHT` tính trực tiếp trong style thay vì
  DOM nesting theo track). Số track hiển thị = `max(track hiện có) + 2` (luôn chừa 1 hàng
  trống để kéo item vào tạo track mới).
- **`TimelineItem.tsx`** — phần phức tạp nhất: kéo-thả tự viết bằng Pointer Events (KHÔNG
  dùng `@dnd-kit` — kéo tự do 2D không khớp mô hình sortable-list của thư viện đó, khác Effects
  tab đã dùng dnd-kit cho danh sách 1D). 3 kiểu kéo: thân item (đổi `startTimeMs`+`track`),
  handle trái (đổi `trimStartMs`, ĐỒNG THỜI dịch `startTimeMs` để mép PHẢI đứng yên — quy ước
  chuẩn của editor audio), handle phải (chỉ đổi `trimEndMs`, mép trái đứng yên). Handle
  `stopPropagation()` để không kích hoạt kéo-di-chuyển của box cha. Phân biệt "kéo" với "bấm
  chọn" bằng ngưỡng khoảng cách di chuyển (`DRAG_THRESHOLD_PX = 3`) — dưới ngưỡng thì
  `pointerup` được hiểu là chọn item, không commit thay đổi vị trí.
- **`AddFromHistoryPicker.tsx`** — danh sách `listHistory({source:'tts_studio'})` lọc
  `hasAudio`, có nghe thử trước khi chọn.

`Timeline`'s `handleCommitChange` quyết định gọi `moveItem`/`trimItem` (có thể CẢ HAI cùng
lúc cho thao tác kéo handle trái) dựa trên field nào đổi — logic "gọi API nào" tập trung ở
đây, `TimelineItem` chỉ báo "cái gì đã đổi", không tự quyết định gọi port nào.

## Kiểm chứng

**Python**: 360/360 pytest xanh. Mới: `test_stories.py` (31 test, StoryStore trực tiếp —
CRUD, `_next_start_time_ms` cộng dồn đúng 200ms qua trim, `move_item` toạ độ tuyệt đối,
`split_item`/`duplicate_item` file độc lập không ảnh hưởng nhau khi xoá, mixdown offset/cộng
dồn track chồng nhau/volume/trim/peak-normalize-chỉ-khi-vượt-1/bỏ-qua-file-mất-tích) +
`test_stories_endpoint.py` (17 test, qua `TestClient` thật — mã lỗi HTTP đúng cho mọi ca lỗi,
và xác nhận WAV header thật của export-audio, không chỉ gọi hàm Python trực tiếp).

**TypeScript**: `pnpm typecheck` 38/38, `pnpm -w test` 30/30 — không hồi quy gì ở các package
khác dù đổi cấu trúc `TtsStudioApp.tsx`.

**Chưa kiểm bằng Electron/Web thật** (không có công cụ mở app trong phiên code) — cần Sonth
tự làm: mở `dev:app`, sinh vài audio ở tab "Sinh giọng", chuyển tab "Câu chuyện", tạo Story,
thêm 2-3 đoạn vào 2 track khác nhau, thử cả 3 kiểu kéo (di chuyển, trim trái, trim phải — đặc
biệt xác nhận trim trái giữ đúng mép phải đứng yên), tách 1 đoạn làm đôi, nhân bản, xoá, Nghe
thử + Trộn & Tải — nghe file kết quả đúng thứ tự/vị trí/không lệch âm lượng. Xác nhận Web (dev
server) cũng thấy tab "Câu chuyện" và các thao tác hoạt động qua `fetch` trực tiếp.

## Còn phải làm

- **Zoom timeline** — v1 cố định `PX_PER_SEC = 60`, Story dài (vài phút) sẽ phải cuộn ngang
  nhiều. Thêm control zoom nếu thực tế dùng thấy cần.
- **Kéo-thả từ AddFromHistoryPicker thẳng vào track cụ thể** — hiện luôn thêm vào track trống
  cuối cùng rồi người dùng tự kéo đi; kéo-thả trực tiếp (drag từ picker vào 1 track) tiện hơn
  nhưng phức tạp thêm (drag giữa 2 component khác nhau), để dành nếu cần.
- **Waveform hiển thị trong item** — hiện chỉ có text/tên giọng, không có dạng sóng trực quan.
  Đè lên nhau (Phase 5, audio channels) và Phase 6 (STT+LLM) chưa bắt đầu — xem
  `~/.claude/plans/h-y-l-n-k-ho-ch-parsed-pancake.md`.
