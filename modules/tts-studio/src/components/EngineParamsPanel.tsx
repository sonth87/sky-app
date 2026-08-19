import { Info } from 'lucide-react';
import type { TtsEnginePort } from '@sky-app/service-contracts';
import { LanguageSelect, toVietnameseLanguageLabel, useTtsEngines } from '@sky-app/tts-generation-ui';
import { useTtsStudioStore } from '../store';

export interface EngineParamsPanelProps {
  enginePort?: TtsEnginePort;
}

// Mô tả từng tham số sampling — hiện qua icon info cạnh label, native `title` tooltip (đúng mẫu
// đã dùng nhất quán toàn phiên, không cần thêm thư viện Tooltip). Key khớp `sampling_params` do
// Python khai (`engine.py`'s capabilities()) — tham số lạ (server thêm sau) không có mô tả thì
// bỏ qua icon, không đoán bừa.
const PARAM_DESCRIPTIONS: Record<string, string> = {
  temperature: 'Độ ngẫu nhiên khi sinh giọng — thấp hơn cho giọng ổn định/đều hơn, cao hơn cho biến hoá tự nhiên hơn nhưng dễ lệch.',
  top_k: 'Giới hạn số lựa chọn có xác suất cao nhất được xét ở mỗi bước — nhỏ hơn an toàn hơn, lớn hơn đa dạng hơn.',
  top_p: 'Chỉ xét nhóm lựa chọn có tổng xác suất tới ngưỡng này (nucleus sampling), thay vì đếm số lượng cố định như Top K.',
  repetition_penalty: 'Phạt các âm/từ đã lặp lại — cao hơn giảm lặp nhưng quá cao dễ khiến giọng đọc bất thường.',
  max_new_frames: 'Giới hạn độ dài audio tối đa được sinh — để trống sẽ tự tính theo độ dài văn bản.',
};

export function EngineParamsPanel({ enginePort }: EngineParamsPanelProps) {
  const [ttsEngines] = useTtsEngines(enginePort);
  const engineOverrides = useTtsStudioStore((s) => s.engineOverrides);
  const updateEngineOverride = useTtsStudioStore((s) => s.updateEngineOverride);
  const voices = useTtsStudioStore((s) => s.voices);
  const selectedVoiceId = useTtsStudioStore((s) => s.selectedVoiceId);
  const selectedVoiceLanguage = voices.find((v) => v.id === selectedVoiceId)?.language;

  const capabilities = ttsEngines?.current_capabilities;
  if (!capabilities) return null;

  const samplingParams = capabilities.supports_sampling ? capabilities.sampling_params || {} : {};
  // Engine multilingual (vd Qwen — 1 giọng clone nói được nhiều ngôn ngữ) — auto-guess theo
  // Unicode script (`_guess_language`) chỉ phân biệt được CJK/Cyrillic, MỌI chữ Latin
  // (de/fr/pt/es/it) đều rơi nhầm về "English" nếu không chỉ định tay, xem
  // engine_qwen.py's docstring. Danh sách ngôn ngữ đọc từ server (`supported_languages`),
  // KHÔNG hardcode lại — tránh lệch nếu server đổi.
  const languages: string[] = capabilities.multilingual ? capabilities.supported_languages || [] : [];
  const engineId = capabilities.id || 'unknown';
  const currentOverrides = engineOverrides[engineId] || {};
  const isVieneu = engineId === 'vieneu';

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="text-xs font-semibold text-secondary">Engine Parameters</div>

      <div className="flex items-center justify-between gap-2">
        <label className="text-xs">Ngôn ngữ</label>
        <LanguageSelect
          languages={languages}
          value={currentOverrides.language ?? ''}
          onChange={(lang) => updateEngineOverride(engineId, 'language', lang || undefined)}
          disabled={isVieneu}
          disabledReason="VieNeu tự gắn ngôn ngữ theo giọng đã chọn (2 bộ preset vi-VN/en-US riêng), không cần chọn ở đây."
          currentLanguageLabel={toVietnameseLanguageLabel(selectedVoiceLanguage)}
        />
      </div>

      {Object.keys(samplingParams).length > 0 && (
        <div className="space-y-2">
          {Object.entries(samplingParams).map(([paramName, paramInfo]: [string, any]) => {
            const value = currentOverrides[paramName] ?? paramInfo.default;
            const min = paramInfo.min ?? 0;
            const max = paramInfo.max ?? 100;
            const step = paramInfo.step ?? 0.01;

            return (
              <div key={paramName} className="flex items-center justify-between gap-2">
                <label htmlFor={paramName} className="flex min-w-0 items-center gap-1 text-xs truncate capitalize">
                  {paramName.replace(/_/g, ' ')}
                  {PARAM_DESCRIPTIONS[paramName] && (
                    <span title={PARAM_DESCRIPTIONS[paramName]} className="shrink-0 text-muted-foreground">
                      <Info size={11} />
                    </span>
                  )}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id={paramName}
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value ?? min}
                    onChange={(e) => updateEngineOverride(engineId, paramName, parseFloat(e.target.value))}
                    className="h-1 w-20 cursor-pointer"
                  />
                  <span className="w-12 text-right text-xs tabular-nums">
                    {typeof value === 'number' ? value.toFixed(2) : value}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
