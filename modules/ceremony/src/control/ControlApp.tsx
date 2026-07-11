import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Toaster } from 'sonner';
import { useControlStore } from './store';
import { useSocket } from './hooks/useSocket';
import { useGlobalCardReader } from './hooks/useGlobalCardReader';
import { playErrorBeep } from './lib/sound';
import { showErrorToast } from './lib/toast';
import { setupDebugInspect } from './lib/debugInspect';
import { SocketContext } from './SocketContext';
import { ScrollProvider } from './ScrollContext';
import { ScanInbox } from './components/ScanInbox';
import { NowOnStage } from './components/NowOnStage';
import { PreviewPanel } from './components/PreviewPanel';
import { IdlePanel } from './components/IdlePanel';
import { StudentPanels } from './components/StudentPanels';
import { ModeSwitch } from './components/ModeSwitch';
import { HallSelector } from './components/HallSelector';
import { SyncPanel } from './components/SyncPanel';
import { DisplayPicker } from './components/DisplayPicker';
import { BackdropToggleCompact } from './components/BackdropToggle';
import { StatusBar } from './components/StatusBar';
import { LogsDrawer } from './components/LogsDrawer';
import { useAutoPlay } from './hooks/useAutoPlay';
import { TooltipProvider } from './components/ui/tooltip';
import { AboutModal } from './components/AboutModal';
import { SettingsModal } from './components/settings/SettingsModal';
import { ConfirmModal } from './components/ui/ConfirmModal';
import { showSuccessToast } from './lib/toast';
import { IMPORT_WARN_SIZE, formatGB } from '@sky-app/slide-shared';

/** Bỏ ký tự không phải chữ-số để khớp mã thẻ (CCCD đôi khi kèm khoảng trắng). */
const normalizeCode = (s: string | null | undefined) => {
  if (!s) return '';
  return s.replace(/[^a-zA-Z0-9]/g, '');
};

export interface ControlAppProps {
  /**
   * True khi Ceremony là app đang active/focus trong shell. Gate cho global
   * side-effect mà app không nên chạy khi ẩn/không focus: native menu action
   * (menu vẫn là của cả cửa sổ, không riêng app này) và global keyboard
   * listener (card reader — tránh bắt phím khi app khác đang gõ).
   */
  isActive?: boolean;
}

