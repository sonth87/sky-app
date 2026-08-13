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

/**
 * Mức độ engine đang chạy THẬT SỰ tôn trọng lựa chọn "Thiết bị xử lý" bên dưới — suy ra
 * từ đọc trực tiếp code từng engine (`apps/tts-service/server/engine*.py`), KHÔNG có field
 * capability riêng cho việc này ở backend (out of scope thêm mới lần này). Cập nhật tay khi
 * thêm engine mới; engine không có trong bảng = không hiện ghi chú gì (không đoán bừa).
 *
 *   'full'    — VieNeu/MOSS-TTS-Nano: setting này ĐƯỢC tiêm thẳng làm ONNX execution
 *               provider thật (`onnx_providers.py`'s `patched_session`).
 *   'limited' — Qwen (0.6B/1.7B): chỉ đọc để SUY LUẬN có bật CUDA cho torch hay không —
 *               không phải ONNX provider thật. Trên máy chạy qua MLX (Apple Silicon) thì
 *               BỊ BỎ QUA HOÀN TOÀN (hardcode MLXProvider) — cùng 1 engine_id nhưng backend
 *               tự chọn ngầm MLX hay torch tuỳ nền tảng, phía client không phân biệt được,
 *               nên chỉ nói "hạn chế" thay vì khẳng định chắc "vô tác dụng".
 */
const DEVICE_RELEVANCE: Record<string, 'full' | 'limited'> = {
  vieneu: 'full',
  'moss-tts-nano': 'full',
  'qwen-0.6b': 'limited',
  'qwen-1.7b': 'limited',
  voxcpm: 'limited',
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
  /**
   * Caller đã có sẵn 1 chỗ khác để hiện "Quản lý engine" (vd tab riêng trong
   * `ConfigWindow`) — bấm nút sẽ gọi callback này (thường là chuyển tab) THAY VÌ mở
   * popup `EngineManager` lồng bên trong `DeviceConfig`. Bỏ trống = giữ hành vi cũ
   * (mở popup tại chỗ) cho caller chưa chuyển sang layout tab (vd Ceremony's
   * TtsSettingsContent).
   */
  onOpenEngineManager?: () => void;
}

/** Tooltip tối giản — dùng title của trình duyệt, không kéo context riêng của app nào. */
function InfoTip({ text }: { text: string }) {
  return (
    <span title={text} className="inline-flex cursor-help text-muted-foreground">
      <HelpCircle size={11} />
    </span>
  );
}

/**
 * 1 dòng setting kiểu voicebox's Settings page — nhãn + mô tả bên trái, control bên phải,
 * các dòng cách nhau bằng divider ngang (`divide-y` ở container cha) thay vì mỗi khối tự vẽ
 * border/card riêng. `align="start"` cho control cần nhiều dòng (vd khối chọn bộ xử lý) —
 * căn lên đầu thay vì giữa theo chiều dọc.
 */
