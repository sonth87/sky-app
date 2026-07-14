import { create } from 'zustand';

export interface StudioVoice {
  id: string;
  name: string;
  gender?: string;
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

  setVoices: (voices: StudioVoice[]) => void;
  setSelectedVoiceId: (id: string) => void;
  setSpeed: (speed: number) => void;
  setText: (text: string) => void;
  setIsGenerating: (v: boolean) => void;
  setHistory: (history: HistoryEntryMeta[]) => void;
  prependHistory: (entry: HistoryEntryMeta) => void;
}

export const useTtsStudioStore = create<TtsStudioState>((set) => ({
  voices: [],
  selectedVoiceId: null,
  speed: 1.0,
  text: '',
  isGenerating: false,
  history: [],

  setVoices: (voices) => set({ voices }),
  setSelectedVoiceId: (selectedVoiceId) => set({ selectedVoiceId }),
  setSpeed: (speed) => set({ speed }),
  setText: (text) => set({ text }),
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setHistory: (history) => set({ history }),
  prependHistory: (entry) =>
    set((s) => ({ history: [entry, ...s.history].slice(0, 30) })),
}));
