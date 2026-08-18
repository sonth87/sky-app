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
 *  không cần dùng trực tiếp, phát/trộn qua `exportAudioUrl`. */
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

  /** URL trộn toàn bộ item thành 1 WAV (đúng pattern `getPreviewUrl`/`getHistoryAudioUrl` của
   *  TtsPort — trỏ thẳng server, client tự fetch/phát, không round-trip buffer qua IPC). */
  exportAudioUrl(storyId: string): Promise<string>;
}
