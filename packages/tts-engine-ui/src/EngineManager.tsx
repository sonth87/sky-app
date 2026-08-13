import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import {
  Download, Pause, Play, Trash2, AlertTriangle, CheckCircle2,
  FolderInput, FolderOutput, RefreshCw, FolderOpen, ExternalLink,
  ChevronRight, X, Zap, HardDrive, Cpu,
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

export interface EngineManagerContentProps {
  port: TtsEnginePort;
  canInstall?: boolean;
  notice?: ReactNode;
}

/** Trạng thái UI dẫn xuất cho 1 engine (từ install_status + progress đang chạy). */
type UiPhase = EngineInstallProgress['phase'] | 'idle';

/** `relative` là bắt buộc: bảng chi tiết engine phủ lên danh sách bằng `absolute inset-0`,
 * thiếu lớp neo này nó sẽ bám theo viewport thay vì khung cửa sổ. */
const CONTENT_CLASS = 'relative flex w-full flex-1 min-h-0 flex-col gap-3 overflow-y-auto p-5';

/**
 * Nội dung thuần của "Quản lý engine" — không tự bọc `FloatingWindow`. Tách khỏi
 * `EngineManager` (giờ chỉ còn là wrapper mỏng bên dưới) để dùng làm 1 tab trong
 * `ConfigWindow` (gộp Models/Engine + Effects + Logs + Settings vào 1 cửa sổ).
 *
 * Không nhận `open`: caller (ConfigWindow) quyết định mount hay không thay vì gate bằng
 * prop — mount = coi như "đang mở", unmount khi chuyển tab khác (huỷ subscribe tiến độ
 * cài đặt, giống hành vi đóng cửa sổ cũ).
 */
export function EngineManagerContent({ port, canInstall = false, notice }: EngineManagerContentProps) {
  const { t } = useTranslation();
  const [engines, setEngines] = useState<TtsEngines | null>(null);
  const [progress, setProgress] = useState<Record<string, EngineInstallProgress>>({});
  const [preflight, setPreflight] = useState<Record<string, TtsEnginePreflight>>({});
  const [busy, setBusy] = useState<string | null>(null); // engineId đang thao tác đồng bộ
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [diskUsage, setDiskUsage] = useState<Record<string, number>>({});
  /** Engine đang mở bảng chi tiết (null = đang xem danh sách). */
  const [detailId, setDetailId] = useState<string | null>(null);
  const [enginesDir, setEnginesDir] = useState<string>('');
  const progressRef = useRef<Record<string, EngineInstallProgress>>({});
  // Trạng thái tiến trình tts-service (đã có sẵn cho icon menu bar) — dùng ở đây để tự refresh
  // khi service CHUYỂN sang sẵn sàng, thay vì bắt người dùng đóng/mở lại cửa sổ.
  const { status: serviceStatus } = useTtsStatus(port);
  const prevServiceStatusRef = useRef(serviceStatus);

  const refresh = useCallback(async () => {
    const e = await port.listEngines();
    if (!e) return;
    setEngines(e);
    // Đồng bộ lại progress cục bộ theo `install_status` THẬT từ server — vá 2 bug thật
    // 2026-08-11: (1) event 'done' bị rớt (vd cửa sổ đổi webContents giữa chừng) khiến UI
    // đứng mãi ở phase cũ ("đang cài thư viện"...) dù backend đã cài xong từ lâu; (2) sau khi
    // Hủy xoá sạch thư mục, phase cũ (installing-runtime/paused/importing) vẫn hiện dù server
    // đã báo 'missing'. Chỉ coi là cũ (xoá) khi 2 trạng thái KHÔNG THỂ nào đúng cùng lúc —
    // vd 'installed' + phase khác 'done' luôn vô lý (đang cài dở thì server không thể đã báo
    // xong); 'missing' + đang ở installing-runtime/verifying/paused/importing cũng vô lý (các
    // phase đó đòi hỏi ĐÃ có file thật trên đĩa, server sẽ báo tối thiểu 'partial'). KHÔNG áp
    // dụng cho 'resolving'/'downloading' — 2 phase đó có thể trùng 'missing' trong khoảnh khắc
    // đầu (thư mục vừa tạo, chưa byte nào rơi xuống đĩa) của 1 lượt tải THẬT đang chạy, xoá
    // nhầm sẽ làm mất tiến độ hiển thị của lượt tải hợp lệ.
    let staleFound = false;
    for (const eng of e.engines) {
      const prog = progressRef.current[eng.id];
      if (!prog) continue;
      const stale = eng.install_status === 'installed'
        ? prog.phase !== 'done'
        : eng.install_status === 'missing'
          ? ['installing-runtime', 'verifying', 'paused', 'importing'].includes(prog.phase)
          : false;
      if (stale) { delete progressRef.current[eng.id]; staleFound = true; }
    }
    if (staleFound) setProgress({ ...progressRef.current });
    // Dung lượng từng engine (cho hiển thị + dọn đĩa). Chỉ có ở nền tảng cài được.
    if (!port.diskUsage) return;
    for (const eng of e.engines) {
      if (eng.bundled) continue;
      void port.diskUsage(eng.id).then((r) =>
        setDiskUsage((prev) => ({ ...prev, [eng.id]: r.bytes })));
    }
  }, [port]);

  // Không còn prop `open` — component chỉ được mount khi "đang mở" (caller quyết định qua
  // việc render hay không), nên mọi effect dưới đây coi mount = open, chạy ngay khi mount
  // thay vì chờ 1 flag riêng.
  useEffect(() => { void refresh(); }, [refresh]);

  // Đường dẫn thư mục lưu engine — chỉ nền tảng cài đặt tại chỗ mới có (Electron).
  useEffect(() => {
    if (!port.enginesDir) return;
    void port.enginesDir().then((r) => setEnginesDir(r.path));
  }, [port]);

  // Bug thật 2026-08-04: mở "Quản lý engine TTS" TRƯỚC KHI tts-service kịp start (vd vừa mở
  // app) → listEngines() trả về null (getPythonPort() chưa có), refresh() ở trên bỏ qua luôn
  // vì `if (!e) return`, và KHÔNG có cơ chế thử lại — danh sách trống vĩnh viễn cho tới khi
  // đóng/mở lại cửa sổ. Theo dõi serviceStatus (đã có sẵn, dùng chung icon menu bar) để tự
  // refresh() ngay khi service chuyển sang 'ok', không cần người dùng đóng/mở lại.
  useEffect(() => {
    if (serviceStatus === 'ok' && prevServiceStatusRef.current !== 'ok') void refresh();
    prevServiceStatusRef.current = serviceStatus;
  }, [serviceStatus, refresh]);

  // Subscribe tiến độ cài đặt.
  useEffect(() => {
    if (!port.onInstallProgress) return;
    const unsub = port.onInstallProgress((p) => {
      progressRef.current[p.engineId] = p;
      setProgress({ ...progressRef.current });
      // Cài xong / lỗi / hủy → refresh danh sách để cập nhật install_status.
      if (p.phase === 'done' || p.phase === 'error' || p.phase === 'canceled') void refresh();
      if (p.phase === 'canceled') setEngineMsg(p.engineId, t('engineManager.canceledMsg'));
    });
    return () => { unsub(); };
  }, [port, refresh]);

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
    // KHÔNG gọi port.verify() ở đây nữa (bỏ 2026-08-10). verify là dry-run spawn hẳn 1
    // process để nạp thử model — với engine nặng (VoxCPM: torch, model ~4.5GB) mất ~118
    // giây. Mà switchEngine bên dưới VẪN tự verify lần nữa trước khi restart, rồi process
    // mới lại nạp model lần thứ ba → 1 lần đổi engine nạp model 3 LẦN (~6 phút), đúng
    // triệu chứng "chuyển model cực kỳ lâu". Giờ switchEngine tự lo trọn: thử đổi tại chỗ
    // trước (tức thì nếu engine đã từng nạp), chỉ khi process không có runtime mới quay
    // về đường verify + restart. Xem docs/roadmap/plans/tts-engine-architecture.md GĐ A.
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

  const doUnload = async (id: string) => {
    setBusy(id);
    setEngineMsg(id, '');
    const r = await port.unloadEngine?.(id);
    setEngineMsg(id, r?.ok
      ? t('engineManager.unloaded')
      : t('engineManager.unloadFailed', { error: r?.error ?? t('engineManager.unknownError') }));
    await refresh();
    setBusy(null);
  };

  const doOpenFolder = async () => {
    const r = await port.openEnginesDir?.();
    if (r && !r.ok) setMsg((prev) => ({ ...prev, __folder: t('engineManager.openFolderFailed', { error: r.error ?? '' }) }));
  };

  const phaseOf = (e: TtsEngineInfo): UiPhase => {
    const p = progress[e.id];
    if (p && p.phase !== 'done') return p.phase;
    return 'idle';
  };

  /** Engine đang giữ ấm trong RAM → đổi sang là tức thì. Server cũ không trả `loaded`. */
  const isLoaded = (id: string) => !!engines?.loaded?.includes(id);

  return (
    <div className={CONTENT_CLASS}>
      <p className="text-xxs text-muted-foreground">{t('engineManager.description')}</p>

      {notice}

      {/* Nơi lưu trữ + nút mở thư mục — người vận hành cần biết dữ liệu nặng (model vài GB)
          nằm ở đâu để dọn đĩa, chép sang máy khác hoặc gửi kèm khi cần hỗ trợ. Chỉ hiện ở
          nền tảng cài đặt tại chỗ (Electron); bản Web không có khái niệm thư mục cục bộ. */}
      {enginesDir && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
          <div className="flex min-w-0 flex-col">
            <span className="text-2xs font-medium text-muted-foreground">{t('engineManager.storageLocation')}</span>
            <span className="truncate font-mono text-2xs text-foreground" title={enginesDir}>{enginesDir}</span>
          </div>
          <Button variant="secondary-outline" onClick={() => void doOpenFolder()} icon={<FolderOpen size={12} />}>
            {t('engineManager.openFolder')}
          </Button>
        </div>
      )}
      {msg.__folder && <p className="text-xxs text-destructive">{msg.__folder}</p>}

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

      {/* Danh sách gọn: 1 dòng / engine, gom theo nhóm model (sinh giọng nói / nhận dạng
          giọng nói / mô hình ngôn ngữ). Chi tiết + mọi thao tác nằm trong bảng mở ra khi
          bấm vào dòng — giữ danh sách quét mắt được khi số engine tăng lên.

          Tiêu đề nhóm CHỈ hiện khi có từ 2 nhóm trở lên: hiện tại toàn bộ model đều là
          'tts', thêm một tiêu đề "Sinh giọng nói" cô độc phía trên chỉ tốn chỗ mà không
          phân biệt được gì. */}
      <div className="flex flex-col gap-1.5">
        {groupByCategory(engines?.engines ?? []).map(([category, list, showHeader]) => (
        <div key={category} className="flex flex-col gap-1.5">
        {showHeader && (
          <div className="px-1 pt-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            {t(`engineManager.category.${category}`)}
          </div>
        )}
        {list.map((e) => {
          const phase = phaseOf(e);
          const p = progress[e.id];
          // `engines?.` (không phải `engines.`): trước đây `engines?.engines.map(...)`
          // tự thu hẹp kiểu bên trong callback, giờ đi qua `?? []` nên không còn.
          const isCurrent = engines?.current === e.id;
          const pct = p && p.bytesTotal > 0 ? Math.floor((p.bytesReceived / p.bytesTotal) * 100) : 0;
          const downloading = phase === 'downloading' || phase === 'resolving' || phase === 'importing' || phase === 'installing-runtime';
          const paused = phase === 'paused';
          const usedBytes = diskUsage[e.id] ?? 0;
          const estMb = e.install?.model?.total_mb ?? 0;

          return (
            <button
              key={e.id}
              type="button"
              onClick={() => setDetailId(e.id)}
              className="flex w-full items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
            >
              <EngineStatusIcon
                installStatus={e.install_status}
                bundled={e.bundled}
                isCurrent={isCurrent}
                loaded={isLoaded(e.id)}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
                  <span className="truncate">{e.label}</span>
                  {isCurrent && <span className="shrink-0 whitespace-nowrap rounded bg-success/15 px-1.5 py-0.5 text-2xs text-success">{t('engineManager.inUse')}</span>}
                  {!isCurrent && isLoaded(e.id) && (
                    <span className="shrink-0 whitespace-nowrap rounded bg-warning/15 px-1.5 py-0.5 text-2xs text-warning-foreground" title={t('engineManager.loadedHint')}>
                      {t('engineManager.loadedInMemory')}
                    </span>
                  )}
                </span>
                {(downloading || paused) && p && (
                  <span className="text-2xs text-muted-foreground">
                    {translatePhase(phase, t)} · {p.logLines?.length ? (p.installPct ?? 0) : pct}%
                  </span>
                )}
              </div>
              <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
                {usedBytes > 0 ? fmtBytes(usedBytes) : estMb > 0 ? `~${fmtBytes(estMb * 1024 * 1024)}` : ''}
              </span>
              <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
            </button>
          );
        })}
        </div>
        ))}
      </div>

      {/* Bảng chi tiết engine — phủ lên danh sách trong cùng cửa sổ (mẫu list → detail). */}
      {detailId && engines && (() => {
        const e = engines.engines.find((x) => x.id === detailId);
        if (!e) return null;
        const phase = phaseOf(e);
        const p = progress[e.id];
        const pf = preflight[e.id];
        const isCurrent = engines.current === e.id;
        const pct = p && p.bytesTotal > 0 ? Math.floor((p.bytesReceived / p.bytesTotal) * 100) : 0;
        const downloading = phase === 'downloading' || phase === 'resolving' || phase === 'importing' || phase === 'installing-runtime';
        const paused = phase === 'paused';
        const usedBytes = diskUsage[e.id] ?? 0;
        const repo = e.install?.model?.repo;

        return (
          <div className="absolute inset-0 z-10 flex flex-col overflow-y-auto bg-background p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 text-base font-semibold text-foreground">
                  {e.label}
                  {isCurrent && <span className="shrink-0 whitespace-nowrap rounded bg-success/15 px-1.5 py-0.5 text-2xs text-success">{t('engineManager.inUse')}</span>}
                </span>
                {repo && (
                  <a
                    href={`https://huggingface.co/${repo}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 font-mono text-2xs text-primary hover:underline"
                  >
                    {repo}<ExternalLink size={10} />
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDetailId(null)}
                aria-label={t('engineManager.backToList')}
                className="shrink-0 rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>

            <p className="pt-3 text-xs text-muted-foreground">{e.description}</p>

            {/* Thẻ thuộc tính: loại runtime, trạng thái tải, đĩa, yêu cầu phần cứng */}
            <div className="flex flex-wrap gap-1.5 pt-3">
              <span className="flex items-center gap-1 rounded bg-muted px-2 py-1 text-2xs text-muted-foreground">
                <Cpu size={11} />
                {e.runtime_kind ? t(`engineManager.runtime.${e.runtime_kind}`) : t('engineManager.runtimeKind')}
              </span>
              {e.bundled && (
                <span className="rounded bg-muted px-2 py-1 text-2xs text-muted-foreground">{t('engineManager.bundled')}</span>
              )}
              {isLoaded(e.id) && (
                <span className="flex items-center gap-1 rounded bg-warning/15 px-2 py-1 text-2xs text-warning-foreground" title={t('engineManager.loadedHint')}>
                  <Zap size={11} />{t('engineManager.loadedInMemory')}
                </span>
              )}
              <StatusBadge status={e.install_status} bundled={e.bundled} t={t} />
            </div>

            {usedBytes > 0 && (
              <p className="flex items-center gap-1.5 pt-3 text-2xs text-muted-foreground">
                <HardDrive size={11} />{t('engineManager.diskUsage')}: {fmtBytes(usedBytes)}
              </p>
            )}

            {e.requirements && (
              <p className="pt-1 text-2xs text-muted-foreground">
                {t('engineManager.requires')}: RAM ≥ {e.requirements.min_ram_gb}GB{e.requirements.needs_gpu ? ', GPU' : ''}
                {e.requirements.recommended_ram_gb ? ` (${t('engineManager.recommended')} ${e.requirements.recommended_ram_gb}GB)` : ''}
              </p>
            )}

            <div className="flex flex-col gap-2 pt-4">
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
                      <Button variant="primary" className="hover:opacity-90" onClick={() => doVerifyAndSwitch(e.id)} disabled={busy === e.id}
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
                {/* Hủy khi đang tải/tạm dừng — XOÁ HẲN mọi thứ đã tải/cài, không resume được
                    (khác Tạm dừng, giữ .part để tiếp tục). Xác nhận trước khi bấm — bug thật
                    2026-08-11: trước đây không có bước này, bấm Hủy lúc tưởng UI bị treo đã
                    âm thầm xoá mất model 4.5GB + runtime đã cài xong mà không có cảnh báo gì. */}
                {canInstall && (downloading || paused) && (
                  <Button
                    variant="danger-ghost"
                    onClick={async () => {
                      if (!confirm(t('engineManager.cancelConfirm', { label: e.label }))) return;
                      await port.installCancel?.(e.id);
                      void refresh();
                    }}
                    icon={<Trash2 size={12} />}
                  >
                    {t('engineManager.cancel')}
                  </Button>
                )}

                {/* Nhả RAM — chỉ có nghĩa khi engine đang giữ ấm và KHÔNG phải engine đang
                    dùng. Khác Xoá: dữ liệu trên đĩa còn nguyên, lần sau nạp lại ngay. */}
                {port.unloadEngine && isLoaded(e.id) && !isCurrent && (
                  <Button
                    variant="secondary-outline"
                    onClick={() => void doUnload(e.id)}
                    disabled={busy === e.id}
                    loading={busy === e.id}
                    icon={<Zap size={12} />}
                    title={t('engineManager.unloadHint')}
                  >
                    {t('engineManager.unload')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/**
 * Wrapper mỏng giữ nguyên API cũ (`open`/`onClose`/`portalContainer`) cho caller chưa
 * chuyển sang `ConfigWindow` — bọc `EngineManagerContent` trong `FloatingWindow`, y hệt
 * hành vi trước khi tách. KHÔNG xoá export này: tương thích ngược cho mọi nơi còn gọi
 * `<EngineManager open onClose ... />` trực tiếp.
 */
export function EngineManager({ open, onClose, port, canInstall = false, notice, portalContainer }: EngineManagerProps) {
  const { t } = useTranslation();
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
      // Neutral, không padding/select-none: FloatingWindow mặc định dùng layout cho nội
      // dung ngắn kiểu "About" (`items-center px-8 py-6 select-none`) — EngineManagerContent
      // tự áp CONTENT_CLASS (scroll, padding, gap) trên chính div gốc của nó, double-wrap
      // 2 lớp padding/behaviour khác nhau sẽ sai layout nếu không reset ở đây.
      // min-h-0 BẮT BUỘC (xem comment ở FloatingWindow.tsx's contentClassName): thiếu nó,
      // danh sách engine dài sẽ tràn ra ngoài rồi bị overflow-hidden của khung cửa sổ cắt
      // mất, thay vì được vùng cuộn bên trong EngineManagerContent xử lý đúng.
      contentClassName="flex min-h-0 flex-1 w-full flex-col"
      container={portalContainer}
    >
      <EngineManagerContent port={port} canInstall={canInstall} notice={notice} />
    </FloatingWindow>
  );
}

/**
 * Chấm trạng thái đầu mỗi dòng engine — quét mắt nhanh hơn đọc nhãn chữ:
 *   ✓ xanh  = đang dùng / sẵn sàng dùng
 *   ⚡ vàng = đã tải nhưng chưa nạp, hoặc đang giữ ấm
 *   ↓ xám  = chưa tải về máy
 */
/** Thứ tự hiển thị các nhóm model. Nhóm lạ (server mới hơn UI) xếp cuối, KHÔNG bị bỏ đi
 *  — thà hiện một tiêu đề chưa dịch còn hơn giấu mất model người dùng vừa tải. */
const CATEGORY_ORDER = ['tts', 'stt', 'llm'] as const;

/**
 * Gom engine theo `category`, giữ nguyên thứ tự trong từng nhóm.
 *
 * Trả `[category, engines, showHeader]` — `showHeader` là false khi chỉ có ĐÚNG 1 nhóm,
 * để không thêm một tiêu đề cô độc chẳng phân biệt được gì (hiện tại mọi model đều là
 * 'tts'; tiêu đề chỉ có ý nghĩa khi đã có model nhận dạng giọng nói / mô hình ngôn ngữ).
 */
function groupByCategory(
  engines: TtsEngineInfo[],
): Array<[string, TtsEngineInfo[], boolean]> {
  const groups = new Map<string, TtsEngineInfo[]>();
  for (const e of engines) {
    // Server cũ chưa trả `category` → coi như 'tts' (toàn bộ engine từng có đều là TTS).
    const key = e.category ?? 'tts';
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }

  const known = CATEGORY_ORDER.filter((c) => groups.has(c));
  const unknown = [...groups.keys()].filter((c) => !CATEGORY_ORDER.includes(c as never));
  const showHeader = groups.size > 1;
  return [...known, ...unknown].map((c) => [c, groups.get(c) ?? [], showHeader]);
}

function EngineStatusIcon({
  installStatus, bundled, isCurrent, loaded,
}: {
  installStatus: string;
  bundled: boolean;
  isCurrent: boolean;
  loaded: boolean;
}) {
  if (isCurrent) return <CheckCircle2 size={16} className="shrink-0 text-success" />;
  if (loaded) return <Zap size={16} className="shrink-0 text-warning-foreground" />;
  if (bundled || installStatus === 'installed') return <CheckCircle2 size={16} className="shrink-0 text-muted-foreground" />;
  if (installStatus === 'partial') return <AlertTriangle size={16} className="shrink-0 text-warning-foreground" />;
  return <Download size={16} className="shrink-0 text-muted-foreground" />;
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
