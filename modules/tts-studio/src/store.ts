import { create } from 'zustand';

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
}

interface TtsStudioState {
  voices: StudioVoice[];
  selectedVoiceId: string | null;
  speed: number;
  text: string;
  isGenerating: boolean;
  history: HistoryEntryMeta[];
  engineOverrides: Record<string, Record<string, any>>;  // {engineId: {param: value}}

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
}

export const useTtsStudioStore = create<TtsStudioState>((set) => ({
  voices: [],
  selectedVoiceId: null,
  speed: 1.0,
  text: '',
  isGenerating: false,
  history: [],
  engineOverrides: {},

  setVoices: (voices) => set({ voices }),
  setSelectedVoiceId: (selectedVoiceId) => set({ selectedVoiceId }),
  setSpeed: (speed) => set({ speed }),
  setText: (text) => set({ text }),
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setHistory: (history) => set({ history }),
  prependHistory: (entry) =>
    set((s) => ({ history: [entry, ...s.history].slice(0, 30) })),
  removeHistory: (id) =>
    set((s) => ({ history: s.history.filter((e) => e.id !== id) })),
  setEngineOverrides: (engineOverrides) => set({ engineOverrides }),
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
