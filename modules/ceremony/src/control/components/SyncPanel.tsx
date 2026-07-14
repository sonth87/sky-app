import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTimeVI, IMPORT_WARN_SIZE, formatGB } from '@sky-app/slide-shared';
import type { DataPort } from '@sky-app/service-contracts';
import { useControlStore } from '../store';
import type { ImportPreview } from '@sky-app/slide-shared';
import { usePlatform } from '../PlatformContext';
import { useSlide } from '../lib/slide';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

type ActionKind = 'refresh' | 'import' | 'export';

interface ProgressState {
  step: string;
  pct: number;
}

/** Panel "Dữ liệu" — làm mới từ server hoặc import/export file ZIP */
export function SyncPanel() {
  const { t } = useTranslation();
  const platform = usePlatform();
  const slide = useSlide('data-sync');
  const syncedAt = useControlStore((s) => s.syncedAt);
  const setMeta = useControlStore((s) => s.setMeta);
  const store = useControlStore();

  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<ActionKind | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  // Preview verify đang chờ xác nhận (import 2 pha) — chỉ đường zip-import Electron-only
  const [confirm, setConfirm] = useState<ImportPreview | null>(null);

  const dataPort = platform?.services.get<DataPort>('data');

  // Đăng ký listener progress một lần, giữ ref để không re-render.
  // onSyncProgress không có tương đương DataPort (xem platform-web/adapters/data.ts) —
  // guard-only, chỉ bắn khi chạy Electron.
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    unsubRef.current = slide?.onSyncProgress((p) => {
      setProgress({ step: p.step, pct: p.pct });
    }) ?? null;
    return () => unsubRef.current?.();
  }, [slide]);

  // Đồng bộ store + hiển thị kết quả sau khi dữ liệu thay đổi thật.
  async function refreshStoreFromMeta(message: string, error: boolean) {
    const raw = dataPort ? await dataPort.getMeta() : await slide?.getMeta();
    if (!raw) { setMsg(message); setIsError(error); return; }
    const meta = raw as {
      ceremony: unknown; students: unknown; syncedAt: string | null;
      config?: { ws_port?: number; mode?: string; delay_seconds?: number } | null;
      apiEnvironment?: string;
    };
    setMeta({
      ceremony: meta.ceremony as Parameters<typeof setMeta>[0]['ceremony'],
      students: meta.students as Parameters<typeof setMeta>[0]['students'],
      syncedAt: meta.syncedAt,
      wsPort: meta.config?.ws_port ?? store.wsPort,
      mode: (meta.config?.mode as Parameters<typeof setMeta>[0]['mode']) ?? store.mode,
      delaySeconds: meta.config?.delay_seconds ?? store.delaySeconds,
      apiEnvironment: (meta.apiEnvironment as Parameters<typeof setMeta>[0]['apiEnvironment']) ?? store.apiEnvironment,
    });
    // pregen queue ngoài phạm vi DataPort — Electron-only.
    const status = await slide?.pregenGetStatus();
    if (status) useControlStore.setState({ pregenStatus: status });
    setMsg(message);
    setIsError(error);
  }

  // Refresh (không zipPath) — qua DataPort nếu có (web), fallback window.slide (Electron).
  async function handleRefresh() {
    setBusy(true);
    setAction('refresh');
    setMsg(null);
    setIsError(false);
    setConfirm(null);
    setProgress({ step: t('syncPanel.loadingData'), pct: 0 });
    try {
      if (dataPort) {
        await dataPort.sync();
        await refreshStoreFromMeta(t('syncPanel.refreshDone', { defaultValue: 'Đã làm mới dữ liệu' }), false);
      } else if (slide) {
        const result = await slide.syncData(undefined);
        if (result.pendingConfirm) {
          if (result.warning) { setMsg(result.warning); setIsError(true); }
          setConfirm(result.pendingConfirm);
          return;
        }
        await refreshStoreFromMeta(result.message, result.offline || !result.ok);
        if (result.warning && !result.offline) { setMsg(result.warning); setIsError(true); }
      }
    } catch (e) {
      setMsg(t('syncPanel.errorPrefix', { message: e instanceof Error ? e.message : t('syncPanel.unknownError') }));
      setIsError(true);
    } finally {
      setBusy(false);
      setAction(null);
      setTimeout(() => setProgress(null), 1200);
    }
  }

  // Import/export file ZIP — Electron-only (file picker + AdmZip, không có tương đương DataPort web).
  async function runImportSync(zipPath: string) {
    setBusy(true);
    setAction('import');
    setMsg(null);
    setIsError(false);
    setConfirm(null);
    setProgress({ step: t('syncPanel.readingFile'), pct: 0 });
    try {
      const result = await slide?.syncData({ zipPath });
      if (!result) return;

      if (result.pendingConfirm) {
        if (result.warning) { setMsg(result.warning); setIsError(true); }
        setConfirm(result.pendingConfirm);
        return; // giữ busy=false ở finally, modal sẽ hiện
      }

      await refreshStoreFromMeta(result.message, result.offline || !result.ok);
      if (result.warning && !result.offline) { setMsg(result.warning); setIsError(true); }
    } catch (e) {
      setMsg(t('syncPanel.errorPrefix', { message: e instanceof Error ? e.message : t('syncPanel.unknownError') }));
      setIsError(true);
    } finally {
      setBusy(false);
      setAction(null);
      setTimeout(() => setProgress(null), 1200);
    }
  }

  async function handleConfirmImport() {
    if (!slide) return;
    setBusy(true);
    setAction('import');
    setConfirm(null);
    setProgress({ step: t('syncPanel.writingData'), pct: 78 });
    try {
      const result = await slide.confirmImport();
      await refreshStoreFromMeta(result.message, result.offline || !result.ok);
    } catch (e) {
      setMsg(t('syncPanel.errorPrefix', { message: e instanceof Error ? e.message : t('syncPanel.unknownError') }));
      setIsError(true);
    } finally {
      setBusy(false);
      setAction(null);
      setTimeout(() => setProgress(null), 1200);
    }
  }

  async function handleCancelImport() {
    await slide?.cancelImport();
    setConfirm(null);
    setMsg(t('syncPanel.importCancelled'));
    setIsError(false);
  }

  async function handleImport() {
    if (!slide) return;
    const zipPath = await slide.openBundleFile();
    if (!zipPath) return; // user bấm Cancel
    // Cảnh báo trước nếu file nặng (dựa vào size, không đọc file).
    const { size } = await slide.statBundleFile(zipPath);
    if (size >= IMPORT_WARN_SIZE) {
      const ok = window.confirm(t('syncPanel.largeFileConfirm', { size: formatGB(size) }));
      if (!ok) return;
    }
    await runImportSync(zipPath);
  }

  async function handleExport() {
    setBusy(true);
    setAction('export');
    setMsg(null);
    setIsError(false);
    setProgress({ step: t('syncPanel.preparingData'), pct: 0 });
    try {
      if (dataPort) {
        const students = await dataPort.exportData();
        setMsg(t('syncPanel.exportDone', { defaultValue: `Đã xuất ${students.length} bản ghi` }));
        setIsError(false);
      } else if (slide) {
        const result = await slide.exportData();
        setMsg(result.message);
        setIsError(!result.ok);
      }
    } catch (e) {
      setMsg(t('syncPanel.errorPrefix', { message: e instanceof Error ? e.message : t('syncPanel.unknownError') }));
      setIsError(true);
    } finally {
      setBusy(false);
      setAction(null);
      setTimeout(() => setProgress(null), 1200);
    }
  }

  const showProgress = busy && progress !== null;

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{t('syncPanel.title')}</div>

      {/* Hai nút ngang nhau */}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="md"
          fullWidth
          onClick={handleRefresh}
          disabled={busy}
          title={t('syncPanel.refreshTitle')}
          className="bg-foreground text-background hover:bg-foreground/90"
        >
          {busy && action === 'refresh' ? `↻ ${t('syncPanel.refreshing')}` : `↻ ${t('syncPanel.refresh')}`}
        </Button>
        <Button
          variant="secondary-outline"
          size="md"
          fullWidth
          onClick={handleImport}
          disabled={busy || !slide}
          title={slide ? t('syncPanel.importTitle') : t('syncPanel.electronOnly', { defaultValue: 'Cần chạy trên Electron' })}
        >
          {busy && action === 'import' ? `⬆ ${t('syncPanel.importing')}` : `⬆ ${t('syncPanel.importZip')}`}
        </Button>
        <Button
          variant="secondary-outline"
          size="md"
          fullWidth
          onClick={handleExport}
          disabled={busy}
          title={t('syncPanel.exportTitle')}
        >
          {busy && action === 'export' ? `⬇ ${t('syncPanel.exporting')}` : `⬇ ${t('syncPanel.exportZip')}`}
        </Button>
      </div>

      {/* Modal xác nhận sau khi verify — hiện số SV hợp lệ/lỗi trước khi ghi đè */}
      <Modal
        open={!!confirm}
        onClose={handleCancelImport}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary-outline" onClick={handleCancelImport}>
              {t('syncPanel.cancel')}
            </Button>
            <Button variant="primary" onClick={handleConfirmImport}>
              {t('syncPanel.overwriteAndImport')}
            </Button>
          </div>
        }
      >
        {confirm && (
          <>
            <div className="mb-2 text-sm font-semibold text-foreground">{t('syncPanel.confirmImportTitle')}</div>
            <div className="space-y-1 text-sm text-foreground">
              <div>
                {t('syncPanel.foundValid')} <span className="font-semibold text-success">{confirm.valid}</span> {t('syncPanel.validStudents')}
                {confirm.invalid.length > 0 && (
                  <> · <span className="font-semibold text-warning">{confirm.invalid.length}</span> {t('syncPanel.errors')}</>
                )}
                {' '}{t('syncPanel.outOfTotal', { total: confirm.total })}
              </div>
              {confirm.invalid.length > 0 && (
                <div className="max-h-28 overflow-y-auto rounded border border-warning/30 bg-warning/10 p-2 text-xs text-warning-foreground">
                  {confirm.invalid.slice(0, 20).map((iv) => (
                    <div key={iv.index}>#{iv.index + 1} {iv.code || t('syncPanel.noCode')}: {iv.reason}</div>
                  ))}
                  {confirm.invalid.length > 20 && <div>{t('syncPanel.andMoreErrors', { count: confirm.invalid.length - 20 })}</div>}
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                {t('syncPanel.importOverwriteNote')}
              </div>
            </div>
          </>
        )}
      </Modal>

      {/* Progress bar — chỉ hiện khi đang xử lý */}
      {showProgress && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>{progress.step}</span>
            <span>{progress.pct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-info transition-all duration-200"
              style={{ width: `${progress.pct}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-2 text-xs text-muted-foreground">
        {t('syncPanel.lastSync')}: {syncedAt ? formatTimeVI(syncedAt) : t('syncPanel.unknown')}
      </div>

      {msg && (
        <div className={`mt-1 text-xs ${isError ? 'text-warning' : 'text-success'}`}>
          {isError ? '⚠ ' : '✓ '}
          {msg}
        </div>
      )}
    </div>
  );
}
