import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTimeVI, IMPORT_WARN_SIZE, formatGB } from '@sky-app/slide-shared';
import { useControlStore } from '../store';
import type { ImportPreview } from '@sky-app/slide-shared';
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
  const syncedAt = useControlStore((s) => s.syncedAt);
  const setMeta = useControlStore((s) => s.setMeta);
  const store = useControlStore();

  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<ActionKind | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  // Preview verify đang chờ xác nhận (import 2 pha)
  const [confirm, setConfirm] = useState<ImportPreview | null>(null);

  // Đăng ký listener progress một lần, giữ ref để không re-render
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    unsubRef.current = window.slide.onSyncProgress((p) => {
      setProgress({ step: p.step, pct: p.pct });
    });
    return () => unsubRef.current?.();
  }, []);

  // Đồng bộ store + hiển thị kết quả sau khi dữ liệu thay đổi thật.
  async function refreshStoreFromMeta(message: string, error: boolean) {
    const meta = await window.slide.getMeta();
    setMeta({
      ceremony: meta.ceremony,
      students: meta.students,
      syncedAt: meta.syncedAt,
      wsPort: meta.config?.ws_port ?? store.wsPort,
      mode: meta.config?.mode ?? store.mode,
      delaySeconds: meta.config?.delay_seconds ?? store.delaySeconds,
      apiEnvironment: meta.apiEnvironment ?? store.apiEnvironment,
    });
    const status = await window.slide.pregenGetStatus();
    useControlStore.setState({ pregenStatus: status });
    setMsg(message);
    setIsError(error);
  }

  async function runSync(zipPath?: string) {
    const kind: ActionKind = zipPath ? 'import' : 'refresh';
    setBusy(true);
    setAction(kind);
    setMsg(null);
    setIsError(false);
    setConfirm(null);
    setProgress({ step: kind === 'import' ? t('syncPanel.readingFile') : t('syncPanel.loadingData'), pct: 0 });
    try {
      const result = await window.slide.syncData(zipPath ? { zipPath } : undefined);

      // Import file local: verify xong → chờ user xác nhận, CHƯA ghi đè.
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
    setBusy(true);
    setAction('import');
    setConfirm(null);
    setProgress({ step: t('syncPanel.writingData'), pct: 78 });
    try {
      const result = await window.slide.confirmImport();
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
    await window.slide.cancelImport();
    setConfirm(null);
    setMsg(t('syncPanel.importCancelled'));
    setIsError(false);
  }

  async function handleRefresh() {
    await runSync();
  }

  async function handleImport() {
    const zipPath = await window.slide.openBundleFile();
    if (!zipPath) return; // user bấm Cancel
    // Cảnh báo trước nếu file nặng (dựa vào size, không đọc file).
    const { size } = await window.slide.statBundleFile(zipPath);
    if (size >= IMPORT_WARN_SIZE) {
      const ok = window.confirm(t('syncPanel.largeFileConfirm', { size: formatGB(size) }));
      if (!ok) return;
    }
    await runSync(zipPath);
  }

  async function handleExport() {
    setBusy(true);
    setAction('export');
    setMsg(null);
    setIsError(false);
    setProgress({ step: t('syncPanel.preparingData'), pct: 0 });
    try {
      const result = await window.slide.exportData();
      setMsg(result.message);
      setIsError(!result.ok);
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
          disabled={busy}
          title={t('syncPanel.importTitle')}
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
