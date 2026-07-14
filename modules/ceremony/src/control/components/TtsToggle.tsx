import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useControlStore } from '../store';
import { useSocketRef } from '../SocketContext';
import { ToolbarGroup } from './ToolbarGroup';
import { useVoiceCatalog, VoicePickerPopover } from './VoicePickerPopover';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function TtsToggle() {
  const { t } = useTranslation();
  const voiceCatalog = useVoiceCatalog();
  const socket = useSocketRef();
  const enabled  = useControlStore((s) => s.ttsEnabled);
  const model    = useControlStore((s) => s.ttsModel);
  const speed    = useControlStore((s) => s.ttsSpeed);
  const delay    = useControlStore((s) => s.ttsDelay);
  const prefix   = useControlStore((s) => s.ttsSentencePrefix);
  const conditions = useControlStore((s) => s.ttsConditions || []);
  const openSettingsModal = useControlStore((s) => s.openSettingsModal);
  // Khi có bộ điều kiện phân giọng → giọng đọc do menu Cấu hình TTS quyết định,
  // chọn ở toolbar không có tác dụng nên khóa lại để tránh hiểu nhầm.
  const multiVoiceMode = conditions.length > 0;
  const {
    setTtsEnabled, setTtsModel, setTtsSpeed,
    setTtsDelay, setTtsSentencePrefix,
  } = useControlStore();

  const [localPrefix, setLocalPrefix] = useState(prefix);

  const emit = (ev: string, payload: object) => socket.current?.emit(ev as any, payload);

  const toggle = (next: boolean) => {
    setTtsEnabled(next);
    emit('cmd:setTts', { enabled: next });
  };
  const changeModel = (m: string) => {
    setTtsModel(m);
    emit('cmd:setTtsModel', { model: m });
  };
  const changeSpeed = (v: number) => {
    setTtsSpeed(v);
    emit('cmd:setTtsSpeed', { speed: v });
  };
  const changeDelay = (v: number) => {
    setTtsDelay(v);
    emit('cmd:setTtsDelay', { delay: v });
  };
  const commitPrefix = () => {
    const val = localPrefix.trim();
    setTtsSentencePrefix(val);
    emit('cmd:setTtsSentencePrefix', { prefix: val });
  };

  const voiceLabel = multiVoiceMode
    ? t('ttsToggle.byConfig')
    : (voiceCatalog.find((o) => o.id === model)?.label ?? 'TTS');

  return (
    <ToolbarGroup icon="🔊" label={enabled ? voiceLabel : 'TTS'} active={enabled}>
      {(close) => (
      <div className="flex w-80 flex-col gap-3 p-3">
        {/* Bật/tắt */}
        <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => toggle(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-indigo-600"
          />
          {t('ttsToggle.enableTts')}
        </label>

        {enabled && (
          <div className="flex flex-col gap-3 border-t border-border pt-3">
            {/* Giọng đọc */}
            <Row label={t('ttsToggle.voiceLabel')}>
              {multiVoiceMode ? (
                <button
                  type="button"
                  onClick={() => { close(); openSettingsModal('tts'); }}
                  title={t('ttsToggle.multiVoiceTooltip')}
                  className="flex w-full items-center justify-between gap-1.5 rounded border border-accent bg-accent/60 px-2 py-1.5 text-sm text-accent-foreground transition-colors hover:border-accent hover:bg-accent"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="text-accent-foreground">⚙️</span>
                    <span className="font-medium truncate">{t('ttsToggle.multiVoiceLabel')}</span>
                  </span>
                  <span className="text-accent-foreground text-xs flex-shrink-0">{t('ttsToggle.open')}</span>
                </button>
              ) : (
                <VoicePickerPopover value={model} onChange={changeModel} compact />
              )}
            </Row>

            {/* Tốc độ */}
            <Row label={t('ttsToggle.speedLabel', { speed: speed.toFixed(1) })}>
              <input
                type="range" min="0.5" max="1.5" step="0.1"
                value={speed}
                onChange={(e) => changeSpeed(parseFloat(e.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded bg-muted accent-indigo-600"
              />
            </Row>

            {/* Delay */}
            <Row label={t('ttsToggle.delayLabel', { delay: delay.toFixed(1) })}>
              <input
                type="range" min="0" max="5" step="0.5"
                value={delay}
                onChange={(e) => changeDelay(parseFloat(e.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded bg-muted accent-indigo-600"
              />
            </Row>

            {/* Câu bắt đầu */}
            <Row label={t('ttsToggle.startSentenceLabel')}>
              <input
                type="text"
                value={localPrefix}
                onChange={(e) => setLocalPrefix(e.target.value)}
                onBlur={commitPrefix}
                onKeyDown={(e) => e.key === 'Enter' && commitPrefix()}
                placeholder={t('ttsToggle.startSentencePlaceholder') as string}
                className="w-full rounded border border-border px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </Row>
          </div>
        )}
      </div>
      )}
    </ToolbarGroup>
  );
}
