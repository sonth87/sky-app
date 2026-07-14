import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { BackdropAspectRatio, Ceremony, OperatingMode, Student } from '@sky-app/slide-shared';
import i18n from './i18n';
import { STORAGE_KEY, OLD_STORAGE_KEY } from './storage-key';

export type ApiEnvironment = 'prod' | 'test';

export type Language = 'vi' | 'en';

export type SettingsTab = 'general' | 'appearance' | 'tts' | 'variable' | 'layout' | 'api' | 'backup';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ThemePalette =
  | 'green' | 'violet-bloom' | 'yellow' | 'tangerine' | 'summer' | 'starry-night'
  | 'blue' | 'red' | 'orange' | 'rose'
  | 'modern-minimal' | 'clean-slate' | 'amber-minimal' | 'graphite' | 'mono'
  | 'cosmic-night' | 'midnight-bloom' | 'caffeine'
  | 'bubblegum' | 'catppuccin'
  | 'ocean-breeze';

export type AppFont =
  | 'system-ui' | 'Inter' | 'Montserrat' | 'Roboto' | 'Be Vietnam Pro' | 'SF Pro Vietnamese'
  | 'Playfair Display' | 'EB Garamond' | 'Lora' | 'Crimson Pro' | 'Source Serif Pro';
export type ShadowLevel = 'none' | 'soft' | 'medium' | 'bold';

export type PreGenStudentStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface PreGenStatus {
  total: number;
  done: number;
  failed: number;
  pending: number;
  suspect: number;   // số file done nhưng có cảnh báo chất lượng
  running: boolean;
  paused: boolean;
  configChanged: boolean;
  currentStudentCode: string | null;
  students: Record<string, PreGenStudentStatus>;
  quality: Record<string, string[]>;  // studentCode -> flags (chỉ file bị flag)
}

export type PythonStatus = 'starting' | 'ready' | 'error';

interface ScanEvent {
  student: Student;
  ts: string;
}

export interface AutoPlayState {
  isPlaying: boolean;
  delaySeconds: number;
  playedCodes: string[];   // codes đã play xong (không tính đang play)
  currentCode: string | null;  // code đang play (chưa kết thúc timer)
}

interface ControlState {
  // dữ liệu
  ceremony: Ceremony | null;
  students: Student[];
  syncedAt: string | null;
  wsPort: number;

  // trạng thái realtime
  connected: boolean;
  mode: OperatingMode;
  onStage: Student | null;
  pending: Student | null;
  lastScan: ScanEvent | null;
  lastError: { code: string; message: string } | null;
  lastSuccess: { message: string } | null;

  // SV đang được chọn để xem trước (click trên bảng)
  selectedMsv: string | null;

  // Lịch sử các lần quét QR (mới nhất ở đầu)
  scanLog: ScanEvent[];

  // Bật/tắt confetti khi chuyển slide (đồng bộ từ server)
  confettiEnabled: boolean;
  // Lặp lại confetti sau mỗi 8 giây (đồng bộ từ server)
  confettiRepeat: boolean;
  // Chế độ bắn bổ sung nhẹ khi lặp lại (đồng bộ từ server)
  confettiBurst: boolean;
  // Số lượng hạt confetti: 'very_low'|'low'|'medium'|'high'|'very_high'
  confettiAmount: string;
  // Tốc độ rơi confetti: 'very_slow'|'slow'|'normal'|'fast'|'very_fast'
  confettiSpeed: string;
  // Kiểu bắn confetti: 'standard'|'sides'|'rain'|'cannon'|'center_up'
  confettiType: string;
  // Kiểu ribbon: 'none'|'wave'|'classic'
  confettiRibbon: string;
  // Preset màu sắc: 'colorful'|'gold'|'silver'|'pink'|'green'|'blue'|'red'|'purple'
  confettiColorStyle: string;
  // Hình dạng hạt: 'default'|'star'|'circle'|'square'
  confettiShape: string;
  // Thời gian tồn tại hạt: 'short'|'normal'|'long'|'very_long'
  confettiTicks: string;
  // Cấu hình nâng cao Ribbon
  ribbonConfig: {
    waveCount: number;
    waveLength: number;
    waveWidth: number;
    waveDistance: number;
    classicCount: number;
    classicMin: number;
    classicMax: number;
    spiralCount: number;
  };
  // Cấu hình kích cỡ và tỷ lệ hạt
  confettiSizeConfig: {
    scale: number;
    small: number;
    medium: number;
    large: number;
  };
  // Điều khiển mở modal cấu hình confetti nâng cao
  confettiModalOpen: boolean;

