import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Toaster } from 'sonner';
import { X } from 'lucide-react';
import { useStore as useDeviceLayoutStore, useMenuAction } from '@sonth87/device-layout';
import type { PlatformContext } from '@sky-app/kernel';
import type { DataPort } from '@sky-app/service-contracts';
import type { EventPort, DataSourcePort } from '@sky-app/service-contracts';
import { useControlStore } from './store';
import { useEventStore } from './eventStore';
import { EventGate } from './EventGate';
import { useSocket } from './hooks/useSocket';
import { useGlobalCardReader } from './hooks/useGlobalCardReader';
import { playErrorBeep } from './lib/sound';
import { showErrorToast } from './lib/toast';
import { setupDebugInspect } from './lib/debugInspect';
import { SocketContext } from './SocketContext';
import { ScrollProvider } from './ScrollContext';
import { PortalContainerContext } from './PortalContainerContext';
import { PlatformProvider } from './PlatformContext';
import { useSlide } from './lib/slide';
import { buildCeremonyThemeStyle } from './theme';
import { cn } from './lib/cn';
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
   * appId trong device-shell (luôn 'ceremony' trong sky-app hiện tại) — cần
   * để subscribe device-layout's useMenuAction (menu bar app-aware, chạy cả
   * web lẫn Electron). undefined khi ControlApp mount ngoài device-shell.
   */
  appId?: string;
  /**
   * Ports/capabilities của môi trường đang chạy (Electron/Web) — undefined
   * khi ControlApp mount ngoài device-shell (vd test, Storybook). Component
   * con lấy qua usePlatform() (control/PlatformContext.tsx) thay vì prop-drill.
   */
  platform?: PlatformContext;
  /**
   * True khi Ceremony là app đang active/focus trong shell. Gate cho global
   * side-effect mà app không nên chạy khi ẩn/không focus: native menu action
   * (menu vẫn là của cả cửa sổ, không riêng app này) và global keyboard
   * listener (card reader — tránh bắt phím khi app khác đang gõ).
   */
  isActive?: boolean;
}

