import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { type CanonicalRecord, type TtsCondition, type CustomVariable } from '@sky-app/slide-shared';
import { VoicePickerPopover } from '../VoicePickerPopover';
import { TemplateEditor } from '../TemplateEditor';
import { AdvancedTtsConfig } from '../AdvancedTtsConfig';
import { DeviceConfig } from '../DeviceConfig';
import { playPcm } from '../../../lib/audio';
import { renderTemplate } from '../../../lib/renderTemplate';

const PLAY_MODE_OPTIONS: Array<{
  value: 'realtime' | 'pregen' | 'pregen-fallback';
  labelKey: string;
  recommended?: true;
}> = [
  { value: 'pregen-fallback', labelKey: 'pregenFallback', recommended: true },
  { value: 'realtime', labelKey: 'realtime' },
  { value: 'pregen', labelKey: 'pregen' },
];

interface ConfigColumnProps {
  localModel: string;
  onChangeModel: (val: string) => void;
  localSpeed: number;
  onChangeSpeed: (val: number) => void;
  localDelay: number;
  onChangeDelay: (val: number) => void;
  localTemplate: string;
  onChangeTemplate: (val: string) => void;
  localPlayMode: 'realtime' | 'pregen' | 'pregen-fallback';
  onChangePlayMode: (val: 'realtime' | 'pregen' | 'pregen-fallback') => void;
  localConditions: TtsCondition[];
  hasConditions: boolean;
  previewRecord: CanonicalRecord | null;
  getVoiceForStudent: (record: CanonicalRecord, conditions: TtsCondition[], fallbackVoice: string) => string;
  onOpenCloneModal: () => void;
  customVariables?: CustomVariable[];
  onManageVariables?: () => void;
}

export function ConfigColumn({
  localModel,
  onChangeModel,
  localSpeed,
  onChangeSpeed,
  localDelay,
  onChangeDelay,
  localTemplate,
  onChangeTemplate,
  localPlayMode,
  onChangePlayMode,
  localConditions,
  hasConditions,
  previewRecord,
  getVoiceForStudent,
  onOpenCloneModal,
  customVariables,
  onManageVariables,
}: ConfigColumnProps) {
  const { t } = useTranslation();
  return (
    <div className="w-[38%] p-6 overflow-y-auto flex flex-col gap-6">
      <div className="text-xs font-bold text-primary tracking-wider uppercase">{t('ttsModal.config.sectionTitle')}</div>

      {/* Giọng đọc */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm-13 font-semibold text-foreground">{t('ttsModal.config.mainVoiceLabel')}</label>
        {hasConditions ? (
          <div className="flex items-center justify-between border border-accent bg-accent/50 rounded-xl p-3 text-sm transition-all duration-200">
            <div className="flex flex-col">
              <span className="text-accent-foreground font-semibold text-xs">{t('ttsModal.config.multiVoiceActive')}</span>
              <span className="text-accent-foreground text-xxs mt-0.5">{t('ttsModal.config.multiVoiceHint')}</span>
            </div>
          </div>
        ) : (
          <VoicePickerPopover value={localModel} onChange={onChangeModel} />
        )}
        <button
          type="button"
          onClick={onOpenCloneModal}
          className="self-start flex items-center gap-1 text-xxs text-primary hover:text-primary hover:underline"
        >
          <Plus size={12} /> {t('ttsModal.config.cloneVoiceFromAudio')}
        </button>
      </div>

      {/* Tốc độ đọc & Delay TTS */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <label className="text-sm-13 font-semibold text-foreground">{t('ttsModal.config.speedLabel')}</label>
            <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">
              {localSpeed.toFixed(1)}x
            </span>
          </div>
          <input
            type="range" min="0.5" max="1.5" step="0.1" value={localSpeed}
            onChange={(e) => onChangeSpeed(parseFloat(e.target.value))}
            className="w-full h-1.5 cursor-pointer appearance-none rounded bg-muted accent-indigo-600"
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <label className="text-sm-13 font-semibold text-foreground">{t('ttsModal.config.delayLabel')}</label>
            <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">
              {localDelay.toFixed(1)}s
            </span>
          </div>
          <input
            type="range" min="0" max="5" step="0.5" value={localDelay}
            onChange={(e) => onChangeDelay(parseFloat(e.target.value))}
            className="w-full h-1.5 cursor-pointer appearance-none rounded bg-muted accent-indigo-600"
          />
        </div>
      </div>
      <p className="text-2xs text-muted-foreground italic">
        {t('ttsModal.config.delayHint')}
      </p>

      {/* Template câu đọc */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm-13 font-semibold text-foreground">{t('ttsModal.config.templateLabel')}</label>
        <TemplateEditor
          value={localTemplate}
          onChange={onChangeTemplate}
          previewRecord={previewRecord}
          voiceId={previewRecord ? getVoiceForStudent(previewRecord, localConditions, localModel) : localModel}
          speed={localSpeed}
          customVariables={customVariables}
          onManageVariables={onManageVariables}
        />
      </div>

      {/* Chế độ phát */}
      <div className="flex flex-col gap-2">
        <label className="text-sm-13 font-semibold text-foreground">{t('ttsModal.config.playModeLabel')}</label>
        <div className="flex flex-col gap-2">
          {PLAY_MODE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all duration-200 ${
                localPlayMode === opt.value
                  ? 'border-primary/30 bg-primary/40 text-primary font-medium'
                  : 'border-border hover:border-border hover:bg-muted text-foreground'
              }`}
            >
              <input
                type="radio"
                name="playMode"
                value={opt.value}
                checked={localPlayMode === opt.value}
                onChange={() => onChangePlayMode(opt.value)}
                className="mt-0.5 accent-indigo-600 focus:ring-0"
              />
              <div className="text-xs leading-relaxed flex-1">
                {t(`ttsModal.config.playModes.${opt.labelKey}`)}
                {opt.recommended && (
                  <span className="ml-2 inline-block rounded bg-success/15 px-1.5 py-0.5 text-3xs font-bold text-success uppercase tracking-wide">
                    {t('ttsModal.config.recommended')}
                  </span>
                )}
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Cấu hình chuyên sâu (advanced infer params) */}
      <AdvancedTtsConfig
        previewDisabled={!previewRecord}
        onPreview={async () => {
          // Nghe thử: đọc câu template cho SV mẫu bằng config vừa lưu (server-side).
          const text = previewRecord && localTemplate
            ? renderTemplate(localTemplate, previewRecord, customVariables)
            : (previewRecord?.full_name ?? '');
          if (!text) return;
          const voiceId = previewRecord
            ? getVoiceForStudent(previewRecord, localConditions, localModel)
            : localModel;
          const res = await window.slide?.speak?.(text, voiceId, localSpeed);
          if (res?.ok && res.buffer) {
            await playPcm(res.buffer, res.sampleRate ?? 48000);
          }
        }}
      />

      {/* Thiết bị xử lý (CPU/GPU + số luồng) */}
      <DeviceConfig />
    </div>
  );
}