  // Bật/tắt TTS khi chuyển slide (đồng bộ từ server)
  ttsEnabled: boolean;

  // Model giọng đọc TTS đang chọn (đồng bộ từ server)
  ttsModel: string;

  // Tốc độ đọc TTS đang chọn (đồng bộ từ server)
  ttsSpeed: number;

  // Câu bắt đầu TTS đang chọn (đồng bộ từ server)
  ttsSentencePrefix: string;

  // Delay trước khi đọc TTS (giây) — để user chủ động khi nào đọc tên
  ttsDelay: number;

  // Template câu đọc với @variable (thay thế sentencePrefix)
  ttsTemplate: string;
  // Chế độ phát: realtime | pregen | pregen-fallback
  ttsPlayMode: 'realtime' | 'pregen' | 'pregen-fallback';
  ttsConditions: any[];
  customVariables: any[];
  ttsVoicePool: string[];
  // Điều khiển mở/đóng LogsDrawer (nhật ký hệ thống + gọi API)
  logsDrawerOpen: boolean;
  // Chiều cao LogsDrawer (px) — kéo được qua handle ở mép trên, kiểu bottom-sheet.
  logsDrawerHeight: number;
  // Modal About (menu native App > About)
  aboutModalOpen: boolean;
  // Modal Settings gộp (General/TTS/Variable/Layout/Api) + tab đang chọn
  settingsModalOpen: boolean;
  settingsModalTab: SettingsTab;
  // Xác nhận reset toàn bộ dữ liệu ceremony (menu native Data > Reset > ...)
  resetConfirmOpen: boolean;
  // Xác nhận xóa từng loại dữ liệu: false = đóng, hoặc loại đang xác nhận xóa
  deleteModalOpen: false | 'students' | 'scans' | 'cache';
  layoutOverrides: Record<string, any>;
  // Tỷ lệ màn hình backdrop đang chiếu (đồng bộ từ server)
  backdropAspectRatio: BackdropAspectRatio;
  // Trạng thái pre-generation job hiện tại (null = chưa có)
  pregenStatus: PreGenStatus | null;

  awardLocationCode: number;

  // Đếm ngược "tự động về màn chờ" (đồng bộ từ server qua event:idleTimer)
  idleTimer: { active: boolean; totalSeconds: number; startedAt: string | null };

  // TTS engine (Python server) status
  pythonStatus: PythonStatus;
  pythonStatusDetail: string;
  /** Tăng để buộc useVoiceCatalog fetch lại (sau khi clone/xoá giọng) */
  voiceCatalogNonce: number;

  // Auto play
  autoPlay: AutoPlayState;

  // Cấu hình delay trước khi chuyển slide khi quét QR (giây)
  delaySeconds: number;

  // Tự động về màn chờ sau N giây không có SV mới được play (cả auto+manual). Mặc định TẮT.
  idleTimeoutEnabled: boolean;
  idleTimeoutSeconds: number;

  // Môi trường gọi API tích hợp
  apiEnvironment: ApiEnvironment;

  // Ngôn ngữ giao diện
  language: Language;

  // Theme: chế độ sáng/tối/theo hệ thống + bảng màu đang chọn (6 theme)
  themeMode: ThemeMode;
  themePalette: ThemePalette;

  // Appearance: font chữ, letter-spacing, spacing, độ đậm bóng đổ (tab Appearance)
  appFont: AppFont;
  letterSpacing: number; // em, áp vào --tracking-normal
  appSpacing: number; // rem, áp vào --spacing
  shadowLevel: ShadowLevel;

