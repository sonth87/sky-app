import type { Voice, VoiceCatalogEntry } from '@sky-app/service-contracts';

/** Trạng thái kỹ thuật: 'registry' = đã có embedding sẵn sàng synthesize ngay,
 * 'catalog' = voice mẫu vendor chưa từng dùng (server tự encode ngầm lần chọn đầu). */
export type VoiceListSource = 'registry' | 'catalog';

/** Nguồn gốc dùng để chia tab UI: 'system' = hệ thống cung cấp sẵn (catalog vendor,
 * dù đã hay chưa từng được chọn dùng), 'custom' = user tự upload qua clone-from-audio. */
export type VoiceListOrigin = 'system' | 'custom';

/**
 * 1 dòng hiển thị trong VoicePicker — hợp nhất Voice (đã có trong registry) và
 * VoiceCatalogEntry (voice mẫu vendor). UI filter/search hoạt động trên field chung
 * này, không cần biết nguồn gốc kỹ thuật cụ thể. Không có khái niệm "Clone/Import" ở
 * UI: chọn 1 voice hệ thống chưa từng dùng vẫn hoạt động ngay, server tự chuẩn bị ngầm.
 */
export interface VoiceListItem {
  source: VoiceListSource;
  origin: VoiceListOrigin;
  id: string;
  name: string;
  gender?: string;
  language?: string;
  accent?: string;
  category: string[];
  tags: string[];
  tagline?: string;
  description?: string;
  /** Chỉ có khi source === 'catalog' — ngôn ngữ chứa entry này (dùng cho getCatalogAudioUrl). */
  catalogLang?: string;
}

export function voiceToListItem(v: Voice, origin: VoiceListOrigin = 'system'): VoiceListItem {
  return {
    source: 'registry',
    origin,
    id: v.id,
    name: v.name,
    gender: v.gender,
    language: v.language,
    accent: v.accent,
    category: v.category ?? [],
    tags: v.tags ?? [],
    tagline: v.tagline,
    description: v.description,
  };
}

export function catalogEntryToListItem(e: VoiceCatalogEntry): VoiceListItem {
  return {
    source: 'catalog',
    origin: 'system',
    id: e.id,
    name: e.name,
    gender: e.gender,
    language: e.language,
    accent: e.accent,
    category: e.category,
    tags: e.tags,
    tagline: e.tagline,
    description: e.description,
    catalogLang: e.lang,
  };
}

export interface VoiceFilterState {
  query: string;
  language: string | null;
  accent: string | null;
  category: string | null;
  gender: string | null;
}

export const EMPTY_FILTER: VoiceFilterState = {
  query: '',
  language: null,
  accent: null,
  category: null,
  gender: null,
};
