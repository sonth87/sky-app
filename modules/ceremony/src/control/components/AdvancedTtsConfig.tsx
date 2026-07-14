import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Play } from 'lucide-react';
import { InfoTip } from './InfoTip';
import type { TtsConfig } from '@sky-app/slide-shared';

interface ParamDef {
  key: keyof TtsConfig['infer'];
  labelKey: string;
  min: number;
  max: number;
  step: number;
  tipKey: string;
}

// Mô tả từng tham số — viết cho người vận hành KHÔNG rành ML: nói tác dụng thực tế
// trước, khuyến nghị rõ, chỉ nhắc tên kỹ thuật ở cuối để ai muốn tra thì có.
const PARAMS: ParamDef[] = [
  { key: 'temperature', labelKey: 'temperature', min: 0.05, max: 1.5, step: 0.05, tipKey: 'temperature' },
  { key: 'top_k', labelKey: 'topK', min: 1, max: 100, step: 1, tipKey: 'topK' },
  { key: 'top_p', labelKey: 'topP', min: 0.1, max: 1.0, step: 0.05, tipKey: 'topP' },
  { key: 'repetition_penalty', labelKey: 'repetitionPenalty', min: 1.0, max: 2.0, step: 0.05, tipKey: 'repetitionPenalty' },
];

// Preset nhanh.
const PRESET_KEYS = ['safe', 'default', 'experimental'] as const;
const PRESETS: Record<(typeof PRESET_KEYS)[number], Partial<TtsConfig['infer']>> = {
  safe:         { temperature: 0.1, top_k: 5,  top_p: 0.95, repetition_penalty: 1.3 },
  default:      { temperature: 0.8, top_k: 25, top_p: 0.95, repetition_penalty: 1.2 },
  experimental: { temperature: 0.4, top_k: 15, top_p: 0.95, repetition_penalty: 1.25 },
};

interface Props {
  /** Nghe thử với config hiện tại — parent cung cấp (dùng previewStudent + speak). */
  onPreview?: (infer: TtsConfig['infer']) => void;
  previewDisabled?: boolean;
}

export function AdvancedTtsConfig({ onPreview, previewDisabled }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<TtsConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load config khi mở lần đầu.
  useEffect(() => {
    if (!open || config) return;
    setLoading(true);
    window.slide?.getTtsConfig?.().then((c) => {
      if (c) setConfig(c);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [open, config]);

  const persist = useCallback((infer: TtsConfig['infer']) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const res = await window.slide?.setTtsConfig?.({ infer });
      if (res?.ok && res.config) {
        setConfig(res.config);
        setSavedAt(Date.now());
      }
    }, 400);
  }, []);

  const setParam = (key: keyof TtsConfig['infer'], value: number) => {
    if (!config) return;
    const next = { ...config, infer: { ...config.infer, [key]: value } };
    setConfig(next);
    persist(next.infer);
  };

  const applyPreset = (name: (typeof PRESET_KEYS)[number]) => {
    if (!config) return;
    const merged = { ...config.infer, ...PRESETS[name] };
    const next = { ...config, infer: merged };
    setConfig(next);
    persist(merged);
  };

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-sm-13 font-semibold text-foreground hover:text-primary"
      >
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        {t('advancedTtsConfig.title')}
        <span className="text-2xs font-normal text-muted-foreground">({t('advancedTtsConfig.subtitle')})</span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 pl-1 pt-1">
          {loading && <p className="text-xs text-muted-foreground">{t('advancedTtsConfig.loadingConfig')}</p>}

          {config && (
            <>
              {/* Preset nhanh */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xxs text-muted-foreground">{t('advancedTtsConfig.presetLabel')}</span>
                {PRESET_KEYS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => applyPreset(name)}
                    className="text-xxs px-2 py-0.5 rounded-md border border-border text-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/50"
                  >
                    {t(`advancedTtsConfig.presets.${name}`)}
                  </button>
                ))}
              </div>

              {/* Slider từng tham số */}
              {PARAMS.map((p) => {
                const val = config.infer[p.key] as number;
                return (
                  <div key={p.key} className="flex flex-col gap-1">
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-foreground flex items-center gap-1">
                        {t(`advancedTtsConfig.params.${p.labelKey}.label`)} <InfoTip text={t(`advancedTtsConfig.params.${p.tipKey}.tip`)} />
                      </label>
                      <span className="text-xxs font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                        {typeof val === 'number' ? val.toFixed(p.step < 1 ? 2 : 0) : '—'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={p.min} max={p.max} step={p.step}
                      value={val ?? p.min}
                      onChange={(e) => setParam(p.key, parseFloat(e.target.value))}
                      className="w-full h-1.5 cursor-pointer appearance-none rounded bg-muted accent-indigo-600"
                    />
                  </div>
                );
              })}

              {/* max_new_frames: input số + tùy chọn auto */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-foreground flex items-center gap-1">
                  {t('advancedTtsConfig.maxFrames.label')}
                  <InfoTip text={t('advancedTtsConfig.maxFrames.tip')} />
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={40} max={800} placeholder={t('advancedTtsConfig.maxFrames.placeholder') as string}
                    value={config.infer.max_new_frames ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      const v = raw === '' ? null : Math.max(40, Math.min(800, parseInt(raw, 10) || 40));
                      const next = { ...config, infer: { ...config.infer, max_new_frames: v } };
                      setConfig(next);
                      persist(next.infer);
                    }}
                    className="w-28 text-xs px-2 py-1 rounded-md border border-border focus:border-primary/40 outline-none"
                  />
                  <span className="text-2xs text-muted-foreground">{t('advancedTtsConfig.maxFrames.emptyMeansAuto')}</span>
                </div>
              </div>

              {/* Nghe thử + trạng thái lưu */}
              <div className="flex items-center gap-3 pt-1">
                {onPreview && (
                  <button
                    type="button"
                    disabled={previewDisabled}
                    onClick={() => onPreview(config.infer)}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Play size={12} /> {t('advancedTtsConfig.preview')}
                  </button>
                )}
                {savedAt && (
                  <span className="text-2xs text-success">{t('advancedTtsConfig.saved')}</span>
                )}
              </div>
              <p className="text-2xs text-muted-foreground italic">
                {t('advancedTtsConfig.footnote')}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
