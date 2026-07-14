import { Fragment, useEffect, useState, useRef } from 'react';
import {
  X,
  RefreshCw,
  Download,
  Trash2,
  CheckCircle,
  AlertCircle,
  Clock,
  Play,
  QrCode,
  Monitor,
  Info,
  CloudUpload,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useControlStore } from '../store';
import { showSuccessToast, showErrorToast } from '../lib/toast';
import { CopyButton } from './StudentList/CopyButton';
import { useSlide } from '../lib/slide';
import { VerticalResizeHandle } from './VerticalResizeHandle';

const MIN_HEIGHT = 180;

// Dựng lệnh curl tương đương từ request đã lưu trong log (URL/method/headers/body đã interpolate thực tế).
function buildCurlCommand(request: { url: string; method: string; headers: Record<string, string>; body?: string }): string {
  const parts = [`curl -X ${request.method}`, `'${request.url}'`];
  for (const [key, value] of Object.entries(request.headers || {})) {
    parts.push(`-H '${key}: ${value}'`);
  }
  if (request.body) {
    parts.push(`-d '${request.body.replace(/'/g, "'\\''")}'`);
  }
  return parts.join(' \\\n  ');
}

export function LogsDrawer() {
  const { t } = useTranslation();
  const slide = useSlide('logs');
  const setLogsDrawerOpen = useControlStore((s) => s.setLogsDrawerOpen);
  const logsDrawerHeight = useControlStore((s) => s.logsDrawerHeight);
  const setLogsDrawerHeight = useControlStore((s) => s.setLogsDrawerHeight);
  const [logs, setLogs] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | 'scan' | 'play' | 'clear' | 'api'>('all');
  const [search, setSearch] = useState('');
  const [isRetryingAll, setIsRetryingAll] = useState(false);
  const [isSubmittingLogs, setIsSubmittingLogs] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Kéo lên = tăng chiều cao (dy âm), kéo xuống = giảm. Max tính động theo
  // chiều cao thật của khối cha (window-body, gồm cả chính drawer) tại thời
  // điểm kéo — không hardcode, tự đúng theo mọi kích thước cửa sổ/resize.
  const handleResize = (dy: number) => {
    const parentHeight = drawerRef.current?.parentElement?.getBoundingClientRect().height;
    // Chừa ~40px cho phần Control phía trên luôn thấy được, dù drawer có to đến đâu.
    const maxHeight = parentHeight ? parentHeight - 40 : Infinity;
    const current = useControlStore.getState().logsDrawerHeight;
    setLogsDrawerHeight(Math.min(maxHeight, Math.max(MIN_HEIGHT, current - dy)));
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Tải dữ liệu ban đầu và đăng ký listener cập nhật thực tế
  useEffect(() => {
    if (!slide) return;
    slide.getLogs().then(setLogs);
    const unsub = slide.onLogsChanged((updatedLogs) => {
      setLogs(updatedLogs);
    });
    return unsub;
  }, [slide]);

  // Cuộn xuống cuối khi có log mới
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0; // Nhật ký xếp mới nhất ở đầu (unshift), nên cuộn lên đầu để xem log mới
    }
  }, [logs]);

  // Thử lại một dòng lỗi API
  const handleRetrySingle = async (logId: string) => {
    if (!slide) return;
    try {
      await slide.retryLog(logId);
      showSuccessToast(t('logsDrawer.toast.retryingSingle'));
    } catch (err) {
      showErrorToast(t('logsDrawer.toast.retrySingleError'));
    }
  };

  // Thử lại toàn bộ
  const handleRetryAll = async () => {
    if (!slide) return;
    setIsRetryingAll(true);
    try {
      await slide.retryAllFailed();
      showSuccessToast(t('logsDrawer.toast.retryingAll'));
    } catch (err) {
      showErrorToast(t('logsDrawer.toast.retryAllError'));
    } finally {
      setIsRetryingAll(false);
    }
  };

  // Xuất file txt
  const handleExport = async () => {
    if (!slide) return;
    try {
      const res = await slide.exportLogs();
      if (res.ok) {
        showSuccessToast(res.message);
      } else {
        showErrorToast(t('logsDrawer.toast.exportError', { message: res.message }));
      }
    } catch (err) {
      showErrorToast(t('logsDrawer.toast.exportConnectionError'));
    }
  };

  // Đẩy toàn bộ log lên API
  const handleSubmitLogs = async () => {
    if (!slide) return;
    setIsSubmittingLogs(true);
    try {
      const success = await slide.submitLogs();
      if (success) {
        showSuccessToast(t('logsDrawer.toast.submitSuccess'));
      } else {
        showErrorToast(t('logsDrawer.toast.submitError'));
      }
    } catch (err) {
      showErrorToast(t('logsDrawer.toast.submitConnectionError'));
    } finally {
      setIsSubmittingLogs(false);
    }
  };

  // Xóa logs
  const handleClear = async () => {
    if (!slide) return;
    if (confirm(t('logsDrawer.confirmClear'))) {
      try {
        await slide.clearLogs();
        showSuccessToast(t('logsDrawer.toast.clearSuccess'));
      } catch (err) {
        showErrorToast(t('logsDrawer.toast.clearError'));
      }
    }
  };

  // Lọc logs
  const filteredLogs = logs.filter((log) => {
    // Lọc theo tabs
    if (filter === 'scan' && log.action !== 'scan') return false;
    if (filter === 'play' && log.action !== 'play') return false;
    if (filter === 'clear' && log.action !== 'clear') return false;
    if (filter === 'api' && log.action !== 'api_call' && log.action !== 'api_retry') return false;

    // Lọc theo search
    if (search.trim()) {
      const q = search.toLowerCase();
      const nameMatch = log.studentName?.toLowerCase().includes(q);
      const codeMatch = log.studentCode?.toLowerCase().includes(q);
      const detailsMatch = log.details.toLowerCase().includes(q);
      const actionMatch = log.action.toLowerCase().includes(q);
      return nameMatch || codeMatch || detailsMatch || actionMatch;
    }
    return true;
  });

  // Tính toán thống kê
  const stats = {
    total: logs.length,
    scans: logs.filter((l) => l.action === 'scan').length,
    plays: logs.filter((l) => l.action === 'play').length,
    apiSuccess: logs.filter((l) => l.apiStatus === 'success').length,
    apiFailed: logs.filter((l) => l.apiStatus === 'failed').length,
    apiPending: logs.filter((l) => l.apiStatus === 'pending').length,
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'scan':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-foreground border border-border">
            <QrCode className="h-3 w-3" /> {t('logsDrawer.badge.scanQr')}
          </span>
        );
      case 'play':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-info/10 px-1.5 py-0.5 text-[10px] font-bold text-info-foreground border border-info/20">
            <Play className="h-3 w-3 fill-current" /> PLAY
          </span>
        );
      case 'clear':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-accent-foreground border border-accent">
            <Monitor className="h-3 w-3" /> {t('logsDrawer.badge.welcome')}
          </span>
        );
      case 'api_call':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold text-accent-foreground border border-accent">
            API CALL
          </span>
        );
      case 'api_retry':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-bold text-warning-foreground border border-warning/20">
            RETRY
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-foreground">
            {action.toUpperCase()}
          </span>
        );
    }
  };

  const getApiStatusBadge = (log: any) => {
    if (!log.apiStatus) return <span className="text-muted-foreground">—</span>;

    switch (log.apiStatus) {
      case 'success':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
            <CheckCircle className="h-3.5 w-3.5" /> {t('logsDrawer.apiStatus.success')}
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning animate-pulse">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> {t('logsDrawer.apiStatus.processing')}
          </span>
        );
      case 'failed':
        return (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-destructive" title={log.apiError}>
              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {t('logsDrawer.apiStatus.failed')}
            </span>
            <button
              onClick={() => handleRetrySingle(log.id)}
              className="rounded bg-info/10 px-2 py-0.5 text-[10px] font-medium text-info-foreground hover:bg-info/15 border border-info/30 cursor-pointer active:scale-95 transition-transform"
            >
              {t('logsDrawer.retry')}
            </button>
          </div>
        );
      default:
        return <span className="text-muted-foreground">{log.apiStatus}</span>;
    }
  };

  return (
    <div
      ref={drawerRef}
      className="flex flex-col border-t border-border bg-muted shadow-2xl z-40"
      style={{ height: logsDrawerHeight }}
    >
      <VerticalResizeHandle onDrag={handleResize} />
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2 select-none">
        <div className="flex items-center gap-3">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-bold text-foreground">{t('logsDrawer.header')}</h2>

          {/* Quick stats mini badges */}
          <div className="flex items-center gap-2 ml-4">
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
              {t('logsDrawer.stats.total', { count: stats.total })}
            </span>
            <span className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success border border-success/30">
              {t('logsDrawer.stats.apiOk', { count: stats.apiSuccess })}
            </span>
            {stats.apiFailed > 0 && (
              <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold text-destructive border border-destructive/30 animate-bounce">
                {t('logsDrawer.stats.apiFailed', { count: stats.apiFailed })}
              </span>
            )}
            {stats.apiPending > 0 && (
              <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning-foreground border border-warning/30">
                {t('logsDrawer.stats.apiPending', { count: stats.apiPending })}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {stats.apiFailed > 0 && (
            <button
              onClick={handleRetryAll}
              disabled={isRetryingAll || stats.apiPending > 0}
              className="flex items-center gap-1 rounded bg-info px-3 py-1 text-xs font-semibold text-info-foreground hover:bg-info/90 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <RefreshCw className={`h-3 w-3 ${isRetryingAll ? 'animate-spin' : ''}`} />
              {t('logsDrawer.retryAllFailed', { count: stats.apiFailed })}
            </button>
          )}
          <button
            onClick={handleExport}
            className="flex items-center gap-1 rounded border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted cursor-pointer"
            title={t('logsDrawer.exportTitle')}
          >
            <Download className="h-3 w-3" />
            {t('logsDrawer.exportFile')}
          </button>
          <button
            onClick={handleSubmitLogs}
            disabled={isSubmittingLogs}
            className="flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/10 cursor-pointer disabled:opacity-50"
            title={t('logsDrawer.submitTitle')}
          >
            <CloudUpload className={`h-3 w-3 ${isSubmittingLogs ? 'animate-pulse' : ''}`} />
            {t('logsDrawer.submitLogs')}
          </button>
          <button
            onClick={handleClear}
            className="flex items-center gap-1 rounded border border-border bg-card px-3 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10 cursor-pointer"
            title={t('logsDrawer.clearTitle')}
          >
            <Trash2 className="h-3 w-3" />
            {t('logsDrawer.clearLogs')}
          </button>
          <div className="w-[1px] h-5 bg-muted mx-1" />
          <button
            onClick={() => setLogsDrawerOpen(false)}
            className="rounded-full p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-1.5 select-none">
        <div className="flex items-center gap-1.5">
          {(['all', 'scan', 'play', 'clear', 'api'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                filter === tab
                  ? 'bg-foreground text-background'
                  : 'text-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {tab === 'all' && t('logsDrawer.filter.all')}
              {tab === 'scan' && t('logsDrawer.filter.scan', { count: stats.scans })}
              {tab === 'play' && t('logsDrawer.filter.play', { count: stats.plays })}
              {tab === 'clear' && t('logsDrawer.filter.clear')}
              {tab === 'api' && t('logsDrawer.filter.api', { count: stats.apiSuccess + stats.apiFailed + stats.apiPending })}
            </button>
          ))}
        </div>
        <div>
          <input
            type="text"
            placeholder={t('logsDrawer.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded border border-border px-3 py-0.5 text-xs text-foreground outline-none focus:border-info focus:ring-1 focus:ring-info w-60"
          />
        </div>
      </div>

      {/* Logs Table Area */}
      <div ref={scrollRef} className="flex-1 overflow-auto bg-muted">
        {filteredLogs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground select-none py-8">
            <Info className="h-8 w-8 mb-1.5 opacity-60" />
            <p className="text-xs">{t('logsDrawer.noMatch')}</p>
          </div>
        ) : (
          <table className="w-full table-fixed border-collapse text-left text-xs text-foreground">
            <thead className="sticky top-0 bg-muted text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border select-none">
              <tr>
                <th className="w-32 px-4 py-2">{t('logsDrawer.table.time')}</th>
                <th className="w-28 px-4 py-2">{t('logsDrawer.table.action')}</th>
                <th className="w-36 px-4 py-2">{t('logsDrawer.table.student')}</th>
                <th className="px-4 py-2">{t('logsDrawer.table.details')}</th>
                <th className="w-48 px-4 py-2">{t('logsDrawer.table.apiStatus')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono">
              {filteredLogs.map((log) => {
                let rowBg = '';
                if (log.apiStatus === 'failed') rowBg = 'bg-destructive/10 hover:bg-destructive/15';
                else if (log.apiStatus === 'success') rowBg = 'bg-success/10 hover:bg-success/15';
                else if (log.apiStatus === 'pending') rowBg = 'bg-warning/5 hover:bg-warning/10';
                else rowBg = 'hover:bg-muted/60';

                const expanded = expandedIds.has(log.id);
                const curlCommand = log.request ? buildCurlCommand(log.request) : null;

                return (
                  <Fragment key={log.id}>
                    <tr
                      className={`${rowBg} transition-colors cursor-pointer`}
                      onClick={() => toggleExpanded(log.id)}
                    >
                      <td className="px-4 py-1.5 whitespace-nowrap text-muted-foreground text-[10px]">
                        <div className="flex items-center gap-1">
                          {expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                          {log.timestamp}
                        </div>
                      </td>
                      <td className="px-4 py-1.5 whitespace-nowrap">{getActionBadge(log.action)}</td>
                      <td className="px-4 py-1.5 truncate text-[11px] font-sans font-medium text-foreground">
                        {log.studentCode ? (
                          <span title={`${log.studentName} (${log.studentCode})`}>
                            {log.studentName} <span className="text-[10px] text-muted-foreground font-mono">({log.studentCode})</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-1.5 truncate font-sans text-foreground" title={log.details}>
                        {log.details}
                      </td>
                      <td className="px-4 py-1.5 whitespace-nowrap select-none" onClick={(e) => e.stopPropagation()}>
                        {getApiStatusBadge(log)}
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-card">
                        <td colSpan={5} className="px-4 py-3">
                          <div className="flex flex-col gap-2 font-sans text-xs">
                            <div className="group flex items-start gap-1">
                              <span className="font-bold text-muted-foreground shrink-0">{t('logsDrawer.table.details')}:</span>
                              <span className="text-foreground break-words">{log.details}</span>
                            </div>
                            {log.apiError && (
                              <div className="group flex items-start gap-1">
                                <span className="font-bold text-destructive shrink-0">{t('logsDrawer.apiStatus.failed')}:</span>
                                <span className="text-destructive break-words flex-1">{log.apiError}</span>
                                <CopyButton text={log.apiError} />
                              </div>
                            )}
                            {log.request && (
                              <div className="flex flex-col gap-1 pt-1 border-t border-border">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-muted-foreground">curl</span>
                                  {curlCommand && <CopyButton text={curlCommand} label="curl" />}
                                </div>
                                <pre className="whitespace-pre-wrap break-all rounded bg-muted px-2 py-1.5 text-[11px] text-foreground">
                                  {curlCommand}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
