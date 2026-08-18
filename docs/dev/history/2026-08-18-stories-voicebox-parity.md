# 2026-08-18 — Stories: nâng lên ngang UI/UX voicebox (Phase 4.5)

> Phase 4 (2026-08-17) đã xong bản đầu: canvas kéo-thả pixel, trim/split/duplicate/volume,
> trộn WAV. Đối chiếu trực tiếp với source thật của voicebox
> (`/Users/skyline/TEST/voicebox-main`) phát hiện thiếu khá nhiều so với bản gốc: không
> waveform, không zoom, "Nghe thử" chỉ phát file đã trộn sẵn (không có playhead sống/tua
> được), danh sách Story chưa có search/sửa/badge, không có "Regenerate" (sinh lại 1 đoạn,
> giữ nhiều bản cũ). Sonth chốt: làm ĐỦ cả 3 phần "khó" này (ưu tiên PORT trực tiếp code từ
> voicebox thay vì viết lại nếu tốn công), cộng thêm ô sinh giọng nổi ngay trong tab Story.

## Phát hiện quan trọng làm đổi thiết kế so với giả định ban đầu

Kế hoạch Phase 4 gốc giả định UI Story của voicebox là 1 canvas DAW pixel duy nhất (lý do:
"kéo 2D tự do không khớp mô hình sortable-list của dnd-kit"). Đọc thẳng source thật của
voicebox mới phát hiện **giả định đó sai** — voicebox thực ra có **2 tầng UI**:

1. `StoryContent.tsx` — list DỌC sortable kiểu "chat" (`@dnd-kit/sortable`, KHÔNG phải canvas
   pixel), dùng để thêm/xoá/sắp xếp nhanh.
2. `StoryTrackEditor.tsx` — canvas pixel THẬT (waveform, zoom, playhead, trim/split/duplicate),
   nhưng dock cố định ở ĐÁY màn hình (`fixed bottom-0`), chỉ hiện khi Story có item.

Sky-app giờ port ĐÚNG cấu trúc 2 tầng này: `StoryList` (trái) + `StoryContent` (phải, list
sortable) + `Timeline` (docked đáy, editor pixel) — thay vì 1 canvas đơn embedded như bản đầu.

## Quyết định kiến trúc

### 1. "Regenerate/Takes" gắn vào Story item, KHÔNG vào generation (khác voicebox)