export function ControlApp({ appId, platform, isActive = true }: ControlAppProps = {}) {
  const { t } = useTranslation();
  const {
    setMeta, students, setPythonStatus, logsDrawerOpen,
    language, aboutModalOpen, setAboutModalOpen, openSettingsModal,
    resetConfirmOpen, setResetConfirmOpen, deleteModalOpen, setDeleteModalOpen,
    themeMode, themePalette, appFont, letterSpacing, appSpacing, shadowLevel,
  } = useControlStore();
  const socketRef = useSocket();
  const { togglePlay, replayCode, countdown, progress, smoothProgress } = useAutoPlay();
  const [resetting, setResetting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const ceremonyRootRef = useRef<HTMLDivElement>(null);

  // Gate (Giai đoạn 3 kế hoạch Event) — thay việc đi thẳng vào dashboard, xem
  // docs/roadmap/plans/layout-designer/13-ceremony-mo-rong.md §"Cập nhật luồng tổng". Chỉ chạy
  // khi có EventPort đăng ký (Electron/web đã hoàn thiện adapter) — môi trường test/Storybook
  // (platform=undefined) bỏ qua Gate, activeEvent giữ null nhưng loading cũng false ngay từ đầu
  // (initial state), tránh treo màn hình "đang tải" vô thời hạn.
  const { activeEvent, loading: eventLoading, checkGate, exitToGate } = useEventStore();
  const [confirmExitEvent, setConfirmExitEvent] = useState(false);
  const eventPort = platform?.services.get<EventPort>('event');
  const dataSourcePortForGate = platform?.services.get<DataSourcePort>('dataSource');
  useEffect(() => {
    if (eventPort) {
      // checkGate() rethrow nếu getCurrentActive()/loadStudentsForEvent() lỗi (mất kết nối IPC/
      // network) — bắt lại đây để báo toast, tránh unhandled rejection im lặng khiến user thấy
      // Gate mà không hiểu vì sao (bug phát hiện qua review lại code, 2026-07-19; activateEvent()
      // đã có try/catch+toast ở caller EventGate.tsx, checkGate() lúc mount thì chưa).
      checkGate(eventPort, dataSourcePortForGate).catch((err: unknown) => {
        showErrorToast(t('eventGate.activateError', { message: err instanceof Error ? err.message : String(err) }));
      });
    } else {
      useEventStore.setState({ loading: false });
    }
  }, [eventPort, dataSourcePortForGate, checkGate, t]);

  // mode === 'system' kế thừa theme từ shell (device-layout) thay vì OS trực
  // tiếp — đúng trong ngữ cảnh app con chạy trong desktop-shell ảo. Không dùng
  // useTheme() vì device-layout không export hook đó — chỉ export useStore.
  const shellResolvedColorScheme = useDeviceLayoutStore((s) => s.resolvedColorScheme);
  const themeStyle = useMemo(
    () =>
      buildCeremonyThemeStyle({
        mode: themeMode,
        palette: themePalette,
        font: appFont,
        letterSpacing,
        appSpacing,
        shadowLevel,
        shellResolvedColorScheme,
      }),
    [themeMode, themePalette, appFont, letterSpacing, appSpacing, shadowLevel, shellResolvedColorScheme],
  );

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

  const slideForPython = useSlide('tts-python-status');

  useEffect(() => {
    if (!slideForPython) return;
    let cancelled = false;

    // Poll liên tục cho đến khi nhận được trạng thái xác định (ready/error)
    // — tránh bỏ lỡ event nếu server đã ready trước khi window mount listener
    const poll = async () => {
      while (!cancelled) {
        try {
          const s = await slideForPython.getTtsStatus?.();
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

    const unsub = slideForPython.onPythonStatus?.((payload) => {
      setPythonStatus(payload.status, payload.detail);
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [setPythonStatus, slideForPython]);

  const slideForMeta = useSlide('data-meta');

  useEffect(() => {
    setupDebugInspect();
    // DataPort nếu môi trường có đăng ký (web → apps/data-service; Electron
    // chưa có adapter DataPort, dùng window.slide trực tiếp — xem
    // docs/guides/ports-and-adapters.md, DataPort chỉ build cho web).
    const dataPort = platform?.services.get<DataPort>('data');
    const getMeta = dataPort ? dataPort.getMeta() : slideForMeta?.getMeta();
    getMeta?.then((raw) => {
      const meta = raw as {
        ceremony: unknown;
        students: unknown;
        syncedAt: string | null;
        config?: { ws_port?: number; mode?: string; delay_seconds?: number; idle_timeout_enabled?: boolean; idle_timeout_seconds?: number } | null;
        apiEnvironment?: string;
      };
      console.log('[ControlApp] Got meta, ws_port:', meta.config?.ws_port);
      setMeta({
        ceremony: meta.ceremony as Parameters<typeof setMeta>[0]['ceremony'],
        students: meta.students as Parameters<typeof setMeta>[0]['students'],
        syncedAt: meta.syncedAt ?? null,
        wsPort: meta.config?.ws_port ?? 8765,
        mode: (meta.config?.mode as Parameters<typeof setMeta>[0]['mode']) ?? 'manual',
        delaySeconds: meta.config?.delay_seconds ?? 0,
        idleTimeoutEnabled: meta.config?.idle_timeout_enabled ?? false,
        idleTimeoutSeconds: meta.config?.idle_timeout_seconds ?? 60,
        apiEnvironment: (meta.apiEnvironment as Parameters<typeof setMeta>[0]['apiEnvironment']) ?? 'prod',
      });

      // Load initial pre-gen audio files status — Electron-only (pregen queue ngoài phạm vi DataPort).
      slideForMeta?.pregenGetStatus().then((status) => {
        useControlStore.setState({ pregenStatus: status });
      });
    });
  }, [setMeta, platform, slideForMeta]);

  const slideForLanguage = useSlide('app-language');
  const slideForImportExport = useSlide('data-import-export');
  const slideForMenu = useSlide('native-menu');
  const slideForReset = useSlide('data-reset');

  // Báo main process ngôn ngữ hiện tại để rebuild native menu (labels App/Data/Develop/Help)
  useEffect(() => {
    slideForLanguage?.setAppLanguage(language);
  }, [language, slideForLanguage]);

  const handleImportZip = useCallback(async () => {
    const slide = slideForImportExport;
    if (!slide) return;
    const zipPath = await slide.openBundleFile();
    if (!zipPath) return;
    // Cảnh báo file nặng — nhất quán với SyncPanel.
    const { size } = await slide.statBundleFile(zipPath);
    if (size >= IMPORT_WARN_SIZE) {
      if (!window.confirm(t('debugMenu.largeFileConfirm', { size: formatGB(size) }))) return;
    }
    try {
      showSuccessToast(t('debugMenu.checkingData'));
      const result = await slide.syncData({ zipPath });

      // Import 2 pha: verify xong → hỏi xác nhận trước khi ghi đè.
      if (result.pendingConfirm) {
        const p = result.pendingConfirm;
        const ok = window.confirm(
          p.invalid.length > 0
            ? t('debugMenu.importConfirmWithErrors', { valid: p.valid, invalid: p.invalid.length, total: p.total })
            : t('debugMenu.importConfirm', { valid: p.valid, total: p.total })
        );
        if (!ok) { await slide.cancelImport(); return; }
        const committed = await slide.confirmImport();
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
  }, [t, slideForImportExport]);

  const handleExportZip = useCallback(async () => {
    const slide = slideForImportExport;
    if (!slide) return;
    try {
      const result = await slide.exportData();
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
  }, [t, slideForImportExport]);

  // Xử lý action từ menu — dùng chung cho cả 2 nguồn dispatch:
  // 1. window.slide.onMenuAction (Electron native OS menu, kênh cũ — guard qua slideForMenu).
  // 2. device-layout's useMenuAction (app:menu:action CustomEvent, từ AppModule.window.menuBarMenus —
  //    chạy cả web lẫn Electron, xem modules/ceremony/src/index.ts).
  // Cả 2 dispatch cùng action string nên dùng chung 1 handler, tránh duplicate logic.
  const handleMenuAction = useCallback((id: string) => {
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
        slideForMenu?.getUseSampleData().then((val) => slideForMenu.setUseSampleData(!val).then(() => window.location.reload()));
        break;
      case 'develop:apiTest':
        openSettingsModal('api');
        break;
      case 'event:exitToGate':
        // No-op nếu đang ở Gate (chưa có Event active) — MenuBarItem không tự ẩn theo runtime
        // state (xem comment ở index.ts's menuBarMenus), nên item LUÔN hiện trong menu bar dù
        // không phải lúc nào cũng có tác dụng. Giữ đúng hành vi nút X trong header: luôn hỏi
        // xác nhận trước khi rời, KHÔNG gọi thẳng exitToGate().
        if (activeEvent) setConfirmExitEvent(true);
        break;
    }
  }, [isActive, activeEvent, handleImportZip, handleExportZip, openSettingsModal, setAboutModalOpen, setDeleteModalOpen, slideForMenu]);

  useEffect(() => {
    const unsub = slideForMenu?.onMenuAction(handleMenuAction);
    return unsub;
  }, [slideForMenu, handleMenuAction]);

  // appId undefined khi ControlApp mount ngoài device-shell (test/Storybook) —
  // useMenuAction cần 1 appId cố định, bỏ qua subscribe trong trường hợp đó.
  useMenuAction(appId ?? '__no-app__', handleMenuAction);

  // Global HID card reader: detect rapid input (5+ chars in 100ms) from any source.
  // Gated by isActive — don't steal keystrokes when another app in the shell has focus.
  useGlobalCardReader(handleCardScan, {
    minChars: 5,
    maxGapMs: 100,
    enabled: isActive,
  });

  return (
    <PlatformProvider value={platform}>
    <PortalContainerContext.Provider value={ceremonyRootRef}>
    <TooltipProvider>
    <ScrollProvider>
    <SocketContext.Provider value={socketRef}>
      <div
        ref={ceremonyRootRef}
        // h-full (not h-screen/100vh): unlike the original standalone Electron
        // app this was ported from (where 100vh correctly matched the whole
        // window), Ceremony now renders inside device-layout's window-body
        // container — a flex-1 child sized to the window's actual body height,
        // which is smaller than the viewport (title bar, menu bar). h-screen
        // made this div taller than its container, forcing window-body's
        // overflow-auto to scroll the WHOLE app instead of Ceremony managing
        // its own internal scroll areas.
        className={cn('ceremony-root flex h-full flex-col bg-background', themeStyle.className)}
        data-theme={themeStyle.dataTheme}
        style={themeStyle.style}
      >
        <Toaster position="top-center" richColors closeButton />
        {/* Gate (Giai đoạn 3 kế hoạch Event) — activeEvent null → Gate thay vì dashboard. Khi
           eventPort chưa có (test/Storybook, platform=undefined) hoặc chưa từng kích hoạt Event
           nào, activeEvent giữ null vĩnh viễn và Gate hiện thay vì treo màn hình. */}
        {!activeEvent ? (
          eventLoading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {t('common.loading')}
            </div>
          ) : (
            <EventGate />
          )
        ) : (
          <>
            {/* Header */}
            <header className="flex items-center gap-4 border-b border-border bg-card px-5 py-3">
              {/* Tiêu đề = tên Event đang chạy (Giai đoạn 4b) — TRƯỚC ĐÓ hiện `ceremony?.name`
                 (config Ceremony cũ, mặc định "Lễ Trao Bằng Tốt Nghiệp", KHÔNG liên quan Event
                 nào đang chọn) gây trùng lặp/nhầm lẫn với chip tên Event bên cạnh (phát hiện qua
                 review UI thật, 2026-07-19) — bỏ hẳn `ceremony?.name` khỏi header, chỉ còn 1 nơi
                 hiện tên duy nhất. Nút X (câu hỏi mở 17-prompt-claude-design-control.md §5 chốt
                 qua AskUserQuestion 2026-07-19) quay lại màn Danh sách Event — CHỈ điều hướng UI
                 cục bộ (exitToGate KHÔNG đổi status DB), luôn hỏi xác nhận trước vì rời dashboard
                 dễ khiến người vận hành quên đang có lễ chạy dở. */}
              <button
                type="button"
                onClick={() => setConfirmExitEvent(true)}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={t('controlApp.exitEventButton') as string}
                title={t('controlApp.exitEventButton') as string}
              >
                <X size={16} />
              </button>
              <h1 className="max-w-xs truncate text-lg font-bold text-foreground" title={activeEvent.name}>
                {activeEvent.name}
              </h1>
              <div className="h-6 w-px shrink-0 bg-border" />
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
          </>
        )}
        {logsDrawerOpen && <LogsDrawer />}
        <StatusBar />
        <AboutModal open={aboutModalOpen} onClose={() => setAboutModalOpen(false)} />
        <SettingsModal />
        <ConfirmModal
          open={confirmExitEvent}
          title={t('controlApp.exitEventConfirmTitle')}
          message={t('controlApp.exitEventConfirmMessage')}
          danger={false}
          confirmLabel={t('controlApp.exitEventButton') as string}
          onCancel={() => setConfirmExitEvent(false)}
          onConfirm={() => {
            setConfirmExitEvent(false);
            exitToGate();
          }}
        />
        <ConfirmModal
          open={resetConfirmOpen}
          title={t('debugMenu.confirmResetTitle')}
          message={t('debugMenu.confirmResetMessage')}
          loading={resetting}
          onCancel={() => setResetConfirmOpen(false)}
          onConfirm={async () => {
            if (!slideForReset) return;
            setResetting(true);
            const result = await slideForReset.resetData();
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
            if (!slideForReset) return;
            setDeleting(true);
            const result = await slideForReset.resetStudents();
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
            if (!slideForReset) return;
            setDeleting(true);
            const result = await slideForReset.clearScans();
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
            if (!slideForReset) return;
            setDeleting(true);
            const result = await slideForReset.clearCache();
            setDeleting(false);
            if (result.ok) {
              showSuccessToast(t('debugMenu.clearCacheSuccess'));
            } else {
              alert(t('debugMenu.genericError', { message: result.message }));
            }
            setDeleteModalOpen(false);
          }}
        />
      </div>
    </SocketContext.Provider>
    </ScrollProvider>
    </TooltipProvider>
    </PortalContainerContext.Provider>
    </PlatformProvider>
  );
}
