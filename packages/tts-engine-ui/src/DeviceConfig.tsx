import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Cpu, RefreshCw, Loader2, AlertTriangle, HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TtsEnginePort, TtsConfig, TtsCapabilities, TtsEngines } from '@sky-app/service-contracts';
import { EngineManager } from './EngineManager.js';

// Gói cần cài cho từng provider. Danh sách này chỉ để hiện nút; main process mới là
// nơi whitelist thật (xem ipc.ts handler 'tts:install-accel').
const INSTALL_PACKAGE: Record<string, string> = {
  cuda: 'onnxruntime-gpu',
  directml: 'onnxruntime-directml',
};

export interface DeviceConfigProps {
  /** Port quản lý engine — lấy qua platform.services.get('tts-engine'). */
  port: TtsEnginePort;
  /** True khi nền tảng cài đặt được engine/gói tăng tốc về máy (capability 'tts-local'). */
  canInstall?: boolean;
  /** Ghi chú riêng của app nhúng, truyền xuống modal quản lý engine. */
  engineManagerNotice?: ReactNode;
  /**
   * Cho thu gọn thành một dòng tiêu đề bấm để mở (mặc định). Đặt false khi đã nằm
   * trong hộp thoại riêng — lúc đó nội dung phải hiện luôn, thêm một lớp thu gọn nữa
   * chỉ tổ bắt người dùng bấm thừa một lần.
   */
  collapsible?: boolean;
}

/** Tooltip tối giản — dùng title của trình duyệt, không kéo context riêng của app nào. */
function InfoTip({ text }: { text: string }) {
  return (
    <span title={text} className="inline-flex cursor-help text-muted-foreground">
      <HelpCircle size={11} />
    </span>
  );
}

