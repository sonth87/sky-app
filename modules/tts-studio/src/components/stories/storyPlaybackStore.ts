import { create } from 'zustand';

const EDITOR_HEIGHT_KEY = 'tts-studio-story-editor-height';
const DEFAULT_EDITOR_HEIGHT = 220;

function readStoredEditorHeight(): number {
  try {
    const raw = localStorage.getItem(EDITOR_HEIGHT_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : DEFAULT_EDITOR_HEIGHT;
  } catch {
    return DEFAULT_EDITOR_HEIGHT;
  }
}

interface StoryPlaybackState {
  isPlaying: boolean;
  currentTimeMs: number;
  trackEditorHeight: number;

  setPlaying: (playing: boolean) => void;
  setCurrentTimeMs: (ms: number) => void;
  setTrackEditorHeight: (h: number) => void;
}

/**
 * State "ý định phát" (isPlaying/currentTimeMs) — KHÔNG giữ AudioContext/GainNode gì cả
 * (không hợp với zustand, đối tượng Web Audio là mutable/imperative). Đồ thị audio thật sống
 * trong `useStoryPlayback`'s refs (nhận `items` trực tiếp qua tham số, không đọc lại từ đây)
 * — store này chỉ để mọi nơi hiển thị (toolbar/waveform/playhead/danh sách item) đọc chung 1
 * nguồn state mà không cần prop-drilling `currentTimeMs` qua nhiều lớp component.
 */
export const useStoryPlaybackStore = create<StoryPlaybackState>((set) => ({
  isPlaying: false,
  currentTimeMs: 0,
  trackEditorHeight: readStoredEditorHeight(),

  setPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTimeMs: (currentTimeMs) => set({ currentTimeMs }),
  setTrackEditorHeight: (trackEditorHeight) => {
    set({ trackEditorHeight });
    try { localStorage.setItem(EDITOR_HEIGHT_KEY, String(trackEditorHeight)); } catch { /* ignore quota/private-mode */ }
  },
}));