  // setters
  setMeta: (p: {
    ceremony: Ceremony | null;
    students: Student[];
    syncedAt: string | null;
    wsPort: number;
    mode: OperatingMode;
    delaySeconds: number;
    idleTimeoutEnabled?: boolean;
    idleTimeoutSeconds?: number;
    apiEnvironment: ApiEnvironment;
  }) => void;
  setDelaySeconds: (secs: number) => void;
  setIdleTimeoutEnabled: (v: boolean) => void;
  setIdleTimeoutSeconds: (secs: number) => void;
  setApiEnvironment: (env: ApiEnvironment) => void;
  setLanguage: (lang: Language) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setThemePalette: (palette: ThemePalette) => void;
  setAppFont: (font: AppFont) => void;
  setLetterSpacing: (v: number) => void;
  setAppSpacing: (v: number) => void;
  setShadowLevel: (v: ShadowLevel) => void;
  setConnected: (v: boolean) => void;
  setMode: (m: OperatingMode) => void;
  setOnStage: (s: Student | null) => void;
  setPending: (s: Student | null) => void;
  setLastScan: (e: ScanEvent | null) => void;
  setLastError: (e: { code: string; message: string } | null) => void;
  setLastSuccess: (e: { message: string } | null) => void;
  setSelectedMsv: (msv: string | null) => void;
  pushScan: (e: ScanEvent) => void;
  setConfettiEnabled: (v: boolean) => void;
  setConfettiRepeat: (v: boolean) => void;
  setConfettiBurst: (v: boolean) => void;
  setConfettiAmount: (v: string) => void;
  setConfettiSpeed: (v: string) => void;
  setConfettiType: (v: string) => void;
  setConfettiRibbon: (v: string) => void;
  setConfettiColorStyle: (v: string) => void;
  setConfettiShape: (v: string) => void;
  setConfettiTicks: (v: string) => void;
  setRibbonConfig: (config: Partial<ControlState['ribbonConfig']>) => void;
  setConfettiSizeConfig: (config: Partial<ControlState['confettiSizeConfig']>) => void;
  setConfettiModalOpen: (v: boolean) => void;
  setTtsEnabled: (v: boolean) => void;
  setTtsModel: (v: string) => void;
  setTtsSpeed: (v: number) => void;
  setTtsSentencePrefix: (v: string) => void;
  setTtsDelay: (v: number) => void;
  setTtsTemplate: (v: string) => void;
  setTtsPlayMode: (v: 'realtime' | 'pregen' | 'pregen-fallback') => void;
  setTtsConditions: (v: any[]) => void;
  setCustomVariables: (v: any[]) => void;
  setTtsVoicePool: (v: string[]) => void;
  setLogsDrawerOpen: (v: boolean) => void;
  setLogsDrawerHeight: (v: number) => void;
  setAboutModalOpen: (v: boolean) => void;
  openSettingsModal: (tab?: SettingsTab) => void;
  setSettingsModalOpen: (v: boolean) => void;
  setSettingsModalTab: (v: SettingsTab) => void;
  setResetConfirmOpen: (v: boolean) => void;
  setDeleteModalOpen: (v: false | 'students' | 'scans' | 'cache') => void;
  setLayoutOverrides: (v: Record<string, any>) => void;
  setBackdropAspectRatio: (v: BackdropAspectRatio) => void;
  setPregenStatus: (v: PreGenStatus | null) => void;
  setAwardLocationCode: (v: number) => void;
  setIdleTimer: (v: { active: boolean; totalSeconds: number; startedAt: string | null }) => void;
  patchStudentLocal: (code: string, patch: Partial<Student>) => void;
  setAutoPlay: (patch: Partial<AutoPlayState>) => void;
  /** Xóa 1 code khỏi autoPlay.playedCodes (khi quét lại SV đã play) */
  markUnplayed: (code: string) => void;
  setPythonStatus: (status: PythonStatus, detail?: string) => void;
  refreshVoiceCatalog: () => void;

