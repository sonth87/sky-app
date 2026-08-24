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
  /** true = giọng built-in của chính engine (vd 20 giọng VieNeu 3.3.0, không cần ref audio) —
   * khác giọng catalog vendor (sky-app tự thu/curate WAV mẫu). Cả 2 đều origin === 'system'
   * (cùng tab "Hệ thống"), field này chỉ để phân biệt MÀU dấu tích trên cover (xem VoiceRow). */
  builtin?: boolean;
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

/** Bù `tagline`/`description`/`category`/`tags` còn thiếu ở voice đã import (registry) từ
 * catalog entry gốc, khớp qua `sourceCatalogId` — 1 số voice mặc định (vd Hoài My/Nam Minh)
 * chỉ lưu các field mô tả này ở catalog lúc bundle, không copy vào registry entry khi import. */
export function enrichVoicesFromCatalog(voices: Voice[], catalog: VoiceCatalogEntry[]): Voice[] {
  const catalogMap = new Map(catalog.map((c) => [c.id, c]));
  return voices.map((v) => {
    const cat = v.sourceCatalogId ? catalogMap.get(v.sourceCatalogId) : undefined;
    if (!cat) return v;
    return {
      ...v,
      category: v.category ?? cat.category,
      tags: v.tags ?? cat.tags,
      tagline: v.tagline ?? cat.tagline,
      description: v.description ?? cat.description,
    };
  });
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
