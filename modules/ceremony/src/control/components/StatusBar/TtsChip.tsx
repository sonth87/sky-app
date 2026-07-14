import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import type { SlideApi } from '@sky-app/slide-shared';
import { useControlStore } from '../../store';
import { useVoiceCatalog } from '../VoicePickerPopover';
import { useSlide } from '../../lib/slide';
import { Dot } from './Dot';
import { StatusPopover } from './StatusPopover';
import { StatRow } from './statusRow';

type TtsDebug = Awaited<ReturnType<SlideApi['getTtsDebug']>>;

export function TtsChip({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const pythonStatus = useControlStore((s) => s.pythonStatus);
  const pythonStatusDetail = useControlStore((s) => s.pythonStatusDetail);
  const ttsModel = useControlStore((s) => s.ttsModel);
  const ttsEnabled = useControlStore((s) => s.ttsEnabled);
  const voiceCatalog = useVoiceCatalog();
  const voiceLabel = voiceCatalog.find((v) => v.id === ttsModel)?.label ?? ttsModel;
  const [debug, setDebug] = useState<TtsDebug | null>(null);
  const [loadingDebug, setLoadingDebug] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);

  const dotColor = pythonStatus === 'ready' ? 'green' : pythonStatus === 'error' ? 'red' : 'yellow';
  const statusLabel =
    pythonStatus === 'ready'
      ? t('statusBar.tts.ready')
      : pythonStatus === 'error'
        ? t('statusBar.tts.errorShort')
        : t('statusBar.tts.starting');

  const isUnhealthy = pythonStatus !== 'ready';

  const slide = useSlide('tts-debug');

  const fetchDebug = async () => {
    if (!slide) return;
    setLoadingDebug(true);
    try {
      setDebug(await slide.getTtsDebug());
    } finally {
      setLoadingDebug(false);
    }
  };

  const handleRestart = async () => {
    if (!slide) return;
    setRestarting(true);
    setDebug(null);
    try {
      await slide.restartTts();
    } finally {
      setRestarting(false);
    }
  };

  // Khi mở popover: tự động làm mới debug info và mở rộng log mặc định nếu chưa ready
  useEffect(() => {
    if (open) {
      if (isUnhealthy) {
        fetchDebug();
        setShowLog(true);
      }
    } else {
      setDebug(null);
      setShowLog(false);
      setVisibleCount(20);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling tự động khi popover đang mở và TTS chưa ready để hiển thị log khởi động thời gian thực
  useEffect(() => {
    if (!open || !isUnhealthy) return;
    const intervalId = setInterval(() => {
      fetchDebug();
    }, 1500);
    return () => clearInterval(intervalId);
  }, [open, isUnhealthy]);

  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 px-2 hover:bg-muted h-full transition-colors"
        title={t('statusBar.tts.engineTooltip')}
      >
        <Dot color={dotColor} />
        <span>{statusLabel}</span>
      </button>

      <StatusPopover open={open} onClose={onToggle} className="right-0 min-w-[450px] max-w-[450px]">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="font-semibold text-foreground">TTS Engine · VieNeu</span>
          <button
            onClick={handleRestart}
            disabled={restarting || pythonStatus === 'starting'}
            title={t('statusBar.tts.restartTooltip')}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-xxs font-medium bg-muted text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {restarting ? (
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"
                />
              </svg>
            ) : (
              <svg
                className="h-3 w-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            )}
            {restarting ? t('statusBar.tts.restarting') : t('statusBar.tts.restart')}
          </button>
        </div>

        {/* Trạng thái chính */}
        <div className="px-3 py-2 space-y-1">
          <div className="flex gap-3 leading-relaxed items-start select-text">
            <div className="flex items-center gap-1 text-muted-foreground shrink-0 w-24 select-none">
              <span>{t('statusBar.tts.status')}</span>
              <div className="group relative flex items-center cursor-help">
                <Info className="h-3 w-3 text-muted-foreground hover:text-foreground shrink-0" />
                <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 w-48 -translate-x-1/2 rounded bg-foreground p-2 text-2xs leading-normal text-background opacity-0 transition-opacity duration-200 group-hover:opacity-100 shadow-lg z-50 whitespace-normal text-center font-normal">
                  {t('statusBar.tts.statusTooltip')}
                  <div className="absolute top-full left-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-0.5 rotate-45 bg-foreground" />
                </div>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-between select-text">
              <span
                className={`${
                  pythonStatus === 'ready'
                    ? 'text-success'
                    : pythonStatus === 'error'
                      ? 'text-destructive'
                      : 'text-warning'
                } break-words font-medium`}
              >
                {pythonStatus === 'ready'
                  ? `✓ ${t('statusBar.tts.ready')}`
                  : pythonStatus === 'error'
                    ? `✗ ${t('statusBar.tts.error')}`
                    : `⏳ ${t('statusBar.tts.starting')}`}
              </span>
              {(isUnhealthy || (debug && debug.recentStderr.length > 0)) && (
                <button
                  onClick={() => setShowLog((v) => !v)}
                  className="flex items-center gap-0.5 text-2xs text-info hover:text-info font-medium select-none"
                  title={t('statusBar.tts.viewLogTooltip')}
                >
                  {showLog ? '▲' : '▼'}
                </button>
              )}
            </div>
          </div>
          {pythonStatusDetail && (
            <StatRow
              label={t('statusBar.tts.detail')}
              value={pythonStatusDetail}
              tooltip={t('statusBar.tts.detailTooltip')}
            />
          )}
          <StatRow
            label="Engine"
            value="VieNeu-TTS v3 Turbo (ONNX/CPU)"
            tooltip={t('statusBar.tts.engineDescTooltip')}
          />
          <StatRow
            label={t('statusBar.tts.voice')}
            value={voiceLabel}
            tooltip={t('statusBar.tts.voiceTooltip')}
          />
          <StatRow
            label={t('statusBar.tts.enabled')}
            value={ttsEnabled ? t('statusBar.tts.yes') : t('statusBar.tts.off')}
            tooltip={t('statusBar.tts.enabledTooltip')}
          />
        </div>

        {/* Debug info — luôn hiện khi không ready, hoặc sau khi bấm Debug */}
        <div className="border-t border-border px-3 py-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Debug
            </span>
            <button
              onClick={fetchDebug}
              disabled={loadingDebug}
              className="text-2xs text-muted-foreground hover:text-foreground underline disabled:opacity-50"
            >
              {loadingDebug ? t('statusBar.tts.loading') : t('statusBar.tts.refresh')}
            </button>
          </div>

          {loadingDebug && !debug && (
            <p className="text-xxs text-muted-foreground italic">{t('statusBar.tts.checking')}</p>
          )}

          {debug && (
            <div className="space-y-1">
              <StatRow
                label="Process"
                value={debug.processAlive ? `✓ Alive (PID ${debug.processPid})` : `✗ ${t('statusBar.tts.notRunning')}`}
                accent={debug.processAlive ? 'green' : 'red'}
                tooltip={t('statusBar.tts.processTooltip')}
              />
              <StatRow
                label="Port"
                value={String(debug.port)}
                tooltip={t('statusBar.tts.portTooltip')}
              />
              <StatRow
                label="Health"
                value={
                  debug.healthOk === true
                    ? '✓ OK'
                    : debug.healthOk === false
                      ? `✗ ${t('statusBar.tts.noResponse')}`
                      : '—'
                }
                accent={debug.healthOk ? 'green' : 'red'}
                tooltip={t('statusBar.tts.healthTooltip')}
              />
              {debug.lastStartupError && (
                <StatRow
                  label={t('statusBar.tts.errorLabel')}
                  value={debug.lastStartupError}
                  accent="red"
                  tooltip={t('statusBar.tts.errorLabelTooltip')}
                />
              )}
              {debug.lastExitCode !== null && (
                <StatRow
                  label="Exit code"
                  value={String(debug.lastExitCode)}
                  accent={debug.lastExitCode === 0 ? 'green' : 'red'}
                  tooltip={t('statusBar.tts.exitCodeTooltip')}
                />
              )}

              {/* Stderr — luôn mở rộng nếu có lỗi */}
              {debug.recentStderr.length > 0 ? (
                <div>
                  <button
                    onClick={() => setShowLog((v) => !v)}
                    className="text-2xs text-muted-foreground hover:text-foreground underline"
                  >
                    {showLog ? t('statusBar.tts.hide') : t('statusBar.tts.view')} {t('statusBar.tts.logStderrLines', { count: debug.recentStderr.length })}
                  </button>
                  {(showLog || isUnhealthy) && (
                    <div className="mt-1 max-h-80 overflow-y-auto rounded bg-foreground p-2 text-3xs leading-relaxed font-mono select-text space-y-px">
                      {debug.recentStderr.map((line, i) => {
                        const isError = /error|exception|traceback|critical/i.test(line);
                        const isWarn = /warn/i.test(line);
                        const isVieNeu = line.includes('[VieNeu');
                        const cls = isError
                          ? 'text-destructive'
                          : isWarn
                            ? 'text-warning'
                            : isVieNeu
                              ? 'text-info'
                              : 'text-muted-foreground';
                        return (
                          <div key={i} className={`${cls} whitespace-pre-wrap break-all`}>
                            {line}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <StatRow label="Stderr" value={t('statusBar.tts.noLog')} />
              )}

              {/* Activity log — chỉ hiện khi ready */}
              {!isUnhealthy && (
                <div>
                  <button
                    onClick={() => setShowLog((v) => !v)}
                    className="text-2xs text-muted-foreground hover:text-foreground underline"
                  >
                    {showLog ? t('statusBar.tts.hide') : t('statusBar.tts.view')} {t('statusBar.tts.activityLogEvents', { count: debug.activityLog.length })}
                  </button>
                  {showLog && (
                    <div className="mt-1 rounded bg-foreground p-2 font-mono text-3xs leading-relaxed">
                      {debug.activityLog.length === 0 ? (
                        <span className="text-muted-foreground">{t('statusBar.tts.noEvents')}</span>
                      ) : (
                        <>
                          <div className="max-h-48 overflow-y-auto">
                            {debug.activityLog.slice(0, visibleCount).map((e, i) => (
                              <div key={i} className={e.ok ? 'text-success' : 'text-destructive'}>
                                <span className="text-muted-foreground">{e.time}</span>{' '}
                                <span
                                  className={
                                    e.action === 'speak' ? 'text-info' : 'text-warning'
                                  }
                                >
                                  [{e.action}]
                                </span>{' '}
                                {e.ok ? '✓' : '✗'}
                                {e.cacheHit ? ' 💾' : ''}{' '}
                                <span className="text-background">"{e.text}"</span>{' '}
                                <span className="text-muted-foreground">
                                  {e.model} {e.durationMs}ms
                                </span>
                                {e.error ? (
                                  <span className="text-destructive"> → {e.error}</span>
                                ) : null}
                              </div>
                            ))}
                          </div>
                          {visibleCount < debug.activityLog.length && (
                            <button
                              onClick={() => setVisibleCount((n) => n + 20)}
                              className="mt-1 text-3xs text-muted-foreground hover:text-muted-foreground underline"
                            >
                              {t('statusBar.tts.loadMore', { count: debug.activityLog.length - visibleCount })}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!debug && !loadingDebug && pythonStatus === 'ready' && (
            <button
              onClick={fetchDebug}
              className="text-2xs text-muted-foreground hover:text-foreground underline"
            >
              🔍 {t('statusBar.tts.viewDebugInfo')}
            </button>
          )}
        </div>
      </StatusPopover>
    </div>
  );
}
