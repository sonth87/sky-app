import { useMemo, useState } from 'react';
import type { VoiceFilterState, VoiceListItem } from './types.js';
import { EMPTY_FILTER } from './types.js';

export interface VoiceFilterOptions {
  languages: string[];
  accents: string[];
  categories: string[];
  genders: string[];
}

function collectOptions(items: VoiceListItem[]): VoiceFilterOptions {
  const languages = new Set<string>();
  const accents = new Set<string>();
  const categories = new Set<string>();
  const genders = new Set<string>();
  for (const item of items) {
    if (item.language) languages.add(item.language);
    if (item.accent) accents.add(item.accent);
    if (item.gender) genders.add(item.gender);
    for (const c of item.category) categories.add(c);
  }
  return {
    languages: Array.from(languages).sort(),
    accents: Array.from(accents).sort(),
    categories: Array.from(categories).sort(),
    genders: Array.from(genders).sort(),
  };
}

function matchesQuery(item: VoiceListItem, query: string): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.name.toLowerCase().includes(q) ||
    (item.tagline?.toLowerCase().includes(q) ?? false) ||
    item.tags.some((t) => t.toLowerCase().includes(q)) ||
    item.category.some((c) => c.toLowerCase().includes(q))
  );
}

/**
 * Search + filter thuần trên danh sách VoiceListItem hợp nhất (registry + catalog).
 * Không tự fetch dữ liệu — nhận `items` từ caller (mỗi module tự quyết định nguồn:
 * useVoiceCatalog() ở Ceremony, useTtsStudioStore ở TTS Studio, v.v.).
 */
export function useVoiceFilter(items: VoiceListItem[]) {
  const [filter, setFilter] = useState<VoiceFilterState>(EMPTY_FILTER);

  const options = useMemo(() => collectOptions(items), [items]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (!matchesQuery(item, filter.query)) return false;
      if (filter.language && item.language !== filter.language) return false;
      if (filter.accent && item.accent !== filter.accent) return false;
      if (filter.gender && item.gender !== filter.gender) return false;
      if (filter.category && !item.category.includes(filter.category)) return false;
      return true;
    });
  }, [items, filter]);

  const setQuery = (query: string) => setFilter((f) => ({ ...f, query }));
  const setLanguage = (language: string | null) => setFilter((f) => ({ ...f, language }));
  const setAccent = (accent: string | null) => setFilter((f) => ({ ...f, accent }));
  const setCategory = (category: string | null) => setFilter((f) => ({ ...f, category }));
  const setGender = (gender: string | null) => setFilter((f) => ({ ...f, gender }));
  const reset = () => setFilter(EMPTY_FILTER);

  const activeFilterCount =
    (filter.language ? 1 : 0) + (filter.accent ? 1 : 0) + (filter.category ? 1 : 0) + (filter.gender ? 1 : 0);

  return {
    filter,
    filtered,
    options,
    setQuery,
    setLanguage,
    setAccent,
    setCategory,
    setGender,
    reset,
    activeFilterCount,
  };
}
