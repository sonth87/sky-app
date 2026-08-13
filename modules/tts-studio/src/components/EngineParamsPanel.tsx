import { useEffect, useState } from 'react';
import type { TtsPort } from '@sky-app/service-contracts';
import { useTtsStudioStore } from '../store';

export interface EngineParamsPanelProps {
  ttsPort?: TtsPort;
}

export function EngineParamsPanel({ ttsPort }: EngineParamsPanelProps) {
  const [capabilities, setCapabilities] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);
  const engineOverrides = useTtsStudioStore((s) => s.engineOverrides);
  const updateEngineOverride = useTtsStudioStore((s) => s.updateEngineOverride);

  useEffect(() => {
    if (!ttsPort?.getEngineCapabilities) return;
    setLoading(true);
    ttsPort.getEngineCapabilities()
      .then(setCapabilities)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [ttsPort]);

  if (!capabilities || !capabilities.supports_sampling) {
    return null;
  }

  const samplingParams = capabilities.sampling_params || {};
  const engineId = capabilities.id || 'unknown';
  const currentOverrides = engineOverrides[engineId] || {};

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="text-xs font-semibold text-secondary">Engine Parameters</div>
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
    </div>
  );
}
