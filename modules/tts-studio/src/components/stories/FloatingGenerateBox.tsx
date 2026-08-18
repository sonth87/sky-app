import { useEffect, useState } from 'react';
import type { EffectConfig, EffectPresetPort, StoryPort, TtsEnginePort, TtsPort } from '@sky-app/service-contracts';
import { useTtsStudioStore } from '../../store';
import { useTtsEngines } from '../../lib/useTtsEngines';
import { useEffectPresets } from '../../lib/useEffectPresets';
import { getPlayingId, playUrlAudio, stopAudio } from '../../lib/audioPlayer';
import { VoicePicker, previewPlayId } from '../VoicePicker';
import { LanguageSelect } from '../LanguageSelect';
import { EffectsSelect } from '../EffectsSelect';
import { ModelSelect } from '../ModelSelect';
import { GenerateButton } from '../GenerateButton';

export interface FloatingGenerateBoxProps {
  storyId: string;
  storyPort: StoryPort;
  ttsPort: TtsPort;
  enginePort?: TtsEnginePort;
  /** Vắng mặt ở môi trường không có kho preset — dropdown hiệu ứng tự ẩn, đúng cách
   *  `EffectsPanel` (tab "Sinh giọng") đang xử lý optional port này. */
  effectPresetPort?: EffectPresetPort;
  /** platform.assetUrl — resolve path tương đối (vd voice-covers/cover-01.webp) thành URL
   *  đúng môi trường, cần cho `VoicePicker`'s ảnh bìa giọng. */
  assetUrl: (path: string) => string;
  /** Track cuối cùng đang trống — đoạn mới sinh luôn có chỗ riêng, không đè lên item có sẵn
   *  (đúng quy ước `AddFromHistoryPicker`/"Thêm đoạn" đang dùng). */
  track: number;
  onAdded: () => void;
  /** Panel editor docked (`Timeline.tsx`) có thể đang mở phía dưới — né đè lên nhau, đúng cách
   *  voicebox dùng `storyStore.trackEditorHeight` tính padding tránh đè. */
  bottomOffset: number;
}

/**
 * Ô "sinh giọng nói mới" nổi ngay trong tab Story — bố cục giống voicebox (textarea nhiều
 * dòng phía trên, hàng chọn phía dưới).
 *
 * **Giọng đọc dùng THẲNG `VoicePicker`** (search/filter/nghe thử đã có sẵn, wrapper của
 * `VoicePickerCombobox` từ `@sky-app/voice-catalog-ui`) — KHÔNG tự vẽ `<select>` nghèo nàn
 * hơn (bản đầu làm vậy, đã bỏ 2026-08-18). Hệ quả: chọn giọng ở đây giờ DÙNG CHUNG
 * `selectedVoiceId` với tab "Sinh giọng" (khác thiết kế cục bộ ban đầu) — đơn giản hơn, đúng ý
 * "dùng lại cái đã làm" thay vì tự chế 1 bản khác đi.
 *
 * **Ngôn ngữ LUÔN hiện, disable khi engine hiện tại là VieNeu** (không ẩn hẳn như bản đầu) —
 * cùng logic `EngineParamsPanel.tsx`. **Model/engine**: `ModelSelect` mới — CHỌN xong CHƯA đổi
 * engine thật ngay (đổi engine là thao tác nặng/toàn cục, restart cả tiến trình Python), chỉ
 * thật sự gọi `enginePort.switchEngine()` lúc bấm Sinh nếu model chọn khác model đang chạy.
 */
