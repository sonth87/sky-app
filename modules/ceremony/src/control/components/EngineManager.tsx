import { useState, useEffect, useCallback, useRef } from 'react';
import { Download, Pause, Play, Trash2, AlertTriangle, CheckCircle2, FolderInput, FolderOutput, RefreshCw, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { TtsEngines, TtsEngineInfo, EngineInstallProgress, TtsEnginePreflight } from '@sky-app/slide-shared';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

interface Props {
  open: boolean;
  onClose: () => void;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// Trạng thái UI dẫn xuất cho 1 engine (từ install_status + progress đang chạy).
type UiPhase = EngineInstallProgress['phase'] | 'idle';

export function EngineManager({ open, onClose }: Props) {
  const { t } = useTranslation();
  const [engines, setEngines] = useState<TtsEngines | null>(null);
  const [progress, setProgress] = useState<Record<string, EngineInstallProgress>>({});
  const [preflight, setPreflight] = useState<Record<string, TtsEnginePreflight>>({});
  const [busy, setBusy] = useState<string | null>(null);   // engineId đang thao tác đồng bộ
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [diskUsage, setDiskUsage] = useState<Record<string, number>>({});
  const progressRef = useRef<Record<string, EngineInstallProgress>>({});

  const refresh = useCallback(async () => {
    const e = await window.slide?.listEngines?.();
    if (e) {
      setEngines(e);
      // Dung lượng từng engine (cho hiển thị + dọn đĩa).
      for (const eng of e.engines) {
        if (!eng.bundled) {
          window.slide?.engineDiskUsage?.(eng.id).then((r) =>
            setDiskUsage((prev) => ({ ...prev, [eng.id]: r.bytes })));
        }
      }
    }
  }, []);

  useEffect(() => { if (open) void refresh(); }, [open, refresh]);

  // Subscribe tiến độ cài đặt.
  useEffect(() => {
    if (!open) return;
    const unsub = window.slide?.onEngineInstallProgress?.((p) => {
      progressRef.current[p.engineId] = p;
      setProgress({ ...progressRef.current });
      // Cài xong / lỗi → refresh danh sách để cập nhật install_status.
      if (p.phase === 'done' || p.phase === 'error') void refresh();
    });
    return () => { unsub?.(); };
  }, [open, refresh]);

  const setEngineMsg = (id: string, m: string) => setMsg((prev) => ({ ...prev, [id]: m }));

  const doPreflight = async (id: string) => {
    const pf = await window.slide?.enginePreflight?.(id);
    if (pf) setPreflight((prev) => ({ ...prev, [id]: pf }));
    return pf;
  };

  const doInstall = async (id: string) => {
    setBusy(id); setEngineMsg(id, '');
    const pf = await doPreflight(id);
    if (pf && !pf.ok) { setBusy(null); return; } // blocks hiển thị bên dưới
    const res = await window.slide?.engineInstallStart?.(id);
    if (!res?.ok) setEngineMsg(id, res?.error ?? t('engineManager.installStartFailed'));
    setBusy(null);
  };

  const doVerifyAndSwitch = async (id: string) => {
    setBusy(id); setEngineMsg(id, t('engineManager.checkingEngine'));
    const v = await window.slide?.engineVerify?.(id);
    if (!v?.ok) { setEngineMsg(id, t('engineManager.engineLoadFailed', { error: v?.error ?? t('engineManager.unknownError') })); setBusy(null); return; }
    setEngineMsg(id, t('engineManager.switchingEngine'));
    const sw = await window.slide?.engineSwitch?.(id);
    setEngineMsg(id, sw?.ok ? t('engineManager.switchSuccess') : t('engineManager.switchFailed', { error: sw?.error ?? '' }));
    await refresh();
    setBusy(null);
  };

  const phaseOf = (e: TtsEngineInfo): UiPhase => {
    const p = progress[e.id];
    if (p && p.phase !== 'done') return p.phase;
    return 'idle';
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={<span className="text-base font-bold text-foreground">{t('engineManager.title')}</span>}
      contentClassName="max-h-[85vh] overflow-y-auto p-5"
    >
        <div className="flex flex-col gap-3">
          <p className="text-xxs text-muted-foreground">
            {t('engineManager.description')}
          </p>

          {/* An toàn khi hành lễ: TỰ ĐỘNG tạm dừng/khoá — không cần bật tay */}
          <p className="flex items-start gap-1.5 text-xxs text-muted-foreground bg-muted rounded-lg px-3 py-2">
            <Lock size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
            <span dangerouslySetInnerHTML={{ __html: t('engineManager.ceremonySafetyNote') }} />
          </p>

          {engines?.engines.map((e) => {
            const phase = phaseOf(e);
            const p = progress[e.id];
            const pf = preflight[e.id];
            const isCurrent = engines.current === e.id;
            const pct = p && p.bytesTotal > 0 ? Math.floor((p.bytesReceived / p.bytesTotal) * 100) : 0;
            const downloading = phase === 'downloading' || phase === 'resolving' || phase === 'importing' || phase === 'installing-runtime';
            const paused = phase === 'paused';

            return (
              <div key={e.id} className="rounded-xl border border-border p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                      {e.label}
                      {isCurrent && <span className="text-2xs px-1.5 py-0.5 rounded bg-success/15 text-success">{t('engineManager.inUse')}</span>}
                      {e.bundled && <span className="text-2xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{t('engineManager.bundled')}</span>}
                    </span>
                    <span className="text-xxs text-muted-foreground">{e.description}</span>
                  </div>
                  <StatusBadge status={e.install_status} bundled={e.bundled} t={t} />
                </div>

                {/* Yêu cầu phần cứng */}
                {e.requirements && (
                  <p className="text-2xs text-muted-foreground">
                    {t('engineManager.requires')}: RAM ≥ {e.requirements.min_ram_gb}GB{e.requirements.needs_gpu ? ', GPU' : ''}
                    {e.requirements.recommended_ram_gb ? ` (${t('engineManager.recommended')} ${e.requirements.recommended_ram_gb}GB)` : ''}
                  </p>
                )}

                {/* Progress khi đang tải */}
                {(downloading || paused) && p && (
                  <div className="flex flex-col gap-1">
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${paused ? 'bg-warning' : 'bg-primary'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between text-2xs text-muted-foreground">
                      <span>{translatePhase(phase, t)} {p.currentFile ? `· ${p.currentFile.split('/').pop()}` : ''}</span>
                      <span>
                        {p.bytesTotal > 0 && `${fmtBytes(p.bytesReceived)}/${fmtBytes(p.bytesTotal)} `}
                        {p.bytesPerSec > 0 && !paused && `· ${fmtBytes(p.bytesPerSec)}/s`}
                      </span>
                    </div>
                  </div>
                )}

                {/* Preflight blocks/warnings */}
                {pf && pf.blocks.length > 0 && (
                  <div className="text-xxs text-destructive bg-destructive/10 rounded-lg p-2 flex flex-col gap-1">
                    {pf.blocks.map((b, i) => <div key={i} className="flex items-start gap-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{b}</div>)}
                  </div>
                )}
                {pf && pf.warnings.length > 0 && (
                  <div className="text-xxs text-warning-foreground bg-warning/10 rounded-lg p-2 flex flex-col gap-1">
                    {pf.warnings.map((w, i) => <div key={i} className="flex items-start gap-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{w}</div>)}
                  </div>
                )}
                {msg[e.id] && <p className="text-xxs text-foreground">{msg[e.id]}</p>}
                {phase === 'error' && p?.error && <p className="text-xxs text-destructive">{p.error}</p>}

                {/* Dung lượng chiếm đĩa (engine mở rộng đã tải) */}
                {!e.bundled && e.install_status !== 'missing' && diskUsage[e.id] > 0 && (
                  <p className="text-2xs text-muted-foreground">{t('engineManager.diskUsage')}: {fmtBytes(diskUsage[e.id])}</p>
                )}

                {/* Nút hành động theo trạng thái. Chế độ hành lễ → khoá tải/đổi/xoá. */}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {e.bundled ? (
                    !isCurrent && (
                      <Button variant="primary" onClick={() => doVerifyAndSwitch(e.id)} disabled={busy === e.id}
                        loading={busy === e.id} icon={<RefreshCw size={12} />}>
                        {t('engineManager.switchToThis')}
                      </Button>
                    )
                  ) : e.install_status === 'installed' ? (
                    <>
                      {!isCurrent && (
                        <Button variant="primary" onClick={() => doVerifyAndSwitch(e.id)} disabled={busy === e.id}
                          loading={busy === e.id} icon={<CheckCircle2 size={12} />}>
                          {t('engineManager.switchToThis')}
                        </Button>
                      )}
                      <Button variant="secondary-outline" onClick={() => window.slide?.engineExportLocal?.(e.id)}
                        icon={<FolderOutput size={12} />}>
                        {t('engineManager.exportUsb')}
                      </Button>
                      <Button
                        variant="danger-ghost"
                        onClick={async () => {
                          if (!confirm(t('engineManager.deleteConfirm', { label: e.label }))) return;
                          const r = await window.slide?.engineDelete?.(e.id);
                          if (!r?.ok) setEngineMsg(e.id, r?.error ?? t('engineManager.deleteFailed'));
                          void refresh();
                        }}
                        disabled={isCurrent}
                        icon={<Trash2 size={12} />}
                      >
                        {t('engineManager.delete')}
                      </Button>
                    </>
                  ) : downloading ? (
                    <Button variant="secondary-outline" onClick={() => window.slide?.engineInstallPause?.(e.id)}
                      icon={<Pause size={12} />}>
                      {t('engineManager.pause')}
                    </Button>
                  ) : paused ? (
                    <Button variant="primary" onClick={() => window.slide?.engineInstallResume?.(e.id)}
                      icon={<Play size={12} />}>
                      {t('engineManager.resume')}
                    </Button>
                  ) : (
                    <>
                      <Button variant="primary" onClick={() => doInstall(e.id)} disabled={busy === e.id}
                        loading={busy === e.id} icon={<Download size={12} />}>
                        {t('engineManager.downloadModel')}
                      </Button>
                      <Button variant="secondary-outline" onClick={() => window.slide?.engineImportLocal?.(e.id)}
                        icon={<FolderInput size={12} />}>
                        {t('engineManager.importFromUsb')}
                      </Button>
                    </>
                  )}
                  {/* Hủy khi đang tải/tạm dừng (xoá file dở) */}
                  {(downloading || paused) && (
                    <Button variant="danger-ghost" onClick={async () => { await window.slide?.engineInstallCancel?.(e.id); void refresh(); }}
                      icon={<Trash2 size={12} />}>
                      {t('engineManager.cancel')}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
    </Modal>
  );
}

function StatusBadge({ status, bundled, t }: { status: string; bundled: boolean; t: TFunction }) {
  if (bundled || status === 'installed')
    return <span className="text-2xs px-2 py-0.5 rounded bg-success/15 text-success">{t('engineManager.status.ready')}</span>;
  if (status === 'partial')
    return <span className="text-2xs px-2 py-0.5 rounded bg-warning/15 text-warning-foreground">{t('engineManager.status.partial')}</span>;
  return <span className="text-2xs px-2 py-0.5 rounded bg-muted text-muted-foreground">{t('engineManager.status.notDownloaded')}</span>;
}

function translatePhase(p: UiPhase, t: TFunction): string {
  switch (p) {
    case 'resolving': return t('engineManager.phase.resolving');
    case 'downloading': return t('engineManager.phase.downloading');
    case 'importing': return t('engineManager.phase.importing');
    case 'installing-runtime': return t('engineManager.phase.installingRuntime');
    case 'verifying': return t('engineManager.phase.verifying');
    case 'paused': return t('engineManager.phase.paused');
    default: return '';
  }
}
