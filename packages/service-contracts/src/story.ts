/**
 * StoryPort — timeline nhiều track xâu chuỗi các lần sinh audio ĐÃ CÓ (Phase 4, xem
 * apps/tts-service/server/stories.py). Story KHÔNG phải kịch bản do LLM chia đoạn — nó là
 * timeline kiểu DAW: kéo-thả audio đã sinh sẵn (từ lịch sử — `TtsPort.listHistory`) vào
 * track, trim/chỉnh volume/vị trí, rồi trộn ra 1 file WAV hoàn chỉnh.
 *
 * Isomorphic (Electron IPC + Web fetch trực tiếp, đúng AGENTS.md §2 "Isomorphic") — server
 * Python bật CORS nên Web gọi thẳng HTTP được, giống `TtsPort`'s `fetchSynthesize`.
 */

export interface Story {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 1 đoạn audio đặt trên timeline. `audioFile` là tên file nội bộ (debug/đối chiếu) — UI
 *  không cần dùng trực tiếp, phát/trộn qua `exportAudioUrl`/`itemAudioUrl`. */
export interface StoryItem {
  id: string;
  storyId: string;
  audioFile: string;
  sourceText: string | null;
  voiceLabel: string | null;
  durationMs: number;
  startTimeMs: number;
  track: number;
  trimStartMs: number;
  trimEndMs: number;
  volume: number;
  createdAt: string;
  /** `null` = item thêm trước khi có tính năng Regenerate, hoặc là kết quả của Tách (xem
   *  `canRegenerate`) — không đủ tham số gọi lại `/synthesize`. */
  voiceId: string | null;
  engineId: string | null;
  /** = `voiceId !== null`, server tự tính — UI ẩn hẳn nút Regenerate khi false thay vì hiện
   *  disabled không rõ lý do. */
  canRegenerate: boolean;
  /** Version đang dùng trong số các bản đã lưu (xem `StoryItemVersion`) — `null` nếu chưa
   *  regenerate lần nào (item đang dùng bản audio "gốc" của chính nó). */
  activeVersionId: string | null;
}

/** 1 bản audio đã lưu của 1 item — tạo ra khi Regenerate (bản MỚI) hoặc lần regenerate ĐẦU
 *  TIÊN tự lưu bản cũ thành "Bản gốc" trước khi ghi đè (xem stories.py's regenerate_item). */
export interface StoryItemVersion {
  id: string;
  storyItemId: string;
  durationMs: number;
  label: string;
  createdAt: string;
}

export interface StoryWithItems extends Story {
  items: StoryItem[];
}

export interface StoryPort {
  list(): Promise<Story[]>;
  create(name: string, description?: string): Promise<Story>;
  /** `null` nếu không tồn tại — KHÔNG throw, để UI phân biệt "chưa tải xong" (throw) với
   *  "đã bị xoá ở nơi khác" (null). */
  get(storyId: string): Promise<StoryWithItems | null>;
  update(storyId: string, patch: { name?: string; description?: string }): Promise<Story | null>;
  delete(storyId: string): Promise<boolean>;

  /** Copy audio từ 1 dòng lịch sử sinh audio (`TtsPort.listHistory`, chỉ dòng có
   *  `hasAudio: true`) vào Story, đặt cuối track (nối tiếp + cách 200ms). Throw nếu dòng lịch
   *  sử không có audio (nguồn 'pregen' hoặc dòng lỗi) — UI nên lọc trước ở picker, lỗi này là
   *  lưới an toàn cuối, không phải luồng chính. */
  addItemFromHistory(storyId: string, historyEntryId: string, track?: number): Promise<StoryItem>;
  deleteItem(storyId: string, itemId: string): Promise<boolean>;
  /** Vị trí TUYỆT ĐỐI — canvas kéo-thả tự tính từ toạ độ con trỏ rồi gọi 1 lần lúc thả, không
   *  gọi mỗi pixel di chuyển. */
  moveItem(storyId: string, itemId: string, startTimeMs: number, track: number): Promise<StoryItem | null>;
  /** Throw nếu `trimStartMs + trimEndMs >= durationMs` (không còn gì để nghe). */
  trimItem(storyId: string, itemId: string, trimStartMs: number, trimEndMs: number): Promise<StoryItem>;
  setItemVolume(storyId: string, itemId: string, volume: number): Promise<StoryItem | null>;
  /** Tách 1 item tại `splitTimeMs` (tính từ đầu phần ĐANG NGHE ĐƯỢC, sau trim_start) thành 2
   *  item liên tiếp, KHÔNG chia sẻ file audio — xoá 1 nửa không ảnh hưởng nửa kia. */
  splitItem(storyId: string, itemId: string, splitTimeMs: number): Promise<{ left: StoryItem; right: StoryItem }>;
  duplicateItem(storyId: string, itemId: string): Promise<StoryItem>;
  /** Sắp lại thứ tự item TRONG CÙNG 1 track (danh sách dọc sortable) — tính lại `startTimeMs`
   *  tuần tự phía server. `orderedItemIds` phải khớp ĐÚNG các item hiện có trên track đó, throw
   *  nếu thiếu/thừa. Kéo-thả xuyên track vẫn dùng `moveItem` (canvas), không qua đây. */
  reorderItems(storyId: string, track: number, orderedItemIds: string[]): Promise<StoryItem[]>;

  /** URL trộn toàn bộ item thành 1 WAV (đúng pattern `getPreviewUrl`/`getHistoryAudioUrl` của
   *  TtsPort — trỏ thẳng server, client tự fetch/phát, không round-trip buffer qua IPC). */
  exportAudioUrl(storyId: string): Promise<string>;
  /** URL audio RIÊNG của 1 item (không trộn) — dùng cho waveform + nghe thử từng đoạn, cùng
   *  pattern `exportAudioUrl`. */
  itemAudioUrl(storyId: string, itemId: string): Promise<string>;

  /** Sinh lại audio cho item bằng đúng voice/speed/văn bản đã snapshot lúc thêm vào Story —
   *  lưu thành 1 version mới, KHÔNG mất bản cũ (xem `StoryItemVersion`). Throw nếu
   *  `canRegenerate === false` hoặc engine hiện tại khác lúc snapshot — UI nên tự ẩn nút thay
   *  vì dựa vào throw này, đây là lưới an toàn cuối. */
  regenerateItem(storyId: string, itemId: string): Promise<StoryItem>;
  listItemVersions(storyId: string, itemId: string): Promise<StoryItemVersion[]>;
  /** Chuyển item về dùng 1 version đã lưu (kể cả "Bản gốc"). Reset trim vì duration bản khác
   *  thường lệch bản đang dùng. */
  setItemVersion(storyId: string, itemId: string, versionId: string): Promise<StoryItem>;
}
