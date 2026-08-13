import { Search, SlidersHorizontal } from 'lucide-react';
import { FilterChip } from './FilterChip.js';
import type { VoiceFilterOptions } from './useVoiceFilter.js';
import type { VoiceFilterState } from './types.js';

export interface VoiceSearchBarProps {
  filter: VoiceFilterState;
  options: VoiceFilterOptions;
  onQueryChange: (q: string) => void;
  onLanguageChange: (v: string | null) => void;
  onAccentChange: (v: string | null) => void;
  onCategoryChange: (v: string | null) => void;
  onGenderChange: (v: string | null) => void;
  searchPlaceholder?: string;
}

const ACCENT_LABELS: Record<string, string> = {
  northern: 'Miền Bắc',
  central: 'Miền Trung',
  southern: 'Miền Nam',
};

const GENDER_LABELS: Record<string, string> = {
  female: 'Nữ',
  male: 'Nam',
};

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/** Search input + hàng chip filter (Language/Accent/Category/Gender) — theo mẫu UI voice picker kiểu ElevenLabs. */
export function VoiceSearchBar({
  filter,
  options,
  onQueryChange,
  onLanguageChange,
  onAccentChange,
  onCategoryChange,
  onGenderChange,
  searchPlaceholder = 'Tìm kiếm giọng đọc...',
}: VoiceSearchBarProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={filter.query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-md border border-border bg-card py-1.5 pl-8 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <SlidersHorizontal size={12} className="text-muted-foreground" />
        <FilterChip label="Ngôn ngữ" value={filter.language} options={options.languages} onChange={onLanguageChange} />
        <FilterChip
          label="Vùng miền"
          value={filter.accent}
          options={options.accents}
          onChange={onAccentChange}
          formatOption={(v) => ACCENT_LABELS[v] ?? capitalize(v)}
        />
        <FilterChip label="Thể loại" value={filter.category} options={options.categories} onChange={onCategoryChange} formatOption={capitalize} />
        <FilterChip
          label="Giới tính"
          value={filter.gender}
          options={options.genders}
          onChange={onGenderChange}
          formatOption={(v) => GENDER_LABELS[v] ?? capitalize(v)}
        />
      </div>
    </div>
  );
}