  // Hiển thị bảng tất cả sinh viên
  showAllStudents: boolean;
  setShowAllStudents: (v: boolean) => void;
}

export const useControlStore = create<ControlState>()(
  persist(
    (set) => ({
  ceremony: null,
  students: [],
  syncedAt: null,
  wsPort: 8765,

  connected: false,
  mode: 'manual',
  onStage: null,
  pending: null,
  lastScan: null,
  lastError: null,
  lastSuccess: null,
  selectedMsv: null,
  scanLog: [],
  confettiEnabled: true,
  confettiRepeat: true,
  confettiBurst: false,
  confettiAmount: 'high',
  confettiSpeed: 'normal',
  confettiType: 'standard',
  confettiRibbon: 'wave',
  confettiColorStyle: 'gold',
  confettiShape: 'star',
  confettiTicks: 'normal',
  ribbonConfig: {
    waveCount: 6,
    waveLength: 65,
    waveWidth: 2.5,
    waveDistance: 5,
    classicCount: 10,
    classicMin: 28,
    classicMax: 87,
    spiralCount: 10,
  },
  confettiSizeConfig: {
    scale: 1.0,
    small: 25,
    medium: 60,
    large: 15,
  },
  confettiModalOpen: false,
  ttsEnabled: true,
  ttsModel: 'vieneu-NF',
  ttsSpeed: 1.0,
  ttsSentencePrefix: '',
  ttsDelay: 1.5,
  ttsTemplate: '',
  ttsPlayMode: 'pregen-fallback' as const,
  ttsConditions: [],
  customVariables: [],
  ttsVoicePool: ['vieneu-NF', 'vieneu-NM1'],
  logsDrawerOpen: false,
  logsDrawerHeight: 288, // = h-72 cũ, giữ nguyên trải nghiệm mặc định
  aboutModalOpen: false,
  settingsModalOpen: false,
  settingsModalTab: 'general' as SettingsTab,
  resetConfirmOpen: false,
  deleteModalOpen: false as false | 'students' | 'scans' | 'cache',
  layoutOverrides: {},
  backdropAspectRatio: '16:9' as const,
  pregenStatus: null,

  awardLocationCode: 0,

  idleTimer: { active: false, totalSeconds: 0, startedAt: null },

  pythonStatus: 'starting' as PythonStatus,
  pythonStatusDetail: '',
  voiceCatalogNonce: 0,

  autoPlay: {
    isPlaying: false,
    delaySeconds: 15,
    playedCodes: [],
    currentCode: null,
  },

  delaySeconds: 0,
  idleTimeoutEnabled: false,
  idleTimeoutSeconds: 60,
  apiEnvironment: 'prod' as ApiEnvironment,
  language: 'vi' as Language,
  themeMode: 'system' as ThemeMode,
  themePalette: 'green' as ThemePalette,
  appFont: 'Inter' as AppFont,
  letterSpacing: 0,
  appSpacing: 0.25,
  shadowLevel: 'medium' as ShadowLevel,

  setMeta: ({ ceremony, students, syncedAt, wsPort, mode, delaySeconds, idleTimeoutEnabled, idleTimeoutSeconds, apiEnvironment }) =>
    set({
      ceremony,
      students,
      syncedAt,
      wsPort,
      mode,
      delaySeconds,
      idleTimeoutEnabled: idleTimeoutEnabled ?? false,
      idleTimeoutSeconds: idleTimeoutSeconds ?? 60,
      apiEnvironment,
    }),
  setDelaySeconds: (delaySeconds) => set({ delaySeconds }),
  setIdleTimeoutEnabled: (idleTimeoutEnabled) => set({ idleTimeoutEnabled }),
  setIdleTimeoutSeconds: (idleTimeoutSeconds) => set({ idleTimeoutSeconds }),
  setApiEnvironment: (apiEnvironment) => set({ apiEnvironment }),
  setLanguage: (language) => {
    i18n.changeLanguage(language);
    set({ language });
  },
  setThemeMode: (themeMode) => set({ themeMode }),
  setThemePalette: (themePalette) => set({ themePalette }),
  setAppFont: (appFont) => set({ appFont }),
  setLetterSpacing: (letterSpacing) => set({ letterSpacing }),
  setAppSpacing: (appSpacing) => set({ appSpacing }),
  setShadowLevel: (shadowLevel) => set({ shadowLevel }),
  setConnected: (connected) => set({ connected }),
  setMode: (mode) => set({ mode }),
  setOnStage: (onStage) => set({ onStage }),
  setPending: (pending) => set({ pending }),
  setLastScan: (lastScan) => set({ lastScan }),
  setLastError: (lastError) => set({ lastError }),
  setLastSuccess: (lastSuccess) => set({ lastSuccess }),
  setSelectedMsv: (selectedMsv) => set({ selectedMsv }),
  pushScan: (e) =>
    set((state) => {
      // Bỏ qua nếu trùng SV với lần quét gần nhất (chống debounce nhân đôi từ HID)
      if (state.scanLog[0]?.student.student_code === e.student.student_code) return state;
      // Nếu SV đã có trong scanLog (quét lại): xóa entry cũ, đưa lên đầu để giữ thứ tự mới nhất
      const filtered = state.scanLog.filter(
        (x) => x.student.student_code !== e.student.student_code,
      );
      return { scanLog: [e, ...filtered] };
    }),
  setConfettiEnabled: (confettiEnabled) => set({ confettiEnabled }),
  setConfettiRepeat: (confettiRepeat) => set({ confettiRepeat }),
  setConfettiBurst: (confettiBurst) => set({ confettiBurst }),
  setConfettiAmount: (confettiAmount) => set({ confettiAmount }),
  setConfettiSpeed: (confettiSpeed) => set({ confettiSpeed }),
  setConfettiType: (confettiType) => set({ confettiType }),
  setConfettiRibbon: (confettiRibbon) => set({ confettiRibbon }),
  setConfettiColorStyle: (confettiColorStyle) => set({ confettiColorStyle }),
  setConfettiShape: (confettiShape) => set({ confettiShape }),
  setConfettiTicks: (confettiTicks: string) => set({ confettiTicks }),
  setRibbonConfig: (config) =>
    set((state) => ({ ribbonConfig: { ...state.ribbonConfig, ...config } })),
  setConfettiSizeConfig: (config) =>
    set((state) => ({ confettiSizeConfig: { ...state.confettiSizeConfig, ...config } })),
  setConfettiModalOpen: (confettiModalOpen) => set({ confettiModalOpen }),
  setTtsEnabled: (ttsEnabled) => set({ ttsEnabled }),
  setTtsModel: (ttsModel) => set({ ttsModel }),
  setTtsSpeed: (ttsSpeed) => set({ ttsSpeed }),
  setTtsSentencePrefix: (ttsSentencePrefix) => set({ ttsSentencePrefix }),
  setTtsDelay: (ttsDelay) => set({ ttsDelay }),
  setTtsTemplate: (ttsTemplate) => set({ ttsTemplate }),
  setTtsPlayMode: (ttsPlayMode) => set({ ttsPlayMode }),
  setTtsConditions: (ttsConditions) => set({ ttsConditions }),
  setCustomVariables: (customVariables) => set({ customVariables }),
  setTtsVoicePool: (ttsVoicePool) => set({ ttsVoicePool }),
  setLogsDrawerOpen: (logsDrawerOpen) => set({ logsDrawerOpen }),
  setLogsDrawerHeight: (logsDrawerHeight) => set({ logsDrawerHeight }),
  setAboutModalOpen: (aboutModalOpen) => set({ aboutModalOpen }),
  openSettingsModal: (tab) => set({ settingsModalOpen: true, settingsModalTab: tab ?? 'general' }),
  setSettingsModalOpen: (settingsModalOpen) => set({ settingsModalOpen }),
  setSettingsModalTab: (settingsModalTab) => set({ settingsModalTab }),
  setResetConfirmOpen: (resetConfirmOpen) => set({ resetConfirmOpen }),
  setDeleteModalOpen: (deleteModalOpen) => set({ deleteModalOpen }),
  setLayoutOverrides: (layoutOverrides) => set({ layoutOverrides }),
  setBackdropAspectRatio: (backdropAspectRatio) => set({ backdropAspectRatio }),
  setPregenStatus: (pregenStatus) => set({ pregenStatus }),
  setAwardLocationCode: (awardLocationCode) => set({ awardLocationCode }),
  setIdleTimer: (idleTimer) => set({ idleTimer }),
  patchStudentLocal: (code, patch) =>
    set((state) => ({
      students: state.students.map((s) => (s.student_code === code ? { ...s, ...patch } : s)),
    })),
  setAutoPlay: (patch) =>
    set((state) => ({ autoPlay: { ...state.autoPlay, ...patch } })),
  markUnplayed: (code) =>
    set((state) => ({
      autoPlay: {
        ...state.autoPlay,
        playedCodes: state.autoPlay.playedCodes.filter((c) => c !== code),
      },
    })),
  setPythonStatus: (status, detail = '') => set({ pythonStatus: status, pythonStatusDetail: detail }),
  refreshVoiceCatalog: () => set((s) => ({ voiceCatalogNonce: s.voiceCatalogNonce + 1 })),
  showAllStudents: true,
  setShowAllStudents: (showAllStudents) => set({ showAllStudents }),
}),
    {
      name: STORAGE_KEY,
      // GĐ7.5 BUG-005: bản gốc (trao-bang-tot-nghiep-2026) dùng key 'slide-control-storage'.
      // Khi port sang Ceremony, key đổi tên nhưng thiếu bước migrate — user nâng cấp từ app cũ
      // mất toàn bộ cấu hình đã lưu (confetti/tts/theme/language...).
      //
      // zustand/persist's `migrate` option CHỈ chạy khi `storage.getItem(name)` (đọc theo
      // key MỚI) trả về 1 giá trị non-null có `version` khác — nếu key mới hoàn toàn không
      // tồn tại (đúng tình huống bug này), `migrate` không bao giờ được gọi (xem
      // zustand/esm/middleware.mjs's `hydrate()`, dòng ~391: `if (deserializedStorageValue)`).
      // Do đó phải tự viết `storage.getItem` fallback đọc key CŨ khi key mới rỗng, thay vì
      // dựa vào `migrate`.
      storage: createJSONStorage(() => ({
        getItem: (name: string) => localStorage.getItem(name) ?? localStorage.getItem(OLD_STORAGE_KEY),
        setItem: (name: string, value: string) => localStorage.setItem(name, value),
        removeItem: (name: string) => localStorage.removeItem(name),
      })),
      partialize: (state) => ({
        showAllStudents: state.showAllStudents,
        confettiEnabled: state.confettiEnabled,
        confettiRepeat: state.confettiRepeat,
        confettiBurst: state.confettiBurst,
        confettiAmount: state.confettiAmount,
        confettiSpeed: state.confettiSpeed,
        confettiType: state.confettiType,
        confettiRibbon: state.confettiRibbon,
        confettiColorStyle: state.confettiColorStyle,
        confettiShape: state.confettiShape,
        confettiTicks: state.confettiTicks,
        ribbonConfig: state.ribbonConfig,
        confettiSizeConfig: state.confettiSizeConfig,
        ttsDelay: state.ttsDelay,
        ttsTemplate: state.ttsTemplate,
        ttsPlayMode: state.ttsPlayMode,
        ttsConditions: state.ttsConditions,
        customVariables: state.customVariables,
        ttsVoicePool: state.ttsVoicePool,
        awardLocationCode: state.awardLocationCode,
        delaySeconds: state.delaySeconds,
        language: state.language,
        themeMode: state.themeMode,
        themePalette: state.themePalette,
        appFont: state.appFont,
        letterSpacing: state.letterSpacing,
        appSpacing: state.appSpacing,
        shadowLevel: state.shadowLevel,
      }),
    }
  )
);