export function ControlApp({ isActive = true }: ControlAppProps = {}) {
  const { t } = useTranslation();
  const {
    ceremony, setMeta, students, setPythonStatus, logsDrawerOpen,
    language, aboutModalOpen, setAboutModalOpen, openSettingsModal,
    resetConfirmOpen, setResetConfirmOpen, deleteModalOpen, setDeleteModalOpen,
  } = useControlStore();
  const socketRef = useSocket();
  const { togglePlay, replayCode, countdown, progress, smoothProgress } = useAutoPlay();
  const [resetting, setResetting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Quẹt thẻ (đầu đọc HID): tìm SV theo MSSV, CCCD hoặc số điện thoại
  const handleCardScan = useCallback(
    (raw: string) => {
      let rawCode = raw;
      if (rawCode && rawCode.includes('|')) {
        const parts = rawCode.split('|');
        const first = parts.find((p) => p.trim());
        if (first) {
          rawCode = first.trim();
        }
      }
      const code = normalizeCode(rawCode);
      if (!code) return;

      const student = students.find(
        (s) =>
          s.student_code === code ||
          normalizeCode(s.identity_number) === code ||
          normalizeCode(s.phone_number) === code ||
          (s.card_code && normalizeCode(s.card_code) === code),
      );

      if (!student) {
        showErrorToast(t('controlApp.studentNotFound', { code }));
        playErrorBeep();
        return;
      }

      showSuccessToast(t('controlApp.studentAdded', { name: student.full_name }));
      socketRef.current?.emit('scan:qr', { student_code: student.student_code });
    },
    [socketRef, students, t],
  );

  useEffect(() => {
    let cancelled = false;

    // Poll liên tục cho đến khi nhận được trạng thái xác định (ready/error)
    // — tránh bỏ lỡ event nếu server đã ready trước khi window mount listener
    const poll = async () => {
      while (!cancelled) {
        try {
          const s = await window.slide.getTtsStatus?.();
          console.log('[ControlApp] poll getTtsStatus =>', s);
          if (s && !cancelled) {
            setPythonStatus(s.status, s.detail);
            if (s.status !== 'starting') break;
          }
        } catch (e) {
          console.warn('[ControlApp] getTtsStatus error:', e);
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    };
    poll();

    const unsub = window.slide.onPythonStatus?.((payload) => {
      setPythonStatus(payload.status, payload.detail);
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [setPythonStatus]);

  useEffect(() => {
    setupDebugInspect();
    window.slide.getMeta().then((meta) => {
      console.log('[ControlApp] Got meta, ws_port:', meta.config?.ws_port);
      setMeta({
        ceremony: meta.ceremony,
        students: meta.students,
        syncedAt: meta.syncedAt,
        wsPort: meta.config?.ws_port ?? 8765,
        mode: meta.config?.mode ?? 'manual',
        delaySeconds: meta.config?.delay_seconds ?? 0,
        idleTimeoutEnabled: meta.config?.idle_timeout_enabled ?? false,
        idleTimeoutSeconds: meta.config?.idle_timeout_seconds ?? 60,
        apiEnvironment: meta.apiEnvironment ?? 'prod',
      });

      // Load initial pre-gen audio files status
      window.slide.pregenGetStatus().then((status) => {
        useControlStore.setState({ pregenStatus: status });
      });
    });
  }, [setMeta]);

  // Báo main process ngôn ngữ hiện tại để rebuild native menu (labels App/Data/Develop/Help)
  useEffect(() => {
    window.slide.setAppLanguage(language);
  }, [language]);

  const handleImportZip = useCallback(async () => {
    const zipPath = await window.slide.openBundleFile();
    if (!zipPath) return;
    // Cảnh báo file nặng — nhất quán với SyncPanel.
    const { size } = await window.slide.statBundleFile(zipPath);
    if (size >= IMPORT_WARN_SIZE) {
      if (!window.confirm(t('debugMenu.largeFileConfirm', { size: formatGB(size) }))) return;
    }
    try {
      showSuccessToast(t('debugMenu.checkingData'));
      const result = await window.slide.syncData({ zipPath });

      // Import 2 pha: verify xong → hỏi xác nhận trước khi ghi đè.
      if (result.pendingConfirm) {
        const p = result.pendingConfirm;
        const ok = window.confirm(
          p.invalid.length > 0
            ? t('debugMenu.importConfirmWithErrors', { valid: p.valid, invalid: p.invalid.length, total: p.total })
            : t('debugMenu.importConfirm', { valid: p.valid, total: p.total })
        );
        if (!ok) { await window.slide.cancelImport(); return; }
        const committed = await window.slide.confirmImport();
        if (committed.ok) {
          showSuccessToast(t('debugMenu.importSuccess'));
          setTimeout(() => window.location.reload(), 1000);
        } else {
          alert(t('debugMenu.importError', { message: committed.message }));
        }
        return;
      }

      if (result.ok) {
        showSuccessToast(t('debugMenu.importSuccess'));
        setTimeout(() => window.location.reload(), 1000);
      } else {
        alert(t('debugMenu.importError', { message: result.message }));
      }
    } catch (err) {
      alert(t('debugMenu.genericError', { message: err instanceof Error ? err.message : String(err) }));
    }
  }, [t]);

  const handleExportZip = useCallback(async () => {
    try {
      const result = await window.slide.exportData();
      if (result.ok) {
        showSuccessToast(t('debugMenu.exportSuccess'));
      } else {
        if (result.message !== 'Đã hủy xuất file') {
          alert(t('debugMenu.exportError', { message: result.message }));
        }
      }
    } catch (err) {
      alert(t('debugMenu.genericError', { message: err instanceof Error ? err.message : String(err) }));
    }
  }, [t]);

  // Xử lý action từ native menu (App/Data/Develop)
  useEffect(() => {
    const unsub = window.slide.onMenuAction((id) => {
      if (!isActive) return; // menu là của cả cửa sổ — chỉ app active mới xử lý action
      switch (id) {
        case 'about':
          setAboutModalOpen(true);
          break;
        case 'settings:general':
          openSettingsModal('general');
          break;
        case 'settings:tts':
          openSettingsModal('tts');
          break;
        case 'settings:variable':
          openSettingsModal('variable');
          break;
        case 'settings:layout':
          openSettingsModal('layout');
          break;
        case 'settings:api':
          openSettingsModal('api');
          break;
        case 'settings:backup':
          openSettingsModal('backup');
          break;
        case 'data:import':
          handleImportZip();
          break;
        case 'data:export':
          handleExportZip();
          break;
        case 'data:reset:qr':
          setDeleteModalOpen('scans');
          break;
        case 'data:reset:students':
          setDeleteModalOpen('students');
          break;
        case 'data:reset:cache':
          setDeleteModalOpen('cache');
          break;
        case 'develop:sampleData':
          window.slide.getUseSampleData().then((val) => window.slide.setUseSampleData(!val).then(() => window.location.reload()));
          break;
        case 'develop:apiTest':
          openSettingsModal('api');
          break;
      }
    });
    return unsub;
  }, [isActive, handleImportZip, handleExportZip, openSettingsModal, setAboutModalOpen, setDeleteModalOpen]);

  // Global HID card reader: detect rapid input (5+ chars in 100ms) from any source.
  // Gated by isActive — don't steal keystrokes when another app in the shell has focus.
  useGlobalCardReader(handleCardScan, {
    minChars: 5,
    maxGapMs: 100,
    enabled: isActive,
  });

  return (
    <TooltipProvider>
    <ScrollProvider>
    <SocketContext.Provider value={socketRef}>
      <Toaster position="top-center" richColors closeButton />
      <div className="flex h-screen flex-col bg-slate-100">
        {/* Header */}
        <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-5 py-3">
          <h1 className="text-base font-bold">{ceremony?.name ?? t('controlApp.title')}</h1>
          <ModeSwitch />
          <HallSelector />
          <div className="ml-auto flex items-center gap-4">
            <BackdropToggleCompact />
          </div>
        </header>

        {/* Body: 2 cột */}
        <div className="grid flex-1 grid-cols-[1fr_360px] gap-4 overflow-hidden p-4">
          {/* Trái: 2 bảng SV song song (tất cả + đã quét) — min-w-0 để không đẩy cột phải ra ngoài */}
          <div className="min-w-0">
            <StudentPanels
              onCardScan={handleCardScan}
              togglePlay={togglePlay}
              replayCode={replayCode}
              countdown={countdown}
              progress={progress}
            />
          </div>

          {/* Phải: hộp quét + xem trước + on stage + idle + sync + display */}
          <div className="flex flex-col gap-4 overflow-auto">
            <ScanInbox />
            <NowOnStage progress={smoothProgress} />
            <PreviewPanel />
            <IdlePanel />
            <SyncPanel />
            <DisplayPicker />
          </div>
        </div>
        {logsDrawerOpen && <LogsDrawer />}
        <StatusBar />
      </div>
      <AboutModal open={aboutModalOpen} onClose={() => setAboutModalOpen(false)} />
      <SettingsModal />
      <ConfirmModal
        open={resetConfirmOpen}
        title={t('debugMenu.confirmResetTitle')}
        message={t('debugMenu.confirmResetMessage')}
        loading={resetting}
        onCancel={() => setResetConfirmOpen(false)}
        onConfirm={async () => {
          setResetting(true);
          const result = await window.slide.resetData();
          setResetting(false);
          if (result.ok) {
            alert(result.message);
            window.location.reload();
          } else {
            alert(t('debugMenu.genericError', { message: result.message }));
          }
          setResetConfirmOpen(false);
        }}
      />
      <ConfirmModal
        open={deleteModalOpen === 'students'}
        title={t('debugMenu.confirmDeleteStudentsTitle')}
        message={t('debugMenu.confirmDeleteStudentsMessage')}
        loading={deleting}
        countdownSeconds={10}
        onCancel={() => setDeleteModalOpen(false)}
        onConfirm={async () => {
          setDeleting(true);
          const result = await window.slide.resetStudents();
          setDeleting(false);
          if (result.ok) {
            showSuccessToast(t('debugMenu.deleteStudentsSuccess'));
            window.location.reload();
          } else {
            alert(t('debugMenu.genericError', { message: result.message }));
          }
          setDeleteModalOpen(false);
        }}
      />
      <ConfirmModal
        open={deleteModalOpen === 'scans'}
        title={t('debugMenu.confirmDeleteScansTitle')}
        message={t('debugMenu.confirmDeleteScansMessage')}
        loading={deleting}
        countdownSeconds={10}
        onCancel={() => setDeleteModalOpen(false)}
        onConfirm={async () => {
          setDeleting(true);
          const result = await window.slide.clearScans();
          setDeleting(false);
          if (result.ok) {
            showSuccessToast(t('debugMenu.deleteScansSuccess'));
            window.location.reload();
          } else {
            alert(t('debugMenu.genericError', { message: result.message }));
          }
          setDeleteModalOpen(false);
        }}
      />
      <ConfirmModal
        open={deleteModalOpen === 'cache'}
        title={t('debugMenu.confirmClearCacheTitle')}
        message={t('debugMenu.confirmClearCacheMessage')}
        loading={deleting}
        countdownSeconds={10}
        onCancel={() => setDeleteModalOpen(false)}
        onConfirm={async () => {
          setDeleting(true);
          const result = await window.slide.clearCache();
          setDeleting(false);
          if (result.ok) {
            showSuccessToast(t('debugMenu.clearCacheSuccess'));
          } else {
            alert(t('debugMenu.genericError', { message: result.message }));
          }
          setDeleteModalOpen(false);
        }}
      />
    </SocketContext.Provider>
    </ScrollProvider>
    </TooltipProvider>
  );
}
