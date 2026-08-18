import { Pause, Play } from 'lucide-react';
import { ButtonPrimitive } from '@sky-app/ui';
import { useTtsStudioStore } from '../store';
import { GenerateButton } from './GenerateButton';

export const QUICK_PLAY_ID = 'quickplay';

export interface GenerateBarProps {
  onGenerate?: () => void;
  onQuickPlay?: () => void;
  canQuickPlay?: boolean;
  /** AudioPlayerBar đang mở hay không — quyết định nhãn/icon nút "Phát nhanh" (play/pause THẬT
   *  giờ nằm trong chính player đó, nút này chỉ đóng/mở). */
  showQuickPlayer?: boolean;
}

/**
 * Chỉ 2 nút hành động — KHÔNG có hàng chọn giọng/ngôn ngữ/hiệu ứng (thử thêm 1 lần rồi bỏ,
 * 2026-08-18: thừa, sidebar đã có `VoicePicker`/`EffectsPanel`/`EngineParamsPanel` lo đúng việc
 * đó rồi, lặp lại ở đây chỉ gây rối chứ không thêm giá trị).
 */
export function GenerateBar({ onGenerate, onQuickPlay, canQuickPlay, showQuickPlayer }: GenerateBarProps) {
  const text = useTtsStudioStore((s) => s.text);
  const isGenerating = useTtsStudioStore((s) => s.isGenerating);
  const selectedVoiceId = useTtsStudioStore((s) => s.selectedVoiceId);

  const disabled = isGenerating || !text.trim() || !selectedVoiceId;

  return (
    <div className="flex items-center justify-end gap-2 pb-2">
      <ButtonPrimitive
        type="button"
        variant="outline"
        size="sm"
        disabled={!canQuickPlay || isGenerating}
        onClick={onQuickPlay}
      >
        {showQuickPlayer ? <Pause size={14} /> : <Play size={14} />} {showQuickPlayer ? 'Ẩn' : 'Phát nhanh'}
      </ButtonPrimitive>
      <GenerateButton generating={isGenerating} disabled={disabled} onClick={() => onGenerate?.()} />
    </div>
  );
}
