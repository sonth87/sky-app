import { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import type { EffectConfig, EffectPresetPort, EffectPreset, StoryPort, TtsPort } from '@sky-app/service-contracts';
import { useTtsStudioStore } from '../../store';

export interface FloatingGenerateBoxProps {
  storyId: string;
  storyPort: StoryPort;
  ttsPort: TtsPort;
  /** Vắng mặt ở môi trường không có kho preset — dropdown hiệu ứng tự ẩn, đúng cách
   *  `EffectsPanel` (tab "Sinh giọng") đang xử lý optional port này. */
  effectPresetPort?: EffectPresetPort;
  /** Track cuối cùng đang trống — đoạn mới sinh luôn có chỗ riêng, không đè lên item có sẵn
   *  (đúng quy ước `AddFromHistoryPicker`/"Thêm đoạn" đang dùng). */
  track: number;
  onAdded: () => void;
  /** Panel editor docked (`Timeline.tsx`) có thể đang mở phía dưới — né đè lên nhau, đúng cách
   *  voicebox dùng `storyStore.trackEditorHeight` tính padding tránh đè. */
  bottomOffset: number;
}

/**
 * Ô "sinh giọng nói mới" nổi ngay trong tab Story — port RÚT GỌN từ voicebox's
 * `FloatingGenerateBox.tsx` (~640 dòng). Sky-app đã có sẵn toàn bộ pipeline sinh giọng
 * (`useTtsStudioStore` + `TtsPort.synthesizeBuffer`) dùng chung với tab "Sinh giọng" — component
 * này CHỈ là 1 form gọn gọi lại đúng path đó rồi tự thêm kết quả thẳng vào Story đang mở, không
 * dựng lại pipeline từ đầu như bản voicebox phải làm (họ không có sẵn 1 tab "Sinh giọng" độc
 * lập để tái dùng).
 *
 * **Ngôn ngữ — CHỈ hiện khi engine multilingual (Qwen), không phải mọi lúc như voicebox**:
 * VieNeu gắn ngôn ngữ vào CHÍNH giọng (2 bộ preset riêng `voice-ref/vi-VN`/`voice-ref/en-US`,
 * xem voice_catalog.py), không cần chọn tách rời. Qwen thì khác — 1 giọng clone nói được cả 10
 * ngôn ngữ (`engine_qwen.py`'s `SUPPORTED_LANGUAGES`), và auto-guess theo Unicode script
 * (`_guess_language`) LUÔN SAI cho de/fr/pt/es/it (mọi chữ Latin đều rơi về "English" nếu
 * không chỉ định tay) — chọn tay ở đây ảnh hưởng THẬT tới chất lượng, không phải chỉ tiện lợi.
 *
 * **"Engine" chỉ hiện nhãn, KHÔNG đổi được tại đây**: đổi engine ở sky-app là thao tác NẶNG,
 * TOÀN CỤC cho cả tiến trình Python (tải lại model, ảnh hưởng cả phần đang chạy thật cho buổi
 * lễ nếu có) — khác voicebox trình bày như 1 dropdown nhẹ theo từng lần sinh. Đổi engine vẫn
 * phải qua màn "Quản lý engine" riêng, không lồng vào ô sinh nhanh này.
 *
 * State (text/voice/preset/language) CỐ Ý cục bộ, KHÔNG dùng chung state của
 * `useTtsStudioStore` (`text`/`selectedVoiceId`/`selectedPresetId`/`engineOverrides`) — gõ/chọn
 * ở đây không nên làm đổi nội dung đang soạn dở ở tab "Sinh giọng". Chỉ đọc `voices` (danh
 * sách, đã tải sẵn lúc mount `TtsStudioApp`) — không tải lại.
 */
export function FloatingGenerateBox({
  storyId, storyPort, ttsPort, effectPresetPort, track, onAdded, bottomOffset,
}: FloatingGenerateBoxProps) {
  const voices = useTtsStudioStore((s) => s.voices);
  const [text, setText] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [presetId, setPresetId] = useState('');
  const [presets, setPresets] = useState<EffectPreset[]>([]);
  const [language, setLanguage] = useState('');
  const [capabilities, setCapabilities] = useState<Record<string, any> | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    effectPresetPort?.list().then(setPresets).catch(() => {});
  }, [effectPresetPort]);

  useEffect(() => {
    ttsPort.getEngineCapabilities?.().then(setCapabilities).catch(() => {});
  }, [ttsPort]);

  const engineId: string | undefined = capabilities?.id;
  const engineLabel: string | undefined = capabilities?.label ?? engineId;
  const languages: string[] = capabilities?.multilingual ? capabilities.supported_languages || [] : [];

  const effectiveVoiceId = voiceId || voices.find((v) => v.default)?.id || voices[0]?.id || '';
  const disabled = generating || !text.trim() || !effectiveVoiceId;

  const handleGenerate = async () => {
    if (disabled) return;
    setGenerating(true);
    setError(null);
    try {
      const effectsChain: EffectConfig[] | undefined = presetId
        ? presets.find((p) => p.id === presetId)?.effectsChain
        : undefined;
      const engineOverrides = language && engineId ? { [engineId]: { language } } : undefined;
      const result = await ttsPort.synthesizeBuffer(text.trim(), {
        voiceId: effectiveVoiceId, effectsChain, engine_overrides: engineOverrides,
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
      className="absolute inset-x-2 z-10 flex items-center gap-1.5 rounded-xl border border-border bg-popover/95 p-1.5 shadow-lg backdrop-blur"
      style={{ bottom: bottomOffset + 8 }}
    >
      <select
        value={effectiveVoiceId}
        onChange={(e) => setVoiceId(e.target.value)}
        className="w-24 shrink-0 rounded-lg border border-border bg-card px-1.5 py-1.5 text-2xs"
      >
        {voices.length === 0 && <option value="">Chưa có giọng</option>}
        {voices.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>
      {engineLabel && (
        <span
          title="Engine đang dùng — đổi qua &quot;Quản lý engine&quot;, không đổi được tại đây"
          className="hidden shrink-0 rounded-lg border border-border bg-card px-1.5 py-1.5 text-2xs text-muted-foreground sm:block"
        >
          {engineLabel}
        </span>
      )}
      {languages.length > 0 && (
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          title="Engine đa ngôn ngữ — chọn tay tránh đoán nhầm (đặc biệt sai với de/fr/pt/es/it)"
          className="hidden w-20 shrink-0 rounded-lg border border-border bg-card px-1.5 py-1.5 text-2xs lg:block"
        >
          <option value="">Tự đoán</option>
          {languages.map((lang) => <option key={lang} value={lang}>{lang}</option>)}
        </select>
      )}
      {effectPresetPort && presets.length > 0 && (
        <select
          value={presetId}
          onChange={(e) => setPresetId(e.target.value)}
          className="hidden w-24 shrink-0 rounded-lg border border-border bg-card px-1.5 py-1.5 text-2xs md:block"
        >
          <option value="">Không hiệu ứng</option>
          {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !disabled) void handleGenerate(); }}
        placeholder="Gõ văn bản, sinh xong tự thêm vào Story..."
        className="min-w-0 flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-2xs outline-none focus:border-primary"
      />
      <button
        type="button"
        onClick={() => void handleGenerate()}
        disabled={disabled}
        title={error ?? undefined}
        className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-2xs text-primary-foreground hover:opacity-90 disabled:opacity-40"
      >
        {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        Sinh & Thêm
      </button>
      {error && (
        <p className="absolute -top-6 left-0 right-0 truncate text-2xs text-destructive">{error}</p>
      )}
    </div>
  );
}