export function DeviceConfig({
  port,
  canInstall = false,
  engineManagerNotice,
  collapsible = true,
}: DeviceConfigProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(!collapsible);
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
      port.getCapabilities(),
      port.getConfig(),
      port.listEngines(),
    ]);
    if (c) setCaps(c);
    if (eng) setEngines(eng);
    if (cfg) {
      setConfig(cfg);
      setThreads(cfg.device.threads ?? 0);
      setSelectedProvider(cfg.device.providers || 'cpu');
    }
  }, [port]);

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
      const res = await port.setConfig?.({ device: { providers, threads } });
      if (res && !res.ok) {
        setMsg(res.error ?? t('deviceConfig.installFailed'));
        return;
      }
      if (port.restart) {
        await port.restart();
        setMsg(t('deviceConfig.appliedAndRestarted'));
        // Reload sau restart để cập nhật current_*.
        setTimeout(() => void load(), 1500);
      } else {
        // Không tự khởi động lại được (vd bản Web dùng service từ xa) — cấu hình đã ghi
        // nhưng chưa có hiệu lực, phải nói rõ để người dùng không tưởng là đã xong.
        setMsg(t('deviceConfig.savedNeedsRestart'));
      }
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
      const res = await port.installAccel?.(pkg);
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
      <div className={collapsible ? 'flex flex-col gap-2 border-t border-border pt-4' : 'flex flex-col gap-2'}>
        {collapsible && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1.5 text-sm-13 font-semibold text-foreground hover:text-primary"
          >
            {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            <Cpu size={14} /> {t('deviceConfig.title')}
            <span className="text-2xs font-normal text-muted-foreground">{t('deviceConfig.subtitle')}</span>
          </button>
        )}

        {open && (
          <div className={collapsible ? 'flex flex-col gap-3 pl-1 pt-1' : 'flex flex-col gap-3'}>
            {!caps && <p className="text-xs text-muted-foreground">{t('deviceConfig.loading')}</p>}

            {/* Engine TTS (multi-engine) — chi tiết ở modal Quản lý engine */}
            {engines && engines.engines.length > 0 && (
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-1 text-xs text-foreground">
                  {t('deviceConfig.ttsEngine')} <InfoTip text={t('deviceConfig.ttsEngineInfo')} />
                </label>
                <div className="flex items-center justify-between rounded-lg border border-border px-2.5 py-1.5">
                  <span className="text-xs text-foreground">
                    {t('deviceConfig.inUse')}: <b>{engines.engines.find((e) => e.id === engines.current)?.label ?? engines.current}</b>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowEngineManager(true)}
                    className="rounded-md border border-primary/30 px-2 py-0.5 text-xxs text-primary hover:bg-primary/10"
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
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1 text-xs text-foreground">
                      {t('deviceConfig.cpuThreads')} <InfoTip text={t('deviceConfig.cpuThreadsInfo')} />
                    </label>
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xxs font-bold text-primary">
                      {threads === 0 ? t('deviceConfig.auto') : threads}
                    </span>
                  </div>
                  <input
                    type="range" min={0} max={caps.cpu_count} step={1}
                    value={threads}
                    onChange={(e) => setThreads(parseInt(e.target.value, 10))}
                    className="h-1.5 w-full cursor-pointer appearance-none rounded bg-muted accent-indigo-600"
                  />
                </div>

                {/* Provider radio + giải thích GPU */}
                <div className="flex flex-col gap-1.5">
                  <span className="flex items-center gap-1 text-xs text-foreground">
                    {t('deviceConfig.processor')}
                    <InfoTip text={t('deviceConfig.processorInfo')} />
                  </span>

                  <button
                    type="button"
                    onClick={() => setShowGpuHelp((v) => !v)}
                    className="flex items-center gap-1 self-start text-2xs text-primary hover:text-primary"
                  >
                    <HelpCircle size={11} /> {t('deviceConfig.gpuHelpToggle')}
                  </button>
                  {showGpuHelp && (
                    <div className="flex flex-col gap-1.5 rounded-lg bg-muted p-2.5 text-2xs leading-relaxed text-muted-foreground">
                      <p dangerouslySetInnerHTML={{ __html: t('deviceConfig.gpuHelp.intro') }} />
                      <p dangerouslySetInnerHTML={{ __html: t('deviceConfig.gpuHelp.benefits') }} />
                      <p dangerouslySetInnerHTML={{ __html: t('deviceConfig.gpuHelp.drawbacks') }} />
                      <p dangerouslySetInnerHTML={{ __html: t('deviceConfig.gpuHelp.whenNeeded') }} />
                    </div>
                  )}

                  <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
                    <input type="radio" name="prov" checked={selectedProvider === 'cpu'}
                      onChange={() => setSelectedProvider('cpu')} className="accent-indigo-600" />
                    CPU <span className="text-2xs text-success">{t('deviceConfig.cpuStable')}</span>
                  </label>
                  {accelerators.length === 0 && (
                    <p className="pl-5 text-2xs italic text-muted-foreground">
                      {t('deviceConfig.noGpuOption')}
                    </p>
                  )}
                  {accelerators.map((p) => {
                    const canUse = p.works;
                    const installPkg = INSTALL_PACKAGE[p.kind];
                    // Chỉ mời cài khi nền tảng thực sự cài được (Electron); trên Web thì
                    // hiện trạng thái chứ không đưa nút bấm không dẫn tới đâu.
                    const offerInstall = !p.available && !!installPkg && canInstall;
                    return (
                      <div key={p.id} className="flex items-center gap-2">
                        <label className={`flex items-center gap-2 text-xs ${canUse ? 'cursor-pointer text-foreground' : 'text-muted-foreground'}`}>
                          <input type="radio" name="prov" disabled={!canUse}
                            checked={selectedProvider === p.kind}
                            onChange={() => setSelectedProvider(p.kind)} className="accent-indigo-600" />
                          {p.label}
                          {canUse && <span className="text-2xs text-success">{t('deviceConfig.faster')}</span>}
                          {p.available && !p.works && (
                            <span className="text-2xs text-warning">{t('deviceConfig.incompatibleEngine')}</span>
                          )}
                          {!p.available && !offerInstall && (
                            <span className="text-2xs text-muted-foreground">
                              {installPkg ? t('deviceConfig.needsLibrary') : t('deviceConfig.noHardware')}
                            </span>
                          )}
                          {offerInstall && (
                            <span className="text-2xs text-muted-foreground">{t('deviceConfig.needsLibrary')}</span>
                          )}
                        </label>
                        {offerInstall && (
                          <button
                            type="button"
                            disabled={installing === installPkg}
                            onClick={() => doInstall(installPkg)}
                            className="rounded border border-primary/30 px-1.5 py-0.5 text-2xs text-primary hover:bg-primary/10 disabled:opacity-40"
                            title={t('deviceConfig.installLibraryTitle')}
                          >
                            {installing === installPkg ? <Loader2 size={11} className="inline animate-spin" /> : t('deviceConfig.installAndEnable')}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {msg && (
                  <div className="flex items-start gap-1.5 rounded-lg bg-muted p-2 text-xxs text-foreground">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" /> <span>{msg}</span>
                  </div>
                )}

                <button
                  type="button"
                  disabled={!dirty || busy}
                  onClick={applyAndRestart}
                  className="flex items-center gap-1.5 self-start rounded-lg bg-primary px-2.5 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  {t('deviceConfig.applyAndRestart')}
                </button>
                <p className="text-2xs italic text-muted-foreground">
                  {t('deviceConfig.restartNote')}
                </p>
              </>
            )}
          </div>
        )}
      </div>
      <EngineManager
        open={showEngineManager}
        onClose={() => { setShowEngineManager(false); void load(); }}
        port={port}
        canInstall={canInstall}
        notice={engineManagerNotice}
      />
    </>
  );
}