export function FloatingGenerateBox({
  storyId, storyPort, ttsPort, enginePort, effectPresetPort, assetUrl, track, onAdded, bottomOffset,
}: FloatingGenerateBoxProps) {
  const selectedVoiceId = useTtsStudioStore((s) => s.selectedVoiceId);
  const [text, setText] = useState('');
  const [presetId, setPresetId] = useState('');
  const [language, setLanguage] = useState('');
  const [pendingEngineId, setPendingEngineId] = useState('');
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [switchingEngine, setSwitchingEngine] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ttsEngines, refetchEngines] = useTtsEngines(enginePort);
  const [presets] = useEffectPresets(effectPresetPort);

  const capabilities = ttsEngines?.current_capabilities;
  const currentEngineId = ttsEngines?.current;
  const isVieneu = currentEngineId === 'vieneu';
  const languages: string[] = capabilities?.multilingual ? capabilities.supported_languages || [] : [];

  // Chọn model mặc định = engine đang chạy, CHỈ lúc lần đầu có dữ liệu — sau đó độc lập với
  // `ttsEngines.current` (không tự đồng bộ lại nếu người dùng đã chọn khác).
  useEffect(() => {
    if (!pendingEngineId && currentEngineId) setPendingEngineId(currentEngineId);
  }, [pendingEngineId, currentEngineId]);

  const handlePreview = async (voiceId: string) => {
    if (!ttsPort.getPreviewUrl) return;
    const playId = previewPlayId(voiceId);
    if (getPlayingId() === playId) { stopAudio(); return; }
    setPreviewingId(voiceId);
    try {
      const url = await ttsPort.getPreviewUrl(voiceId);
      setPreviewingId(null);
      await playUrlAudio(playId, url);
    } catch {
      setPreviewingId(null);
    }
  };

  const disabled = generating || switchingEngine || !text.trim() || !selectedVoiceId;

  const handleGenerate = async () => {
    if (disabled) return;
    setError(null);

    if (pendingEngineId && currentEngineId && pendingEngineId !== currentEngineId) {
      if (!enginePort?.switchEngine) {
        setError('Môi trường này không hỗ trợ đổi model.');
        return;
      }
      setSwitchingEngine(true);
      try {
        const res = await enginePort.switchEngine(pendingEngineId);
        if (!res.ok) {
          setError(res.error ?? 'Không đổi được model.');
          return;
        }
        refetchEngines();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return;
      } finally {
        setSwitchingEngine(false);
      }
    }

    setGenerating(true);
    try {
      const effectsChain: EffectConfig[] | undefined = presetId
        ? presets.find((p) => p.id === presetId)?.effectsChain
        : undefined;
      const engineOverrides = language && pendingEngineId ? { [pendingEngineId]: { language } } : undefined;
      const result = await ttsPort.synthesizeBuffer(text.trim(), {
        voiceId: selectedVoiceId!, effectsChain, engine_overrides: engineOverrides,
      });
      if (!result.historyId) {
        setError('Môi trường này chưa hỗ trợ tự thêm vào Story — dùng tab "Sinh giọng" rồi bấm "Thêm đoạn" từ lịch sử.');
        return;
      }
      await storyPort.addItemFromHistory(storyId, result.historyId, track);
      setText('');
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div
      className="absolute inset-x-2 z-10 flex flex-col gap-2.5 rounded-2xl border border-border bg-popover/95 p-4 shadow-lg backdrop-blur"
      style={{ bottom: bottomOffset + 8 }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !disabled) void handleGenerate(); }}
        placeholder="Nhập văn bản cho Story — sinh xong tự thêm vào track cuối. (⌘/Ctrl+Enter để sinh nhanh)"
        rows={3}
        className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary"
      />

      {error && <p className="text-2xs text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <VoicePicker onPreview={handlePreview} previewingId={previewingId} assetUrl={assetUrl} />
        <LanguageSelect
          languages={languages}
          value={language}
          onChange={setLanguage}
          disabled={isVieneu}
          disabledReason="VieNeu tự gắn ngôn ngữ theo giọng đã chọn, không cần chọn ở đây."
          className="rounded-lg border border-border bg-card px-2 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
        />
        {ttsEngines && ttsEngines.engines.length > 0 && (
          <ModelSelect
            engines={ttsEngines.engines}
            value={pendingEngineId}
            onChange={setPendingEngineId}
            className="rounded-lg border border-border bg-card px-2 py-1.5 text-xs"
          />
        )}
        {presets.length > 0 && (
          <EffectsSelect
            presets={presets}
            value={presetId}
            onChange={setPresetId}
            className="w-32 rounded-lg border border-border bg-card px-2 py-1.5 text-xs"
          />
        )}
        <GenerateButton
          generating={generating || switchingEngine}
          disabled={disabled}
          onClick={() => void handleGenerate()}
          label={switchingEngine ? 'Đang đổi model...' : 'Sinh & Thêm'}
          className="ml-auto"
        />
      </div>
    </div>
  );
}
