import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, Cpu, RefreshCw, Loader2, AlertTriangle, HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { InfoTip } from './InfoTip';
import { EngineManager } from './EngineManager';
import type { TtsConfig, TtsCapabilities, TtsEngines } from '@sky-app/slide-shared';

// Gói cần cài cho từng provider (chỉ bản dev). Trên máy này CoreML available nhưng
// KHÔNG chạy được VieNeu (works=false) nên không có nút cài.
const INSTALL_PACKAGE: Record<string, string> = {
  cuda: 'onnxruntime-gpu',
  directml: 'onnxruntime-directml',
};

export function DeviceConfig() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [caps, setCaps] = useState<TtsCapabilities | null>(null);
  const [engines, setEngines] = useState<TtsEngines | null>(null);
  const [config, setConfig] = useState<TtsConfig | null>(null);
  const [threads, setThreads] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState('cpu');
  const [showEngineManager, setShowEngineManager] = useState(false);
  const [showGpuHelp, setShowGpuHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [c, cfg, eng] = await Promise.all([
      window.slide?.getTtsCapabilities?.() ?? null,
      window.slide?.getTtsConfig?.() ?? null,
      window.slide?.listEngines?.() ?? null,
    ]);
    if (c) setCaps(c);
    if (eng) setEngines(eng);
    if (cfg) {
      setConfig(cfg);
      setThreads(cfg.device.threads ?? 0);
      setSelectedProvider(cfg.device.providers || 'cpu');
    }
  }, []);

  useEffect(() => {
    if (open && !caps) void load();
  }, [open, caps, load]);

  const dirty =
    config != null &&
    (threads !== (config.device.threads ?? 0) ||
      (selectedProvider || 'cpu') !== (config.device.providers || 'cpu'));

  const applyAndRestart = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const providers = selectedProvider === 'cpu' ? '' : selectedProvider;
      // Chỉ đổi device ở đây; đổi ENGINE đi qua modal Quản lý engine (có verify + rollback).
      await window.slide?.setTtsConfig?.({ device: { providers, threads } });
      await window.slide?.restartTts?.();
      setMsg(t('deviceConfig.appliedAndRestarted'));
      // Reload sau restart để cập nhật current_*.
      setTimeout(() => void load(), 1500);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const doInstall = async (pkg: string) => {
    setInstalling(pkg);
    setMsg(t('deviceConfig.installing', { pkg }));
    try {
      const res = await window.slide?.installAccel?.(pkg);
      if (res?.ok) {
        setMsg(t('deviceConfig.installedRestartToCheck', { pkg }));
        await load();
      } else {
        setMsg(res?.error ?? t('deviceConfig.installFailed'));
      }
    } finally {
      setInstalling(null);
    }
  };

  // Provider hiển thị: luôn có CPU; các accelerator lấy từ caps.
  const accelerators = (caps?.providers ?? []).filter((p) => p.kind !== 'cpu' && p.kind !== 'remote');

  return (
    <>
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-sm-13 font-semibold text-foreground hover:text-primary"
      >
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <Cpu size={14} /> {t('deviceConfig.title')}
        <span className="text-2xs font-normal text-muted-foreground">{t('deviceConfig.subtitle')}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 pl-1 pt-1">
          {!caps && <p className="text-xs text-muted-foreground">{t('deviceConfig.loading')}</p>}

          {/* Engine TTS (multi-engine) — chi tiết ở modal Quản lý engine */}
          {engines && engines.engines.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-foreground flex items-center gap-1">
                {t('deviceConfig.ttsEngine')} <InfoTip text={t('deviceConfig.ttsEngineInfo')} />
              </label>
              <div className="flex items-center justify-between rounded-lg border border-border px-2.5 py-1.5">
                <span className="text-xs text-foreground">
                  {t('deviceConfig.inUse')}: <b>{engines.engines.find((e) => e.id === engines.current)?.label ?? engines.current}</b>
                </span>
                <button
                  type="button"
                  onClick={() => setShowEngineManager(true)}
                  className="text-xxs px-2 py-0.5 rounded-md border border-primary/30 text-primary hover:bg-primary/10"
                >
                  {t('deviceConfig.manageEngine')}
                </button>
              </div>
            </div>
          )}

          {caps && (
            <>
              <p className="text-xxs text-muted-foreground">
                {t('deviceConfig.thisMachine')}: <b>{caps.cpu_count}</b> CPU cores. {t('deviceConfig.inUse')}:{' '}
                <b>{caps.current_providers.join(', ') || 'CPU'}</b>
                {caps.current_threads ? `, ${t('deviceConfig.threadsCount', { count: caps.current_threads })}` : `, ${t('deviceConfig.threadsAuto')}`}.
              </p>

              {/* Thread slider */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-foreground flex items-center gap-1">
                    {t('deviceConfig.cpuThreads')} <InfoTip text={t('deviceConfig.cpuThreadsInfo')} />
                  </label>
                  <span className="text-xxs font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                    {threads === 0 ? t('deviceConfig.auto') : threads}
                  </span>
                </div>
                <input
                  type="range" min={0} max={caps.cpu_count} step={1}
                  value={threads}
                  onChange={(e) => setThreads(parseInt(e.target.value, 10))}
                  className="w-full h-1.5 cursor-pointer appearance-none rounded bg-muted accent-indigo-600"
                />
              </div>

              {/* Provider radio + giải thích GPU */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-foreground flex items-center gap-1">
                  {t('deviceConfig.processor')}
                  <InfoTip text={t('deviceConfig.processorInfo')} />
                </span>

                {/* Khối giải thích GPU (B) — hiện khi có accelerator để người dùng hiểu lựa chọn */}
                <button
                  type="button"
                  onClick={() => setShowGpuHelp((v) => !v)}
                  className="self-start flex items-center gap-1 text-2xs text-primary hover:text-primary"
                >
                  <HelpCircle size={11} /> {t('deviceConfig.gpuHelpToggle')}
                </button>
                {showGpuHelp && (
                  <div className="text-2xs text-muted-foreground bg-muted rounded-lg p-2.5 flex flex-col gap-1.5 leading-relaxed">
                    <p dangerouslySetInnerHTML={{ __html: t('deviceConfig.gpuHelp.intro') }} />
                    <p dangerouslySetInnerHTML={{ __html: t('deviceConfig.gpuHelp.benefits') }} />
                    <p dangerouslySetInnerHTML={{ __html: t('deviceConfig.gpuHelp.drawbacks') }} />
                    <p dangerouslySetInnerHTML={{ __html: t('deviceConfig.gpuHelp.whenNeeded') }} />
                  </div>
                )}

                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                  <input type="radio" name="prov" checked={selectedProvider === 'cpu'}
                    onChange={() => setSelectedProvider('cpu')} className="accent-indigo-600" />
                  CPU <span className="text-2xs text-success">{t('deviceConfig.cpuStable')}</span>
                </label>
                {accelerators.length === 0 && (
                  <p className="text-2xs text-muted-foreground italic pl-5">
                    {t('deviceConfig.noGpuOption')}
                  </p>
                )}
                {accelerators.map((p) => {
                  const canUse = p.works;
                  const installPkg = INSTALL_PACKAGE[p.kind];
                  const canInstall = !p.available && !!installPkg;
                  return (
                    <div key={p.id} className="flex items-center gap-2">
                      <label className={`flex items-center gap-2 text-xs ${canUse ? 'text-foreground cursor-pointer' : 'text-muted-foreground'}`}>
                        <input type="radio" name="prov" disabled={!canUse}
                          checked={selectedProvider === p.kind}
                          onChange={() => setSelectedProvider(p.kind)} className="accent-indigo-600" />
                        {p.label}
                        {canUse && <span className="text-2xs text-success">{t('deviceConfig.faster')}</span>}
                        {p.available && !p.works && (
                          <span className="text-2xs text-warning">{t('deviceConfig.incompatibleEngine')}</span>
                        )}
                        {!p.available && !canInstall && (
                          <span className="text-2xs text-muted-foreground">{t('deviceConfig.noHardware')}</span>
                        )}
                        {!p.available && canInstall && (
                          <span className="text-2xs text-muted-foreground">{t('deviceConfig.needsLibrary')}</span>
                        )}
                      </label>
                      {canInstall && (
                        <button
                          type="button"
                          disabled={installing === installPkg}
                          onClick={() => doInstall(installPkg)}
                          className="text-2xs px-1.5 py-0.5 rounded border border-primary/30 text-primary hover:bg-primary/10 disabled:opacity-40"
                          title={t('deviceConfig.installLibraryTitle')}
                        >
                          {installing === installPkg ? <Loader2 size={11} className="animate-spin inline" /> : t('deviceConfig.installAndEnable')}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {msg && (
                <div className="flex items-start gap-1.5 text-xxs text-foreground bg-muted rounded-lg p-2">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" /> <span>{msg}</span>
                </div>
              )}

              <button
                type="button"
                disabled={!dirty || busy}
                onClick={applyAndRestart}
                className="self-start flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {t('deviceConfig.applyAndRestart')}
              </button>
              <p className="text-2xs text-muted-foreground italic">
                {t('deviceConfig.restartNote')}
              </p>
            </>
          )}
        </div>
      )}
    </div>
    <EngineManager open={showEngineManager} onClose={() => { setShowEngineManager(false); void load(); }} />
    </>
  );
}
