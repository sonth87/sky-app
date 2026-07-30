import { Loader2, Pause, Play, Sparkles } from 'lucide-react';
import { ButtonPrimitive } from '@sky-app/ui';
import { useTtsStudioStore } from '../store';
import { useAudioPlayingId } from '../lib/audioPlayer';

export const QUICK_PLAY_ID = 'quickplay';

export interface GenerateBarProps {
  onGenerate?: () => void;
  onQuickPlay?: () => void;
  canQuickPlay?: boolean;
}

export function GenerateBar({ onGenerate, onQuickPlay, canQuickPlay }: GenerateBarProps) {
  const text = useTtsStudioStore((s) => s.text);
  const isGenerating = useTtsStudioStore((s) => s.isGenerating);
  const selectedVoiceId = useTtsStudioStore((s) => s.selectedVoiceId);
  const isQuickPlaying = useAudioPlayingId() === QUICK_PLAY_ID;

  const disabled = isGenerating || !text.trim() || !selectedVoiceId;

  return (
    <div className="flex items-center justify-end gap-2">
      <ButtonPrimitive
        type="button"
        variant="outline"
        size="sm"
        disabled={!canQuickPlay || isGenerating}
        onClick={onQuickPlay}
      >
        {isQuickPlaying ? <Pause size={14} /> : <Play size={14} />} {isQuickPlaying ? 'Dừng' : 'Phát nhanh'}
      </ButtonPrimitive>
      <ButtonPrimitive type="button" size="sm" disabled={disabled} onClick={onGenerate}>
        {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        Tạo giọng nói
      </ButtonPrimitive>
    </div>
  );
}
