import { useEffect, useState, type ReactNode, type CSSProperties } from 'react';
import type { EffectConfig, EffectPresetPort, TtsEnginePort, TtsPort } from '@sky-app/service-contracts';
import { useTtsEngines } from './useTtsEngines.js';
import { useEffectPresets } from './useEffectPresets.js';
import { toVietnameseLanguageLabel } from './languageLabel.js';
import { LanguageSelect } from './LanguageSelect.js';
import { EffectsSelect } from './EffectsSelect.js';
import { ModelSelect } from './ModelSelect.js';
import { GenerateButton } from './GenerateButton.js';

// Cả 3 select (Language/Model/Effects) dùng ĐÚNG 1 bộ padding+cỡ chữ — đồng đều chiều cao, khớp
// `compact` mode của VoicePickerCombobox (`px-2 py-1.5 text-sm`) mà `voicePicker` slot thường dùng.
const SELECT_CLASS = 'h-9 min-w-0 flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40';

export interface GenerateBoxResult {
  historyId?: string;
  buffer: ArrayBuffer;
  sampleRate: number;
}

export interface GenerateBoxProps {
  ttsPort: TtsPort;
  enginePort?: TtsEnginePort;
  /** Vắng mặt ở môi trường không có kho preset — dropdown hiệu ứng tự ẩn. */
  effectPresetPort?: EffectPresetPort;
  /** Slot chọn giọng — app nhúng tự nhét component chọn giọng CỦA MÌNH vào (vd wrapper quanh
   *  `VoicePickerCombobox` của `@sky-app/voice-catalog-ui`) — `GenerateBox` không biết gì về
   *  shape voice list hay nơi lưu lựa chọn, chỉ cần biết ID/ngôn ngữ giọng đang chọn qua 2 prop
   *  dưới. Được bọc trong 1 flex item co giãn — component gốc nên tự `w-full` bên trong. */
  voicePicker: ReactNode;
  selectedVoiceId: string | null;
  /** Ngôn ngữ THẬT của giọng đang chọn (vd "Vietnamese") — hiện làm nhãn khi Ngôn ngữ bị
   *  disable (engine không multilingual, vd VieNeu), qua `toVietnameseLanguageLabel`. */
  selectedVoiceLanguage?: string;
  /** Gọi sau khi synthesize xong — nơi dùng tự quyết định làm gì với kết quả (thêm vào Story,
   *  lưu lịch sử, phát ngay...). `GenerateBox` không tự làm gì khác ngoài gọi callback này. */
  onGenerated: (result: GenerateBoxResult) => void | Promise<void>;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Ô "sinh giọng nói" — textarea + nút Sinh nằm CẠNH nhau (hàng 1), hàng chọn giọng/ngôn ngữ/
 * model/hiệu ứng bên dưới (hàng 2, luôn gọn 1 dòng) — bố cục theo voicebox's
 * `Generation/FloatingGenerateBox.tsx`.
 *
 * Component THUẦN (controlled) — không tự giữ state chọn giọng, không tự định vị trên màn hình
 * (`className`/`style` do nơi gọi quyết — floating/absolute/sticky/tĩnh đều được), không biết
 * kết quả sinh ra sẽ đi đâu (`onGenerated`) — để dùng lại được ở nhiều nơi khác nhau (Story
 * trong tts-studio, hoặc app khác sau này), mỗi nơi tự viết 1 lớp glue mỏng bên ngoài, đúng mẫu
 * `VoicePicker.tsx` đang bọc `VoicePickerCombobox`.
 *
 * **Model/engine đổi TRỄ**: `ModelSelect` chỉ CHỌN, chưa đổi engine thật ngay (đổi engine là
 * thao tác nặng/toàn cục, restart cả tiến trình Python) — chỉ thật sự gọi
 * `enginePort.switchEngine()` lúc bấm Sinh, nếu model chọn khác model đang chạy.
 */
export function GenerateBox({
  ttsPort, enginePort, effectPresetPort, voicePicker, selectedVoiceId, selectedVoiceLanguage,
  onGenerated, placeholder, className, style,
}: GenerateBoxProps) {
  const [text, setText] = useState('');
  const [presetId, setPresetId] = useState('');
  const [language, setLanguage] = useState('');
  const [pendingEngineId, setPendingEngineId] = useState('');
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
      await onGenerated(result);
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div
      className={`flex flex-col gap-2.5 rounded-2xl border border-border bg-popover/95 p-4 shadow-lg backdrop-blur ${className ?? ''}`}
      style={style}
    >
      <div className="flex items-start gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !disabled) void handleGenerate(); }}
          placeholder={placeholder ?? 'Nhập văn bản cần chuyển thành giọng nói... (⌘/Ctrl+Enter để sinh nhanh)'}
          rows={3}
          className="w-full flex-1 resize-none rounded-xl border-none bg-card text-sm outline-none focus:border-primary"
        />
        <GenerateButton
          generating={generating || switchingEngine}
          disabled={disabled}
          onClick={() => void handleGenerate()}
          label={switchingEngine ? 'Đang đổi model...' : 'Sinh giọng nói'}
          variant="icon"
        />
      </div>

      {error && <p className="text-2xs text-destructive">{error}</p>}

      <div className="flex flex-nowrap items-center gap-2">
        <div className="min-w-0 flex-[1.4]">{voicePicker}</div>
        <LanguageSelect
          languages={languages}
          value={language}
          onChange={setLanguage}
          disabled={isVieneu}
          disabledReason="VieNeu tự gắn ngôn ngữ theo giọng đã chọn, không cần chọn ở đây."
          currentLanguageLabel={toVietnameseLanguageLabel(selectedVoiceLanguage)}
          className={SELECT_CLASS}
        />
        {ttsEngines && ttsEngines.engines.length > 0 && (
          <ModelSelect
            engines={ttsEngines.engines}
            value={pendingEngineId}
            onChange={setPendingEngineId}
            className={SELECT_CLASS}
          />
        )}
        {presets.length > 0 && (
          <EffectsSelect
            presets={presets}
            value={presetId}
            onChange={setPresetId}
            className={SELECT_CLASS}
          />
        )}
      </div>
    </div>
  );
}