function SettingRow({
  label, description, children, align = 'center',
}: { label: ReactNode; description?: ReactNode; children: ReactNode; align?: 'center' | 'start' }) {
  return (
    <div className={`flex gap-4 px-1 py-3.5 ${align === 'start' ? 'items-start' : 'items-center'}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-xs font-medium text-foreground">{label}</span>
        {description && <p className="text-2xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function DeviceConfig({
  port,
  canInstall = false,
  engineManagerNotice,
  collapsible = true,
  onOpenEngineManager,
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
  const currentEngineLabel = engines?.engines.find((e) => e.id === engines.current)?.label ?? engines?.current;

  return (
    <>
      <div className={collapsible ? 'flex flex-col gap-2 border-t border-border pt-4' : 'flex h-full flex-col p-4'}>
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
          <div className={collapsible ? 'flex flex-col divide-y divide-border pl-1 pt-1' : 'flex flex-1 flex-col divide-y divide-border overflow-y-auto'}>
            {!caps && <p className="py-3.5 text-xs text-muted-foreground">{t('deviceConfig.loading')}</p>}

            {/* Engine TTS (multi-engine) — chi tiết ở modal/tab Quản lý engine */}
            {engines && engines.engines.length > 0 && (
              <SettingRow label={<span className="flex items-center gap-1">{t('deviceConfig.ttsEngine')}<InfoTip text={t('deviceConfig.ttsEngineInfo')} /></span>}>
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-muted px-2.5 py-1.5 text-xs font-medium text-foreground">
                    {currentEngineLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => (onOpenEngineManager ? onOpenEngineManager() : setShowEngineManager(true))}
                    className="rounded-lg border border-primary/30 px-2.5 py-1.5 text-2xs text-primary hover:bg-primary/10"
                  >
                    {t('deviceConfig.manageEngine')}
                  </button>
                </div>
              </SettingRow>
            )}

            {caps && (
              <>
                <SettingRow
                  label={<span className="flex items-center gap-1">{t('deviceConfig.cpuThreads')}<InfoTip text={t('deviceConfig.cpuThreadsInfo')} /></span>}
                  description={`${t('deviceConfig.thisMachine')}: ${caps.cpu_count} CPU cores · ${t('deviceConfig.inUse')}: ${caps.current_providers.join(', ') || 'CPU'}${caps.current_threads ? `, ${t('deviceConfig.threadsCount', { count: caps.current_threads })}` : `, ${t('deviceConfig.threadsAuto')}`}`}
                >
                  <div className="flex w-40 items-center gap-2">
                    <input
                      type="range" min={0} max={caps.cpu_count} step={1}
                      value={threads}
                      onChange={(e) => setThreads(parseInt(e.target.value, 10))}
                      className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-indigo-600"
                    />
                    <span className="w-12 shrink-0 rounded-lg bg-primary/10 px-1.5 py-1 text-center font-mono text-2xs font-bold text-primary">
                      {threads === 0 ? t('deviceConfig.auto') : threads}
                    </span>
                  </div>
                </SettingRow>

                {/* Bộ xử lý — mỗi lựa chọn 1 "card" bấm được thay vì radio trần, tham khảo
                    bố cục row-based settings của voicebox (label+control tách biệt, control
                    ở đây tự thân là danh sách card nên chiếm cả chiều rộng, không nằm cùng
                    hàng với label — dùng align="start" + full-width bên dưới label). */}
                <SettingRow
                  align="start"
                  label={<span className="flex items-center gap-1">{t('deviceConfig.processor')}<InfoTip text={t('deviceConfig.processorInfo')} /></span>}
                  description={
                    caps.engine && DEVICE_RELEVANCE[caps.engine]
                      ? t(`deviceConfig.relevance${DEVICE_RELEVANCE[caps.engine] === 'full' ? 'Full' : 'Limited'}`)
                      : undefined
                  }
                >
                  <div className="flex w-64 flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowGpuHelp((v) => !v)}
                      className="flex items-center gap-1 self-end text-2xs text-primary hover:text-primary"
                    >
                      <HelpCircle size={11} /> {t('deviceConfig.gpuHelpToggle')}
                    </button>
                    {showGpuHelp && (
                      <div className="flex flex-col gap-1.5 rounded-xl bg-muted/60 p-2.5 text-2xs leading-relaxed text-muted-foreground">
                        <p dangerouslySetInnerHTML={{ __html: t('deviceConfig.gpuHelp.intro') }} />
                        <p dangerouslySetInnerHTML={{ __html: t('deviceConfig.gpuHelp.benefits') }} />
                        <p dangerouslySetInnerHTML={{ __html: t('deviceConfig.gpuHelp.drawbacks') }} />
                        <p dangerouslySetInnerHTML={{ __html: t('deviceConfig.gpuHelp.whenNeeded') }} />
                      </div>
                    )}

                    <label
                      className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs ${selectedProvider === 'cpu' ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted/50'}`}
                    >
                      <input type="radio" name="prov" checked={selectedProvider === 'cpu'}
                        onChange={() => setSelectedProvider('cpu')} className="accent-indigo-600" />
                      <span className="flex-1 font-medium text-foreground">CPU</span>
                      <span className="text-2xs text-success">{t('deviceConfig.cpuStable')}</span>
                    </label>
                    {accelerators.length === 0 && (
                      <p className="px-1 text-2xs italic text-muted-foreground">
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
                        <div key={p.id} className="flex flex-col gap-1">
                          <label
                            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${!canUse ? 'cursor-not-allowed border-border text-muted-foreground' : selectedProvider === p.kind ? 'cursor-pointer border-primary/40 bg-primary/5' : 'cursor-pointer border-border hover:bg-muted/50'}`}
                          >
                            <input type="radio" name="prov" disabled={!canUse}
                              checked={selectedProvider === p.kind}
                              onChange={() => setSelectedProvider(p.kind)} className="accent-indigo-600" />
                            <span className={`flex-1 font-medium ${canUse ? 'text-foreground' : 'text-muted-foreground'}`}>{p.label}</span>
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
                              className="self-end rounded-lg border border-primary/30 px-2 py-1 text-2xs text-primary hover:bg-primary/10 disabled:opacity-40"
                              title={t('deviceConfig.installLibraryTitle')}
                            >
                              {installing === installPkg ? <Loader2 size={11} className="inline animate-spin" /> : t('deviceConfig.installAndEnable')}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </SettingRow>

                <div className="flex flex-col gap-2 py-3.5">
                  {msg && (
                    <div className="flex items-start gap-1.5 rounded-xl bg-muted p-2.5 text-xxs text-foreground">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" /> <span>{msg}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-2xs italic text-muted-foreground">
                      {t('deviceConfig.restartNote')}
                    </p>
                    <button
                      type="button"
                      disabled={!dirty || busy}
                      onClick={applyAndRestart}
                      className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                      {t('deviceConfig.applyAndRestart')}
                    </button>
                  </div>
                </div>
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
