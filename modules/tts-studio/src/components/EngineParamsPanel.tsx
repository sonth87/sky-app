import type { TtsEnginePort } from '@sky-app/service-contracts';
import { useTtsStudioStore } from '../store';
import { useTtsEngines } from '../lib/useTtsEngines';
import { LanguageSelect } from './LanguageSelect';

export interface EngineParamsPanelProps {
  enginePort?: TtsEnginePort;
}

export function EngineParamsPanel({ enginePort }: EngineParamsPanelProps) {
  const [ttsEngines] = useTtsEngines(enginePort);
  const engineOverrides = useTtsStudioStore((s) => s.engineOverrides);
  const updateEngineOverride = useTtsStudioStore((s) => s.updateEngineOverride);

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
                <label htmlFor={paramName} className="text-xs truncate capitalize">
                  {paramName.replace(/_/g, ' ')}
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
