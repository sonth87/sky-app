import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import {
  Download, Pause, Play, Trash2, AlertTriangle, CheckCircle2,
  FolderInput, FolderOutput, RefreshCw,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type {
  TtsEnginePort, TtsEngines, TtsEngineInfo, EngineInstallProgress, TtsEnginePreflight,
} from '@sky-app/service-contracts';
import { FloatingWindow } from '@sonth87/device-layout';
import { Button, fmtBytes } from './ui.js';
import { useTtsStatus } from './useTtsStatus.js';

export interface EngineManagerProps {
  open: boolean;
  onClose: () => void;
  /** Port quản lý engine — lấy qua platform.services.get('tts-engine'). */
  port: TtsEnginePort;
  /**
   * True khi nền tảng cài đặt được engine về máy (capability 'tts-local' — chỉ Electron).
   * False → chỉ hiện danh sách và cho đổi giữa các engine ĐÃ có sẵn trên service.
   */
  canInstall?: boolean;
  /**
   * Ghi chú riêng của app nhúng, hiện ngay dưới phần mô tả. Ceremony dùng để nhắc
   * việc tải tự tạm dừng khi đang hành lễ — thứ không liên quan gì tới TTS Studio.
   */
  notice?: ReactNode;
  /**
   * Root DOM của app gọi (vd `.tts-studio-root`/`.ceremony-root`) — truyền vào FloatingWindow
   * để nó portal VÀO TRONG subtree đó thay vì thẳng ra `document.body`. Bắt buộc nếu app gọi có
   * biến theme CSS custom property scoped theo root class (xem docs/guides/app-css-theming.md
   * Rule 4 của app đó) — thiếu prop này thì mọi màu (`text-foreground`, `bg-success`...) rơi về
   * fallback light-mode bất kể theme thật đang là dark (bug thật 2026-08-04, phát hiện lúc rà
   * soát dark theme của chính EngineManager: badge/nút gần như vô hình vì lệch màu). Bỏ trống
   * (undefined) = FloatingWindow tự fallback `document.body` như hành vi cũ.
   */
  portalContainer?: HTMLElement | null;
}

/** Trạng thái UI dẫn xuất cho 1 engine (từ install_status + progress đang chạy). */
type UiPhase = EngineInstallProgress['phase'] | 'idle';

export function EngineManager({ open, onClose, port, canInstall = false, notice, portalContainer }: EngineManagerProps) {
  const { t } = useTranslation();
  const [engines, setEngines] = useState<TtsEngines | null>(null);
  const [progress, setProgress] = useState<Record<string, EngineInstallProgress>>({});
  const [preflight, setPreflight] = useState<Record<string, TtsEnginePreflight>>({});
  const [busy, setBusy] = useState<string | null>(null); // engineId đang thao tác đồng bộ
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [diskUsage, setDiskUsage] = useState<Record<string, number>>({});
  const progressRef = useRef<Record<string, EngineInstallProgress>>({});
  // Trạng thái tiến trình tts-service (đã có sẵn cho icon menu bar) — dùng ở đây để tự refresh
  // khi service CHUYỂN sang sẵn sàng, thay vì bắt người dùng đóng/mở lại cửa sổ.
  const { status: serviceStatus } = useTtsStatus(port);
  const prevServiceStatusRef = useRef(serviceStatus);

  const refresh = useCallback(async () => {
    const e = await port.listEngines();
    if (!e) return;
    setEngines(e);
    // Dung lượng từng engine (cho hiển thị + dọn đĩa). Chỉ có ở nền tảng cài được.
    if (!port.diskUsage) return;
    for (const eng of e.engines) {
      if (eng.bundled) continue;
      void port.diskUsage(eng.id).then((r) =>
        setDiskUsage((prev) => ({ ...prev, [eng.id]: r.bytes })));
    }
  }, [port]);

  useEffect(() => { if (open) void refresh(); }, [open, refresh]);

  // Bug thật 2026-08-04: mở "Quản lý engine TTS" TRƯỚC KHI tts-service kịp start (vd vừa mở
  // app) → listEngines() trả về null (getPythonPort() chưa có), refresh() ở trên bỏ qua luôn
  // vì `if (!e) return`, và KHÔNG có cơ chế thử lại — danh sách trống vĩnh viễn cho tới khi
  // đóng/mở lại cửa sổ. Theo dõi serviceStatus (đã có sẵn, dùng chung icon menu bar) để tự
  // refresh() ngay khi service chuyển sang 'ok', không cần người dùng đóng/mở lại.
  useEffect(() => {
    if (open && serviceStatus === 'ok' && prevServiceStatusRef.current !== 'ok') void refresh();
    prevServiceStatusRef.current = serviceStatus;
  }, [open, serviceStatus, refresh]);

  // Subscribe tiến độ cài đặt.
  useEffect(() => {
    if (!open || !port.onInstallProgress) return;
    const unsub = port.onInstallProgress((p) => {
      progressRef.current[p.engineId] = p;
      setProgress({ ...progressRef.current });
      // Cài xong / lỗi → refresh danh sách để cập nhật install_status.
      if (p.phase === 'done' || p.phase === 'error') void refresh();
    });
    return () => { unsub(); };
  }, [open, port, refresh]);

  const setEngineMsg = (id: string, m: string) => setMsg((prev) => ({ ...prev, [id]: m }));

  const doPreflight = async (id: string) => {
    const pf = await port.preflight?.(id);
    if (pf) setPreflight((prev) => ({ ...prev, [id]: pf }));
    return pf;
  };

  const doInstall = async (id: string) => {
    setBusy(id); setEngineMsg(id, '');
    const pf = await doPreflight(id);
    if (pf && !pf.ok) { setBusy(null); return; } // blocks hiển thị bên dưới
    const res = await port.installStart?.(id);
    if (!res?.ok) setEngineMsg(id, res?.error ?? t('engineManager.installStartFailed'));
    setBusy(null);
  };

  const doVerifyAndSwitch = async (id: string) => {
    setBusy(id);
    // verify là dry-run "engine có load được không" — chỉ nền tảng cài đặt tại chỗ mới
    // có. Nơi khác thì đổi thẳng, để service tự báo lỗi nếu engine hỏng.
    if (port.verify) {
      setEngineMsg(id, t('engineManager.checkingEngine'));
      const v = await port.verify(id);
      if (!v.ok) {
        setEngineMsg(id, t('engineManager.engineLoadFailed', { error: v.error ?? t('engineManager.unknownError') }));
        setBusy(null);
        return;
      }
    }
    setEngineMsg(id, t('engineManager.switchingEngine'));
    const sw = await port.switchEngine?.(id);
    if (sw?.ok) {
      // Không có restart() (vd bản Web): service phải được khởi động lại bởi người
      // vận hành thì engine mới có hiệu lực — nói rõ thay vì báo "xong" gây hiểu nhầm.
      setEngineMsg(id, port.restart ? t('engineManager.switchSuccess') : t('engineManager.switchNeedsRestart'));
    } else {
      setEngineMsg(id, t('engineManager.switchFailed', { error: sw?.error ?? '' }));
    }
    await refresh();
    setBusy(null);
  };

  const phaseOf = (e: TtsEngineInfo): UiPhase => {
    const p = progress[e.id];
    if (p && p.phase !== 'done') return p.phase;
    return 'idle';
  };

  // FloatingWindow không tự gate theo `open` (không có prop đó) — caller (device-shell,
  // TTS Studio) luôn mount component này, ẩn/hiện qua chính prop `open`. Đặt gate SAU mọi
  // hook ở trên, không phải trước — return sớm trước hook sẽ vi phạm Rules of Hooks.
  if (!open) return null;

  return (
    <FloatingWindow
      onClose={onClose}
      title={t('engineManager.title')}
      width={560}
      height={520}
      blocking={false}
      resizable
      minWidth={420}
      minHeight={360}
      contentClassName="flex w-full flex-1 min-h-0 flex-col gap-3 overflow-y-auto p-5"
      container={portalContainer}
    >
      <p className="text-xxs text-muted-foreground">{t('engineManager.description')}</p>

      {notice}

      {/* engines === null: listEngines() chưa trả được (service chưa start / mất kết nối) —
          hiện rõ trạng thái thay vì bỏ trống cửa sổ. Tự refresh() khi service chuyển 'ok'
          (effect ở trên) nên không cần người dùng tự đóng/mở lại. */}
      {engines === null && (
        <p className="text-xs text-muted-foreground">
          {serviceStatus === 'error'
            ? t('engineManager.serviceUnavailable')
            : t('engineManager.serviceStarting')}
        </p>
      )}

      {engines?.engines.map((e) => {
          const phase = phaseOf(e);
          const p = progress[e.id];
          const pf = preflight[e.id];
          const isCurrent = engines.current === e.id;
          const pct = p && p.bytesTotal > 0 ? Math.floor((p.bytesReceived / p.bytesTotal) * 100) : 0;
          const downloading = phase === 'downloading' || phase === 'resolving' || phase === 'importing' || phase === 'installing-runtime';
          const paused = phase === 'paused';
          const usedBytes = diskUsage[e.id] ?? 0;

          return (
            <div key={e.id} className="flex flex-col gap-2 rounded-xl border border-border p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                    {e.label}
                    {isCurrent && <span className="shrink-0 whitespace-nowrap rounded bg-success/15 px-1.5 py-0.5 text-2xs text-success">{t('engineManager.inUse')}</span>}
                    {e.bundled && <span className="shrink-0 whitespace-nowrap rounded bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">{t('engineManager.bundled')}</span>}
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

              {/* Progress khi đang tải/cài. */}
              {(downloading || paused) && p && (
                <InstallProgressBlock phase={phase} p={p} pct={pct} paused={paused} t={t} />
              )}

              {/* Preflight blocks/warnings */}
              {pf && pf.blocks.length > 0 && (
                <div className="flex flex-col gap-1 rounded-lg bg-destructive/10 p-2 text-xxs text-destructive">
                  {pf.blocks.map((b, i) => <div key={i} className="flex items-start gap-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{b}</div>)}
                </div>
              )}
              {pf && pf.warnings.length > 0 && (
                <div className="flex flex-col gap-1 rounded-lg bg-warning/10 p-2 text-xxs text-warning-foreground">
                  {pf.warnings.map((w, i) => <div key={i} className="flex items-start gap-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{w}</div>)}
                </div>
              )}
              {msg[e.id] && <p className="text-xxs text-foreground">{msg[e.id]}</p>}
              {phase === 'error' && p?.error && <p className="text-xxs text-destructive">{p.error}</p>}

              {/* Dung lượng chiếm đĩa (engine mở rộng đã tải) */}
              {!e.bundled && e.install_status !== 'missing' && usedBytes > 0 && (
                <p className="text-2xs text-muted-foreground">{t('engineManager.diskUsage')}: {fmtBytes(usedBytes)}</p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
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
                    {canInstall && (
                      <>
                        <Button variant="secondary-outline" onClick={() => void port.exportLocal?.(e.id)}
                          icon={<FolderOutput size={12} />}>
                          {t('engineManager.exportUsb')}
                        </Button>
                        <Button
                          variant="danger-ghost"
                          onClick={async () => {
                            if (!confirm(t('engineManager.deleteConfirm', { label: e.label }))) return;
                            // Bug thật 2026-08-04: xoá xong (thành công) không dọn `msg[e.id]` —
                            // thông báo lỗi CŨ (vd "Engine không load được...") từ lần đổi/kiểm
                            // tra engine trước đó cứ nằm lì mãi dù engine đã bị xoá sạch, trông
                            // như thao tác xoá "không có tác dụng gì" với dòng lỗi.
                            setEngineMsg(e.id, '');
                            const r = await port.deleteEngine?.(e.id);
                            if (!r?.ok) setEngineMsg(e.id, r?.error ?? t('engineManager.deleteFailed'));
                            void refresh();
                          }}
                          disabled={isCurrent}
                          icon={<Trash2 size={12} />}
                        >
                          {t('engineManager.delete')}
                        </Button>
                      </>
                    )}
                  </>
                ) : !canInstall ? (
                  // Nền tảng không cài được (vd Web): engine chưa có trên service thì
                  // người dùng không tự làm gì được — nói rõ thay vì hiện nút vô dụng.
                  <p className="text-2xs text-muted-foreground">{t('engineManager.installNotAvailableHere')}</p>
                ) : downloading ? (
                  <Button variant="secondary-outline" onClick={() => void port.installPause?.(e.id)} icon={<Pause size={12} />}>
                    {t('engineManager.pause')}
                  </Button>
                ) : paused || e.install_status === 'partial' ? (
                  // `paused` = tiến độ trực tiếp trong phiên này. `install_status === 'partial'`
                  // = có phần dở còn lại trên đĩa nhưng CHƯA có sự kiện progress nào tới (vd vừa
                  // mở lại cửa sổ trong lúc tải nền vẫn chạy) — cả 2 đều nghĩa "đã có phần dở dang",
                  // nên chỉ cho Resume, ẩn hẳn Tải model/Import (2 nút đó chỉ dành cho status 'missing').
                  <Button variant="primary" onClick={() => void port.installResume?.(e.id)} icon={<Play size={12} />}>
                    {t('engineManager.resume')}
                  </Button>
                ) : (
                  <>
                    <Button variant="primary" onClick={() => doInstall(e.id)} disabled={busy === e.id}
                      loading={busy === e.id} icon={<Download size={12} />}>
                      {t('engineManager.downloadModel')}
                    </Button>
                    <Button variant="secondary-outline" onClick={() => void port.importLocal?.(e.id)}
                      icon={<FolderInput size={12} />}>
                      {t('engineManager.importFromUsb')}
                    </Button>
                  </>
                )}
                {/* Hủy khi đang tải/tạm dừng (xoá file dở) */}
                {canInstall && (downloading || paused) && (
                  <Button variant="danger-ghost" onClick={async () => { await port.installCancel?.(e.id); void refresh(); }}
                    icon={<Trash2 size={12} />}>
                    {t('engineManager.cancel')}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
    </FloatingWindow>
  );
}

/** Label nhấp nháy dấu chấm ("Đang cài đặt" → "Đang cài đặt." → ".." → "..." → lặp lại) —
 * báo hiệu tiến trình vẫn đang chạy, không đứng hình, trong lúc chờ % ước lượng cập nhật. */
function AnimatedDotsLabel({ label }: { label: string }) {
  const [dots, setDots] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setDots((d) => (d + 1) % 4), 450);
    return () => clearInterval(id);
  }, []);
  return <span>{label}{'.'.repeat(dots)}</span>;
}

/** Khối hiển thị tiến độ tải/cài 1 engine: dòng nhãn (nhấp nháy dấu chấm) + % + nút "Chi tiết",
 * thanh progress, và log cuộn (đóng mặc định, mở khi bấm "Chi tiết"). Riêng phase
 * 'installing-runtime' (pip install) dùng `installPct` ước lượng thay vì % byte-based (pip
 * không báo tổng dung lượng khi chạy ngầm — xem comment installPct's ở slide-api.ts). */
function InstallProgressBlock({
  phase, p, pct, paused, t,
}: {
  phase: UiPhase;
  p: EngineInstallProgress;
  pct: number;
  paused: boolean;
  t: TFunction;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasLog = !!p.logLines && p.logLines.length > 0;
  const displayPct = hasLog ? (p.installPct ?? 0) : pct;
  const label = translatePhase(phase, t);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 text-2xs text-muted-foreground">
        <span className="min-w-0 truncate">
          {paused ? label : <AnimatedDotsLabel label={label} />}
          {!hasLog && p.currentFile ? ` · ${p.currentFile.split('/').pop()}` : ''}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-semibold tabular-nums text-foreground">{displayPct}%</span>
          {!hasLog && p.bytesTotal > 0 && (
            <span>
              {fmtBytes(p.bytesReceived)}/{fmtBytes(p.bytesTotal)}
              {p.bytesPerSec > 0 && !paused ? ` · ${fmtBytes(p.bytesPerSec)}/s` : ''}
            </span>
          )}
          {hasLog && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="font-medium text-primary hover:underline"
            >
              {expanded ? t('engineManager.hideDetails') : t('engineManager.showDetails')}
            </button>
          )}
        </div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all ${paused ? 'bg-warning' : 'bg-primary'}`}
          style={{ width: `${displayPct}%` }}
        />
      </div>
      {hasLog && expanded && <InstallLogBox lines={p.logLines!} t={t} />}
    </div>
  );
}

/** Hộp log cuộn — mở khi bấm "Chi tiết" bên trên (phase 'installing-runtime', pip install
 * stdout/stderr), tự cuộn xuống dòng mới nhất. */
function InstallLogBox({ lines, t }: { lines: string[]; t: TFunction }) {
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [lines.length]);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-2xs font-semibold text-muted-foreground">
        {t('engineManager.installLog')} ({lines.length})
      </span>
      <div
        ref={boxRef}
        className="max-h-40 space-y-px overflow-y-auto rounded-lg bg-foreground p-2 font-mono text-2xs leading-relaxed"
      >
        {lines.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-all text-background">{line}</div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status, bundled, t }: { status: string; bundled: boolean; t: TFunction }) {
  if (bundled || status === 'installed')
    return <span className="shrink-0 whitespace-nowrap rounded bg-success/15 px-2 py-0.5 text-2xs text-success">{t('engineManager.status.ready')}</span>;
  if (status === 'partial')
    return <span className="shrink-0 whitespace-nowrap rounded bg-warning/15 px-2 py-0.5 text-2xs text-warning-foreground">{t('engineManager.status.partial')}</span>;
  return <span className="shrink-0 whitespace-nowrap rounded bg-muted px-2 py-0.5 text-2xs text-muted-foreground">{t('engineManager.status.notDownloaded')}</span>;
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
