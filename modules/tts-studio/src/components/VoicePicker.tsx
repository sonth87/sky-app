import { Loader2, Volume2 } from 'lucide-react';
import { ButtonPrimitive } from './ui/button-primitive';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { useTtsStudioStore } from '../store';

export interface VoicePickerProps {
  onPreview?: (voiceId: string) => void;
  previewingId?: string | null;
}

export function VoicePicker({ onPreview, previewingId }: VoicePickerProps) {
  const voices = useTtsStudioStore((s) => s.voices);
  const selectedVoiceId = useTtsStudioStore((s) => s.selectedVoiceId);
  const setSelectedVoiceId = useTtsStudioStore((s) => s.setSelectedVoiceId);
  const isPreviewing = !!selectedVoiceId && previewingId === selectedVoiceId;

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-foreground">Giọng nói</label>
      <div className="flex items-center gap-2">
        <Select value={selectedVoiceId ?? ''} onValueChange={setSelectedVoiceId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Chọn giọng đọc" />
          </SelectTrigger>
          <SelectContent>
            {voices.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
                {v.gender ? ` · ${v.gender === 'female' ? 'Nữ' : 'Nam'}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ButtonPrimitive
          type="button"
          variant="outline"
          size="icon-sm"
          disabled={!selectedVoiceId || isPreviewing}
          onClick={() => selectedVoiceId && onPreview?.(selectedVoiceId)}
          title="Nghe thử giọng"
        >
          {isPreviewing ? <Loader2 size={14} className="animate-spin" /> : <Volume2 size={14} />}
        </ButtonPrimitive>
      </div>
    </div>
  );
}
