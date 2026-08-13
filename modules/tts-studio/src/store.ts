import { create } from 'zustand';
import type { EffectConfig } from '@sky-app/service-contracts';

export interface StudioVoice {
  id: string;
  name: string;
  gender?: string;
  language?: string;
  accent?: string;
  category?: string[];
  tags?: string[];
  type?: string;
  tagline?: string;
  description?: string;
  sourceCatalogId?: string;
  default?: boolean;
}

export interface HistoryEntryMeta {
  id: string;
  text: string;
  voiceId: string;
  voiceLabel: string;
  speed: number;
  createdAt: number;
  durationMs: number;
  /** false khi lỗi (xem `error`) hoặc dòng nguồn 'pregen' (audio đã có sẵn ở nơi khác — xem
   *  history_store.py's add_entry) — HistoryList tự ẩn nút Nghe lại/Tải khi false. */
  hasAudio: boolean;
  qualityScore?: number;
  qualityFlags?: string[];
  error?: string;
}

interface TtsStudioState {
  voices: StudioVoice[];
  selectedVoiceId: string | null;
  speed: number;
  text: string;
  isGenerating: boolean;
  history: HistoryEntryMeta[];
  engineOverrides: Record<string, Record<string, any>>;  // {engineId: {param: value}}
  /** Chuỗi hiệu ứng hậu kỳ đang áp (đã resolve từ preset, sửa slider tại chỗ được).
   *  Rỗng = không dùng hiệu ứng. Gửi kèm mỗi lần synthesize. */
  effectsChain: EffectConfig[];
  /** Preset đang chọn — chỉ để UI biết tô sáng dòng nào; chuỗi thật nằm ở effectsChain
   *  và có thể đã bị sửa khác preset gốc. */
  selectedPresetId: string | null;

  setVoices: (voices: StudioVoice[]) => void;
  setSelectedVoiceId: (id: string) => void;
  setSpeed: (speed: number) => void;
  setText: (text: string) => void;
  setIsGenerating: (v: boolean) => void;
  setHistory: (history: HistoryEntryMeta[]) => void;
  prependHistory: (entry: HistoryEntryMeta) => void;
  removeHistory: (id: string) => void;
  setEngineOverrides: (overrides: Record<string, Record<string, any>>) => void;
  updateEngineOverride: (engineId: string, param: string, value: any) => void;
  setEffectsChain: (chain: EffectConfig[], presetId?: string | null) => void;
  updateEffectParam: (index: number, param: string, value: number) => void;
  toggleEffect: (index: number, enabled: boolean) => void;
}

export const useTtsStudioStore = create<TtsStudioState>((set) => ({
  voices: [],
  selectedVoiceId: null,
  speed: 1.0,
  text: '',
  isGenerating: false,
  history: [],
  engineOverrides: {},
  effectsChain: [],
  selectedPresetId: null,

  setVoices: (voices) => set({ voices }),
  setSelectedVoiceId: (selectedVoiceId) => set({ selectedVoiceId }),
  setSpeed: (speed) => set({ speed }),
  setText: (text) => set({ text }),
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setHistory: (history) => set({ history }),
  // Server giờ tự quản lý retention (5000 dòng/90 ngày, xem history_store.py) — không cap
  // cứng 30 phía client nữa như thời IndexedDB.
  prependHistory: (entry) =>
    set((s) => ({ history: [entry, ...s.history] })),
  removeHistory: (id) =>
    set((s) => ({ history: s.history.filter((e) => e.id !== id) })),
  setEngineOverrides: (engineOverrides) => set({ engineOverrides }),
  setEffectsChain: (effectsChain, selectedPresetId = null) => set({ effectsChain, selectedPresetId }),
  updateEffectParam: (index, param, value) =>
    set((s) => ({
      effectsChain: s.effectsChain.map((e, i) =>
        i === index ? { ...e, params: { ...e.params, [param]: value } } : e,
      ),
    })),
  toggleEffect: (index, enabled) =>
    set((s) => ({
      effectsChain: s.effectsChain.map((e, i) => (i === index ? { ...e, enabled } : e)),
    })),
  updateEngineOverride: (engineId, param, value) =>
    set((s) => ({
      engineOverrides: {
        ...s.engineOverrides,
        [engineId]: {
          ...(s.engineOverrides[engineId] || {}),
          [param]: value,
        },
      },
    })),
}));
