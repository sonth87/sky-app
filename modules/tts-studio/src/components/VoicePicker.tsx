import { useMemo } from 'react';
import { VoicePickerCombobox, type PreviewState, type VoiceListItem } from '@sky-app/voice-catalog-ui';
import { useTtsStudioStore } from '../store';

export interface VoicePickerProps {
  onPreview?: (voiceId: string) => void;
  previewingId?: string | null;
  /** TTS backend đang khởi động (load engine ONNX + warm-up) — chưa chắc đã có giọng nào để
   * chọn, dù `voices` hiện đang rỗng chỉ là tạm thời chứ không phải lỗi. */
  loading?: boolean;
  onAddVoice?: () => void;
  onDeleteVoice?: (id: string) => void;
}

export function VoicePicker({ onPreview, previewingId, loading, onAddVoice, onDeleteVoice }: VoicePickerProps) {
  const voices = useTtsStudioStore((s) => s.voices);
  const selectedVoiceId = useTtsStudioStore((s) => s.selectedVoiceId);
  const setSelectedVoiceId = useTtsStudioStore((s) => s.setSelectedVoiceId);

  const items = useMemo<VoiceListItem[]>(
    () =>
      voices.map((v) => ({
        source: 'registry',
        origin: v.type === 'cloned' && !v.sourceCatalogId ? 'custom' : 'system',
        id: v.id,
        name: v.name,
        gender: v.gender,
        language: v.language,
        accent: v.accent,
        category: v.category ?? [],
        tags: v.tags ?? [],
        tagline: v.tagline,
        description: v.description,
      })),
    [voices],
  );

  const previewStates: Record<string, PreviewState> = useMemo(
    () => (previewingId ? { [previewingId]: 'loading' } : {}),
    [previewingId],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-foreground">Giọng nói</label>
      <VoicePickerCombobox
        items={items}
        value={selectedVoiceId}
        onChange={setSelectedVoiceId}
        previewStates={previewStates}
        onPreview={(item, e) => { e.stopPropagation(); onPreview?.(item.id); }}
        loading={loading}
        loadingLabel="Đang tải giọng đọc..."
        placeholder="Chọn giọng đọc"
        searchPlaceholder="Tìm giọng đọc..."
        tabLabels={{ system: 'Hệ thống', custom: 'Cá nhân' }}
        onAddVoice={onAddVoice}
        onDeleteVoice={onDeleteVoice}
      />
    </div>
  );
}
