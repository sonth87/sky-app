import type { StoryPort, Story, StoryItem, StoryWithItems } from '@sky-app/service-contracts';

interface RawStory {
  id: string; name: string; description: string | null;
  created_at: string; updated_at: string;
}

interface RawStoryItem {
  id: string; story_id: string; audio_file: string;
  source_text: string | null; voice_label: string | null; duration_ms: number;
  start_time_ms: number; track: number;
  trim_start_ms: number; trim_end_ms: number; volume: number; created_at: string;
}

interface RawStoryWithItems extends RawStory {
  items: RawStoryItem[];
}

function toStory(s: RawStory): Story {
  return {
    id: s.id, name: s.name, description: s.description,
    createdAt: s.created_at, updatedAt: s.updated_at,
  };
}

function toStoryItem(i: RawStoryItem): StoryItem {
  return {
    id: i.id, storyId: i.story_id, audioFile: i.audio_file,
    sourceText: i.source_text, voiceLabel: i.voice_label, durationMs: i.duration_ms,
    startTimeMs: i.start_time_ms, track: i.track,
    trimStartMs: i.trim_start_ms, trimEndMs: i.trim_end_ms,
    volume: i.volume, createdAt: i.created_at,
  };
}

function toStoryWithItems(s: RawStoryWithItems): StoryWithItems {
  return { ...toStory(s), items: s.items.map(toStoryItem) };
}

/**
 * Web StoryPort — gọi thẳng server Python's /stories/* (CORS bật sẵn, xem server/main.py) —
 * đúng khuôn `fetchSynthesize`/`cloneVoice` của TtsPort (platform-web/src/adapters/tts.ts):
 * dùng CHUNG `ttsBaseUrl` với TTS/History, KHÔNG phải data-service (khác EffectPresetPort).
 */
export function createWebStoryPort(baseUrl = 'http://localhost:8093'): StoryPort {
  const base = `${baseUrl}/stories`;

  async function failText(res: Response, fallback: string): Promise<Error> {
    return new Error((await res.text()) || `${fallback}: ${res.statusText}`);
  }

  return {
    async list() {
      const res = await fetch(base);
      if (!res.ok) throw await failText(res, 'Không tải được danh sách Story');
      return ((await res.json()) as RawStory[]).map(toStory);
    },
    async create(name, description) {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      if (!res.ok) throw await failText(res, 'Không tạo được Story');
      return toStory(await res.json());
    },
    async get(storyId) {
      const res = await fetch(`${base}/${encodeURIComponent(storyId)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw await failText(res, 'Không tải được Story');
      return toStoryWithItems(await res.json());
    },
    async update(storyId, patch) {
      const res = await fetch(`${base}/${encodeURIComponent(storyId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw await failText(res, 'Không sửa được Story');
      return toStory(await res.json());
    },
    async delete(storyId) {
      const res = await fetch(`${base}/${encodeURIComponent(storyId)}`, { method: 'DELETE' });
      if (res.status === 404) return false;
      if (!res.ok) throw await failText(res, 'Không xoá được Story');
      return true;
    },
    async addItemFromHistory(storyId, historyEntryId, track = 0) {
      const res = await fetch(`${base}/${encodeURIComponent(storyId)}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history_entry_id: historyEntryId, track }),
      });
      if (!res.ok) throw await failText(res, 'Không thêm được vào Story');
      return toStoryItem(await res.json());
    },
    async deleteItem(storyId, itemId) {
      const res = await fetch(`${base}/${encodeURIComponent(storyId)}/items/${encodeURIComponent(itemId)}`, {
        method: 'DELETE',
      });
      if (res.status === 404) return false;
      if (!res.ok) throw await failText(res, 'Không xoá được item');
      return true;
    },
    async moveItem(storyId, itemId, startTimeMs, track) {
      const res = await fetch(`${base}/${encodeURIComponent(storyId)}/items/${encodeURIComponent(itemId)}/move`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_time_ms: startTimeMs, track }),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw await failText(res, 'Không di chuyển được item');
      return toStoryItem(await res.json());
    },
    async trimItem(storyId, itemId, trimStartMs, trimEndMs) {
      const res = await fetch(`${base}/${encodeURIComponent(storyId)}/items/${encodeURIComponent(itemId)}/trim`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trim_start_ms: trimStartMs, trim_end_ms: trimEndMs }),
      });
      if (!res.ok) throw await failText(res, 'Không cắt được item');
      return toStoryItem(await res.json());
    },
    async setItemVolume(storyId, itemId, volume) {
      const res = await fetch(`${base}/${encodeURIComponent(storyId)}/items/${encodeURIComponent(itemId)}/volume`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volume }),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw await failText(res, 'Không chỉnh được âm lượng');
      return toStoryItem(await res.json());
    },
    async splitItem(storyId, itemId, splitTimeMs) {
      const res = await fetch(`${base}/${encodeURIComponent(storyId)}/items/${encodeURIComponent(itemId)}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ split_time_ms: splitTimeMs }),
      });
      if (!res.ok) throw await failText(res, 'Không tách được item');
      const { left, right } = (await res.json()) as { left: RawStoryItem; right: RawStoryItem };
      return { left: toStoryItem(left), right: toStoryItem(right) };
    },
    async duplicateItem(storyId, itemId) {
      const res = await fetch(`${base}/${encodeURIComponent(storyId)}/items/${encodeURIComponent(itemId)}/duplicate`, {
        method: 'POST',
      });
      if (!res.ok) throw await failText(res, 'Không nhân bản được item');
      return toStoryItem(await res.json());
    },
    async exportAudioUrl(storyId) {
      return `${base}/${encodeURIComponent(storyId)}/export-audio`;
    },
  };
}
