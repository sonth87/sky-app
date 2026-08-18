import type { StoryPort, Story, StoryItem, StoryItemVersion, StoryWithItems } from '@sky-app/service-contracts';
import type { TtsStory, TtsStoryItem, TtsStoryItemVersion, TtsStoryWithItems, StoryIpcResult } from '@sky-app/slide-shared';
import '../bridge-types.js';

function toStory(s: TtsStory): Story {
  return {
    id: s.id, name: s.name, description: s.description,
    createdAt: s.created_at, updatedAt: s.updated_at,
  };
}

function toStoryItem(i: TtsStoryItem): StoryItem {
  return {
    id: i.id, storyId: i.story_id, audioFile: i.audio_file,
    sourceText: i.source_text, voiceLabel: i.voice_label, durationMs: i.duration_ms,
    startTimeMs: i.start_time_ms, track: i.track,
    trimStartMs: i.trim_start_ms, trimEndMs: i.trim_end_ms,
    volume: i.volume, createdAt: i.created_at,
    voiceId: i.voice_id, engineId: i.engine_id, canRegenerate: i.can_regenerate,
    activeVersionId: i.active_version_id,
  };
}

function toStoryItemVersion(v: TtsStoryItemVersion): StoryItemVersion {
  return {
    id: v.id, storyItemId: v.story_item_id, durationMs: v.duration_ms,
    label: v.label, createdAt: v.created_at,
  };
}

function toStoryWithItems(s: TtsStoryWithItems): StoryWithItems {
  return { ...toStory(s), items: s.items.map(toStoryItem) };
}

/** Unwrap envelope `{ok:true,data}|{ok:false,error}` (xem ipc.ts's `storyFetch`) thành giá
 *  trị thẳng hoặc throw — `StoryPort` (service-contracts) khai báo throw, không trả `{ok,error}`
 *  như các API cũ (`deleteVoice`...), để canvas kéo-thả bắt lỗi bằng try/catch đơn giản. */
function unwrap<T>(result: StoryIpcResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

/** Như `unwrap`, nhưng 404 (tài nguyên đã bị xoá ở nơi khác, vd tab khác vừa xoá Story) trả
 *  `null` thay vì throw — khớp `StoryPort`'s hợp đồng `T | null` cho get/update/moveItem/
 *  setItemVolume. Lỗi KHÁC 404 (mạng đứt, 500 thật) vẫn throw — không im lặng nuốt mọi lỗi
 *  thành null, chỉ đúng 1 tình huống có ý nghĩa "không tồn tại" mới null hoá. */
function unwrapOrNull<T>(result: StoryIpcResult<T>): T | null {
  if (!result.ok) {
    if (result.status === 404) return null;
    throw new Error(result.error);
  }
  return result.data;
}

/**
 * Electron StoryPort — routes to main process (apps/shell-electron/electron/slide/ipc.ts's
 * story:* channels → HTTP tới Python's /stories/*). Đúng khuôn `listHistory`/
 * `getHistoryAudioUrl` của TtsPort (packages/platform-electron/src/adapters/tts.ts) — Story
 * dùng CHUNG server Python với TTS/History, không phải app-db.
 */
export function createElectronStoryPort(): StoryPort {
  return {
    async list() {
      return unwrap(await window.slide.storyList()).map(toStory);
    },
    async create(name, description) {
      return toStory(unwrap(await window.slide.storyCreate(name, description)));
    },
    async get(storyId) {
      const story = unwrapOrNull(await window.slide.storyGet(storyId));
      return story ? toStoryWithItems(story) : null;
    },
    async update(storyId, patch) {
      const story = unwrapOrNull(await window.slide.storyUpdate(storyId, patch));
      return story ? toStory(story) : null;
    },
    async delete(storyId) {
      const result = await window.slide.storyDelete(storyId);
      return result.ok ? result.data.ok : false;
    },
    async addItemFromHistory(storyId, historyEntryId, track) {
      return toStoryItem(unwrap(await window.slide.storyAddItem(storyId, historyEntryId, track)));
    },
    async deleteItem(storyId, itemId) {
      const result = await window.slide.storyDeleteItem(storyId, itemId);
      return result.ok ? result.data.ok : false;
    },
    async moveItem(storyId, itemId, startTimeMs, track) {
      const item = unwrapOrNull(await window.slide.storyMoveItem(storyId, itemId, startTimeMs, track));
      return item ? toStoryItem(item) : null;
    },
    async trimItem(storyId, itemId, trimStartMs, trimEndMs) {
      return toStoryItem(unwrap(await window.slide.storyTrimItem(storyId, itemId, trimStartMs, trimEndMs)));
    },
    async setItemVolume(storyId, itemId, volume) {
      const item = unwrapOrNull(await window.slide.storySetItemVolume(storyId, itemId, volume));
      return item ? toStoryItem(item) : null;
    },
    async splitItem(storyId, itemId, splitTimeMs) {
      const { left, right } = unwrap(await window.slide.storySplitItem(storyId, itemId, splitTimeMs));
      return { left: toStoryItem(left), right: toStoryItem(right) };
    },
    async duplicateItem(storyId, itemId) {
      return toStoryItem(unwrap(await window.slide.storyDuplicateItem(storyId, itemId)));
    },
    async reorderItems(storyId, track, orderedItemIds) {
      return unwrap(await window.slide.storyReorderItems(storyId, track, orderedItemIds)).map(toStoryItem);
    },
    async exportAudioUrl(storyId) {
      return window.slide.storyExportAudioUrl(storyId);
    },
    async itemAudioUrl(storyId, itemId) {
      return window.slide.storyItemAudioUrl(storyId, itemId);
    },
    async regenerateItem(storyId, itemId) {
      return toStoryItem(unwrap(await window.slide.storyRegenerateItem(storyId, itemId)));
    },
    async listItemVersions(storyId, itemId) {
      return unwrap(await window.slide.storyListItemVersions(storyId, itemId)).map(toStoryItemVersion);
    },
    async setItemVersion(storyId, itemId, versionId) {
      return toStoryItem(unwrap(await window.slide.storySetItemVersion(storyId, itemId, versionId)));
    },
  };
}
