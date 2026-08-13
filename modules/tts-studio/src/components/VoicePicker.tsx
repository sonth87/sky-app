import { useMemo } from 'react';
import { VoicePickerCombobox, getVoiceCoverPath, type PreviewState, type VoiceListItem } from '@sky-app/voice-catalog-ui';
import { useTtsStudioStore } from '../store';
import { useAudioPlayingId } from '../lib/audioPlayer';

const PREVIEW_PREFIX = 'preview:';

/** `id` dùng chung với module điều phối audio (audioPlayer.ts) cho 1 giọng nghe thử —
 * export để TtsStudioApp's handlePreview dùng cùng quy ước khi gọi playUrlAudio/so khớp
 * getPlayingId(). */
export function previewPlayId(voiceId: string): string {
  return `${PREVIEW_PREFIX}${voiceId}`;
}

export interface VoicePickerProps {
  onPreview?: (voiceId: string) => void;
  previewingId?: string | null;
  /** TTS backend đang khởi động (load engine ONNX + warm-up) — chưa chắc đã có giọng nào để
   * chọn, dù `voices` hiện đang rỗng chỉ là tạm thời chứ không phải lỗi. */
  loading?: boolean;
  onAddVoice?: () => void;
  onDeleteVoice?: (id: string) => void;
  /** platform.assetUrl — resolve path tương đối (vd voice-covers/cover-01.webp) thành URL
   * đúng môi trường (Web public/ vs Electron resources), xem PlatformContext.assetUrl. */
  assetUrl: (path: string) => string;
}

export function VoicePicker({ onPreview, previewingId, loading, onAddVoice, onDeleteVoice, assetUrl }: VoicePickerProps) {
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

  const playingId = useAudioPlayingId();
  const previewStates: Record<string, PreviewState> = useMemo(() => {
    const states: Record<string, PreviewState> = {};
    if (previewingId) states[previewingId] = 'loading';
    if (playingId?.startsWith(PREVIEW_PREFIX)) {
      states[playingId.slice(PREVIEW_PREFIX.length)] = 'playing';
    }
    return states;
  }, [previewingId, playingId]);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-foreground">Giọng nói</label>
      <VoicePickerCombobox
        items={items}
        value={selectedVoiceId}
        onChange={setSelectedVoiceId}
        previewStates={previewStates}
        onPreview={(item, e) => { e.stopPropagation(); onPreview?.(item.id); }}
        getCoverUrl={(item) => assetUrl(getVoiceCoverPath(item.id))}
        defaultLanguage="Vietnamese"
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