Voicebox gắn version vào `generations` (bảng vĩnh viễn). Sky-app đã cố tình tách Story item
khỏi vòng đời `tts_generation_history` (nhật ký cuộn tự xoá, xem migration 021's docstring) —
item sở hữu bản audio riêng. Vì vậy version/take gắn thẳng vào **`tts_story_item`** (bảng mới
`tts_story_item_version`, migration 022) — con của story item, không phải của generation.

Thiết kế: `tts_story_item` được snapshot thêm `voice_id`/`speed`/`engine_id` lúc thêm vào Story
(đọc từ `tts_generation_history`, bảng này đã có sẵn 3 field từ migration 019) — đủ tham số
gọi lại `/synthesize`. Version rows là danh sách phẳng các "bản đã lưu" của 1 item;
`tts_story_item.active_version_id` trỏ bản đang dùng. Lần regenerate ĐẦU TIÊN của 1 item tự
lưu audio HIỆN TẠI thành version "Bản gốc" trước khi ghi đè — không bao giờ mất bản nào kể cả
bản gốc. Chuyển version chỉ TRỎ LẠI file đã có sẵn (`tts_story_item.audio_file` đổi string trỏ
tới file của version đó), không copy byte nào — cả 2 file độc lập sẵn trong thư mục Story.

**Giới hạn đã biết, KHÔNG mở rộng phạm vi để vá**: `tts_generation_history` không lưu
`effects_chain` đã áp dụng lúc sinh (migration 019 thiếu cột này). Regenerate chỉ tái tạo
đúng text+voice+speed+engine, KHÔNG áp lại hiệu ứng hậu kỳ gốc nếu có.

**Item kết quả của Tách (`split_item`) KHÔNG regenerate được** — cả 2 nửa vẫn trỏ nguyên văn
`source_text` ĐẦY ĐỦ (chỉ audio bị cắt); regenerate sẽ sinh lại CẢ câu gốc thay vì đúng nửa đó.
`split_item` tự xoá `voice_id`/`speed`/`engine_id` của cả 2 nửa để `can_regenerate` về `false`.

**KHÔNG tự đổi engine đang chạy** nếu khác `engine_id` đã snapshot lúc thêm — đổi engine giữa
chừng ảnh hưởng cả tiến trình Python (kể cả ceremony đang lên sân khấu thật), quá rủi ro cho 1
thao tác tiện lợi. Báo lỗi 400 rõ ràng, người dùng tự đổi engine trước nếu muốn.

Backend tái dùng `_run_synthesis()` (hàm CPU-bound sẵn có của route `/synthesize`) cho route
`/stories/{id}/items/{item_id}/regenerate` — không copy-paste lại logic resolve voice/effects.

### 2. Reorder chỉ trong CÙNG 1 track

List dọc sortable cho phép kéo đổi thứ tự — nhưng Story vẫn multi-track. `reorder_items()`
(mới) CHỈ tính lại `start_time_ms` tuần tự cho các item CÙNG track; kéo xuyên track (đổi track)
vẫn phải qua canvas editor (`move_item`, toạ độ tuyệt đối) — 2 API không cùng làm 1 việc theo
2 cách khác nhau. `StoryContent.tsx`'s `handleDragEnd` bỏ qua thao tác nếu 2 item khác track.

### 3. Panel "docked" dùng `absolute`, KHÔNG `fixed` như voicebox

Voicebox's `StoryTrackEditor` dùng `fixed bottom-0 left-0 right-0` (neo theo viewport) — sky-app
KHÔNG làm vậy được: module TTS Studio chạy lồng trong app shell lớn hơn, và
`docs/guides/app-css-theming.md` Rule 4 bắt buộc mọi phần tử định vị tuyệt đối phải ở lại trong
subtree `.tts-studio-root` để không mất biến theme (CSS variable chỉ định nghĩa trong scope
đó). `Timeline.tsx` dùng `absolute inset-x-0 bottom-0` bên trong wrapper `relative` của
`StoryContent.tsx` — giữ đúng cảm giác "docked" mà không thoát subtree.

### 4. Waveform đọc màu theme khác voicebox

`ClipWaveform.tsx` (port từ `StoryTrackEditor.tsx`'s component nội bộ cùng tên) đọc biến CSS
`--primary` trực tiếp, KHÔNG bọc `hsl(${value})` như voicebox — biến CSS của sky-app (xem
`styles.css`) đã LÀ 1 giá trị `oklch(...)` hoàn chỉnh, khác voicebox dùng bộ 3 số HSL trần.

### 5. Playback: 1 AudioContext dùng chung, không phải mỗi component tự mở 1 cái

`useStoryPlayback.ts` (port từ voicebox's hook cùng tên, rút gọn) gọi **1 LẦN DUY NHẤT** ở
`StoryContent.tsx`, kết quả (`play/pause/stop/seek`) truyền xuống props cho cả `Timeline`
(toolbar) lẫn từng `StoryItemCard` ("Phát từ đây") — tránh 2 `AudioContext` cùng tồn tại nếu
mỗi nơi tự gọi hook, dễ vang đúp/lệch đồng bộ. State "ý định phát" (`isPlaying`/`currentTimeMs`)
sống trong zustand store riêng (`storyPlaybackStore.ts`, tách khỏi `useTtsStudioStore` của tab
"Sinh giọng" — 2 domain state khác hẳn nhau).

### 6. Ô sinh giọng nổi — rút gọn nhiều so với voicebox nhờ tái dùng hạ tầng sẵn có

Voicebox's `FloatingGenerateBox.tsx` (~640 dòng) tự dựng cả pipeline sinh giọng từ đầu (họ
không có sẵn 1 tab "Sinh giọng" độc lập). Sky-app ĐÃ có toàn bộ pipeline đó
(`useTtsStudioStore` + `TtsPort.synthesizeBuffer`) — bản sky-app chỉ là 1 form gọn (~100 dòng)
gọi lại đúng path đó, sinh xong tự `storyPort.addItemFromHistory(...)` thẳng vào Story đang
mở. State text/voice CỐ Ý cục bộ (không dùng chung `useTtsStudioStore`'s `text`/
`selectedVoiceId`) — gõ ở ô nổi không được làm đổi nội dung đang soạn dở ở tab "Sinh giọng".

**Giới hạn**: `SynthesizeResult.historyId` hiện `undefined` trên Web adapter (chưa hỗ trợ ghi
lịch sử) — ô nổi phát hiện thiếu `historyId` thì báo lỗi rõ ràng thay vì âm thầm sinh audio
"trôi mất" không thêm được vào Story.

## Schema — migration 022

```sql
ALTER TABLE tts_story_item ADD COLUMN voice_id TEXT;
ALTER TABLE tts_story_item ADD COLUMN speed REAL;
ALTER TABLE tts_story_item ADD COLUMN engine_id TEXT;

CREATE TABLE tts_story_item_version (
  id TEXT PRIMARY KEY,
  story_item_id TEXT NOT NULL REFERENCES tts_story_item(id) ON DELETE CASCADE,
  audio_file TEXT NOT NULL, duration_ms INTEGER NOT NULL, label TEXT NOT NULL,
  created_at TEXT NOT NULL
);

ALTER TABLE tts_story_item ADD COLUMN active_version_id TEXT
  REFERENCES tts_story_item_version(id) ON DELETE SET NULL;
```

`REQUIRED_SCHEMA_VERSION` (`db.py`) bump 21 → 22.

## API mới — `main.py`

```
GET  /stories/{id}/items/{item_id}/audio        (WAV riêng 1 item — waveform + nghe thử)
GET  /stories/{id}/items/{item_id}/versions
PUT  /stories/{id}/items/{item_id}/version       { version_id }
POST /stories/{id}/items/{item_id}/regenerate
PUT  /stories/{id}/items/reorder                 { track, item_ids } (literal path, khai
                                                    TRƯỚC route {item_id}/... — tránh FastAPI
                                                    match nhầm, đúng cảnh báo Phase 4 gốc)
```

## File chính

| Nhóm | File |
|---|---|
| DB | mới `packages/app-db/src/migrations/022_tts_story_item_version.ts` |
| Backend | sửa `stories.py` (regenerate/version/reorder), `main.py` (route mới), `db.py` |
| Port | sửa `service-contracts/src/story.ts`, 2 adapter Electron/Web, `ipc.ts`/`preload.ts` |
| UI mới | `ConfirmDialog.tsx`, `DropdownMenu.tsx` (dùng chung tts-studio); `StoryFormDialog.tsx`,
`StoryList.tsx`, `StoryContent.tsx`, `StoryItemCard.tsx`, `storyPlaybackStore.ts`,
`useStoryPlayback.ts`, `ClipWaveform.tsx`, `FloatingGenerateBox.tsx` (thư mục `stories/`) |
| UI sửa | `StoriesTab.tsx` (dựng lại layout 2 tầng), `Timeline.tsx` (viết lại thành editor
docked), `TimelineItem.tsx` (thêm waveform + regenerate/version UI) |
| Dependency mới | `wavesurfer.js` (chưa dùng ở đâu khác trong monorepo); `@dnd-kit/*` (đã có
sẵn qua `tts-engine-ui`/`module-ceremony`, chỉ thêm vào `tts-studio`) |

## Kiểm chứng

22 test Python mới (regenerate/version/reorder/item-audio, mirror style test_stories.py/
test_stories_endpoint.py có sẵn) — 389/389 xanh. `pnpm typecheck` 38/38, `pnpm -w test` 30/30.
Chưa test thủ công trên app thật (Sonth tự làm): waveform hiện đúng, playhead chạy đồng bộ khi
Play, click ruler tua đúng vị trí, zoom in/out, regenerate xong dropdown "Bản khác" chọn lại
đúng bản cũ, kéo sắp xếp lại list dọc, ô sinh giọng nổi thêm đúng vào track trống cuối.
