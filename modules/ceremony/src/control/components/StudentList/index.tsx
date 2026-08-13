import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { RotateCcw, Crown, Filter, Settings2, X, GripVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { playPcm } from '../../../lib/audio';
import { resolveAsset } from '../../../lib/assets';
import { useCardReader } from '../../hooks/useCardReader';
import { useVirtualizer } from '@tanstack/react-virtual';
import { getStatusLabel, flattenCanonicalRecord, type CanonicalRecord } from '@sky-app/slide-shared';
import { useControlStore } from '../../store';
import { useSocketRef } from '../../SocketContext';
import { useScrollContext } from '../../ScrollContext';
import { useEventStore } from '../../eventStore';
import { RowContextMenu } from '../RowContextMenu';
import { ResizeHandle } from './ResizeHandle';
import { StudentDetailPopover } from './StudentDetailPopover';
import { getRowColorClass } from './rowColor';
import { useSlide } from '../../lib/slide';

const ROW_HEIGHT = 48;
const HEADER_HEIGHT = 32;
const ACTION_COL_W = 144;

type YesNoAll = 'all' | 'yes' | 'no';

interface ListFilters {
  status: string;
  played: YesNoAll;
  scanned: YesNoAll;
  hasAvatar: YesNoAll;
}

const DEFAULT_FILTERS: ListFilters = {
  status: 'all',
  played: 'all',
  scanned: 'all',
  hasAvatar: 'all',
};

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const isFilterActive = (filters: ListFilters): boolean =>
  Object.entries(filters).some(([k, v]) => v !== (DEFAULT_FILTERS as any)[k]);

/** Cột CORE — luôn tồn tại, không thể tắt (đủ để nhận diện + thao tác 1 người). */
const CORE_COL_KEYS = ['display_order', 'avatar', 'layout', 'identifier', 'full_name', 'status'] as const;
type CoreColKey = (typeof CORE_COL_KEYS)[number];

const DEFAULT_CORE_WIDTHS: Record<CoreColKey, number> = {
  display_order: 30,
  avatar: 40,
  layout: 32,
  identifier: 96,
  full_name: 160,
  status: 80,
};

const DEFAULT_EXTRA_WIDTH = 120;
/** Cột extra mặc định hiện khi Event chưa từng cấu hình gì (khớp trải nghiệm cũ: ngành + lớp). */
const DEFAULT_EXTRA_COLUMNS = ['major_name', 'class_code'];

type ColKey = CoreColKey | string;

type View = 'all' | 'scanned';

interface StudentListProps {
  view: View;
  title: string;
  onCardScan: (raw: string) => void;
  isFocused: boolean;
  onFocusChange: (focused: boolean) => void;
  onReplay?: (code: string) => void;
  headerSlot?: React.ReactNode;
}

/** localStorage key cho cấu hình cột hiển thị — theo TỪNG Event (data khác nhau giữa các Event
 * dù dùng chung 1 DataSource, xem quyết định "bỏ Student" 2026-07-22: lưu local, không đồng bộ
 * server, vì đây là preference hiển thị của người dùng trên máy đó, không phải dữ liệu nghiệp vụ). */
function displayColumnsStorageKey(eventId: string | undefined): string {
  return `ceremony-display-columns:${eventId ?? 'default'}`;
}

function loadDisplayColumns(eventId: string | undefined): string[] {
  try {
    const raw = localStorage.getItem(displayColumnsStorageKey(eventId));
    if (!raw) return DEFAULT_EXTRA_COLUMNS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : DEFAULT_EXTRA_COLUMNS;
  } catch {
    return DEFAULT_EXTRA_COLUMNS;
  }
}

function saveDisplayColumns(eventId: string | undefined, cols: string[]): void {
  try {
    localStorage.setItem(displayColumnsStorageKey(eventId), JSON.stringify(cols));
  } catch {
    // localStorage không khả dụng — fail-soft, chỉ mất preference, không ảnh hưởng chức năng.
  }
}

export function StudentList({
  view,
  title,
  onCardScan,
  isFocused,
  onFocusChange,
  onReplay,
  headerSlot,
}: StudentListProps) {
  const { t } = useTranslation();
  const slide = useSlide('pregen');
  const records = useControlStore((s) => s.records);
  const scanLog = useControlStore((s) => s.scanLog);
  const onStage = useControlStore((s) => s.onStage);
  const selectedId = useControlStore((s) => s.selectedId);
  const setSelectedId = useControlStore((s) => s.setSelectedId);
  const patchRuntimeStateLocal = useControlStore((s) => s.patchRuntimeStateLocal);
  const runtimeStates = useControlStore((s) => s.runtimeStates);
  const autoPlay = useControlStore((s) => s.autoPlay);
  const pregenStatus = useControlStore((s) => s.pregenStatus);
  const socket = useSocketRef();
  const activeEvent = useEventStore((s) => s.activeEvent);

  const [query, setQuery] = useState('');
  const [coreWidths, setCoreWidths] = useState<Record<CoreColKey, number>>(DEFAULT_CORE_WIDTHS);
  const [extraWidths, setExtraWidths] = useState<Record<string, number>>({});
  const [extraColumns, setExtraColumns] = useState<string[]>(() => loadDisplayColumns(activeEvent?.id));
  const [columnConfigOpen, setColumnConfigOpen] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverStudent, setPopoverStudent] = useState<any>(null);
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 });
  const [popoverMode, setPopoverMode] = useState<'card' | 'table'>('card');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<ListFilters>(DEFAULT_FILTERS);
  const [filterPopoverPos, setFilterPopoverPos] = useState({ x: 0, y: 0 });
  const [avatarPreview, setAvatarPreview] = useState<{
    record: CanonicalRecord;
    x: number;
    y: number;
  } | null>(null);

  const [ctxMenu, setCtxMenu] = useState<{ record: CanonicalRecord; x: number; y: number } | null>(null);

  // Nạp lại cấu hình cột khi đổi Event (mỗi Event có preference riêng, xem loadDisplayColumns).
  useEffect(() => {
    setExtraColumns(loadDisplayColumns(activeEvent?.id));
  }, [activeEvent?.id]);

  const openCtxMenu = useCallback((r: CanonicalRecord, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ record: r, x: e.clientX, y: e.clientY });
  }, []);
  const popoverRef = useRef<HTMLDivElement>(null);

  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const columnBtnRef = useRef<HTMLButtonElement>(null);
  const columnPanelRef = useRef<HTMLDivElement>(null);
  const FILTER_POPOVER_W = 640;
  const COLUMN_POPOVER_W = 320;

  const positionFilterPopover = useCallback(() => {
    const btn = filterBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const margin = 12;
    const x = Math.max(
      margin,
      Math.min(rect.right - FILTER_POPOVER_W, window.innerWidth - FILTER_POPOVER_W - margin),
    );
    const y = Math.min(rect.bottom + 8, window.innerHeight - 24);
    setFilterPopoverPos({ x, y });
  }, [FILTER_POPOVER_W]);

  const {
    onKeyDown: onCardKeyDown,
    onFocus: onCardFocus,
    onBlur: onCardBlur,
  } = useCardReader((code) => {
    onCardScan(code);
    setQuery('');
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
    });
  });

  const resizeCore = useCallback((col: CoreColKey, dx: number) => {
    setCoreWidths((w) => ({ ...w, [col]: Math.max(36, w[col] + dx) }));
  }, []);
  const resizeExtra = useCallback((col: string, dx: number) => {
    setExtraWidths((w) => ({ ...w, [col]: Math.max(36, (w[col] ?? DEFAULT_EXTRA_WIDTH) + dx) }));
  }, []);

  const toggleExtraColumn = useCallback((key: string) => {
    setExtraColumns((cols) => {
      const next = cols.includes(key) ? cols.filter((c) => c !== key) : [...cols, key];
      saveDisplayColumns(activeEvent?.id, next);
      return next;
    });
  }, [activeEvent?.id]);

  /** Toàn bộ tên field trong extra của mọi record hiện có — gợi ý cột có thể thêm. */
  const availableExtraKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const r of records) {
      for (const k of Object.keys(r.extra)) keys.add(k);
    }
    return Array.from(keys).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [records]);

  const source = useMemo(() => {
    if (view === 'all') return records;
    const byId = new Map(records.map((r) => [r.id, r]));
    // scanLog mới nhất ở đầu → đảo lại để cũ ở trên, mới ở dưới
    return scanLog
      .slice()
      .reverse()
      .map((e) => byId.get(e.record.id) ?? e.record)
      .filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i);
  }, [view, records, scanLog]);

  const playedSet = useMemo(() => new Set(autoPlay.playedCodes), [autoPlay.playedCodes]);
  const scannedSet = useMemo(
    () => new Set(scanLog.map((e) => e.record.id)),
    [scanLog],
  );

  const filterOptions = useMemo(() => {
    const uniq = (arr: string[]) => Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'vi'));
    return {
      statuses: uniq(records.map((r) => runtimeStates[r.id]?.status ?? 'registered')),
    };
  }, [records, runtimeStates]);

  const sourceAfterFilter = useMemo(() => {
    if (view !== 'all') return source;
    return source.filter((r) => {
      const status = runtimeStates[r.id]?.status ?? 'registered';
      if (filters.status !== 'all' && status !== filters.status) return false;

      const played = playedSet.has(r.id);
      if (filters.played === 'yes' && !played) return false;
      if (filters.played === 'no' && played) return false;

      const scanned = scannedSet.has(r.id);
      if (filters.scanned === 'yes' && !scanned) return false;
      if (filters.scanned === 'no' && scanned) return false;

      const hasAvatar = !!r.image_relative_path?.trim();
      if (filters.hasAvatar === 'yes' && !hasAvatar) return false;
      if (filters.hasAvatar === 'no' && hasAvatar) return false;

      return true;
    });
  }, [view, source, filters, playedSet, scannedSet, runtimeStates]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return sourceAfterFilter;
    return sourceAfterFilter.filter((r) => {
      const flat = flattenCanonicalRecord(r);
      return (
        normalize(r.full_name).includes(q) ||
        r.id.includes(q) ||
        (r.identifierCode && r.identifierCode.includes(q)) ||
        (flat.phone && flat.phone.includes(q))
      );
    });
  }, [sourceAfterFilter, query]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => bodyRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const widths: Record<ColKey, number> = useMemo(() => {
    const out: Record<ColKey, number> = { ...coreWidths };
    for (const key of extraColumns) out[key] = extraWidths[key] ?? DEFAULT_EXTRA_WIDTH;
    return out;
  }, [coreWidths, extraWidths, extraColumns]);

  const dataWidth = Object.values(widths).reduce((a, b) => a + b, 0);

  const headerCols: { key: ColKey; label: string; core: boolean }[] = [
    { key: 'display_order', label: '#', core: true },
    { key: 'avatar', label: t('studentList.columns.avatar'), core: true },
    { key: 'layout', label: '', core: true },
    { key: 'identifier', label: t('studentList.columns.studentCode'), core: true },
    { key: 'full_name', label: t('studentList.columns.fullName'), core: true },
    { key: 'status', label: t('studentList.columns.status'), core: true },
    ...extraColumns.map((key) => ({ key, label: key, core: false })),
  ];

  const syncHeaderScroll = () => {
    if (!bodyRef.current) return;
    if (headerRef.current) headerRef.current.scrollLeft = bodyRef.current.scrollLeft;
    setScrollTop(bodyRef.current.scrollTop);
  };

  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;

  const scrollToId = useCallback((id: string) => {
    const idx = filteredRef.current.findIndex((r) => r.id === id);
    if (idx !== -1) virtualizerRef.current.scrollToIndex(idx, { align: 'center' });
  }, []);

  const { register, unregister } = useScrollContext();
  useEffect(() => {
    register(view, scrollToId);
    return () => unregister(view);
  }, [view, scrollToId, register, unregister]);

  const scrollToOnStage = () => {
    if (onStage) scrollToId(onStage.record.id);
  };

  const openStudentPopover = (record: CanonicalRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    setPopoverStudent(record);
    setPopoverOpen(true);
    setPopoverMode('card');
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopoverPos({ x: rect.left, y: rect.bottom + 4 });
  };

  const updateAvatarPreview = useCallback((record: CanonicalRecord, e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setAvatarPreview({
      record,
      x: rect.right + 12,
      y: rect.top - 4,
    });
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    if (popoverOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [popoverOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        filterPanelRef.current &&
        !filterPanelRef.current.contains(target) &&
        filterBtnRef.current &&
        !filterBtnRef.current.contains(target)
      ) {
        setFilterOpen(false);
      }
    };
    if (filterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [filterOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        columnPanelRef.current &&
        !columnPanelRef.current.contains(target) &&
        columnBtnRef.current &&
        !columnBtnRef.current.contains(target)
      ) {
        setColumnConfigOpen(false);
      }
    };
    if (columnConfigOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [columnConfigOpen]);

  useEffect(() => {
    if (!filterOpen) return;
    if (document.activeElement === inputRef.current) {
      inputRef.current?.blur();
    }
  }, [filterOpen]);

  useEffect(() => {
    if (!filterOpen) return;
    positionFilterPopover();

    const handleViewportChange = () => positionFilterPopover();
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [filterOpen, positionFilterPopover]);

  return (
    <div
      onClick={() => {
        onFocusChange(true);
        inputRef.current?.focus();
      }}
      className={`flex h-full min-w-0 flex-col rounded-lg border bg-card transition-shadow ${
        isFocused ? 'border-info shadow-[0_0_0_2px_#3b82f6]' : 'border-border'
      }`}
    >
      {/* Tiêu đề + tìm kiếm */}
      <div className="flex-shrink-0 border-b border-border p-3">
        {/* Dòng 1: Title + AutoPlayBar */}
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {headerSlot && <div className="flex-shrink-0">{headerSlot}</div>}
        </div>

        {/* Dòng 2: Search + Filter + Cột + Clear */}
        <div className="mb-2 relative flex gap-2">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onCardKeyDown}
            onFocus={() => {
              onCardFocus();
              onFocusChange(true);
            }}
            placeholder={t('studentList.searchPlaceholder')}
            autoFocus={view === 'all'}
            onBlur={(e) => {
              onCardBlur(e);
              const next = e.relatedTarget;
              if (next instanceof HTMLInputElement && next.type === 'text') return;
              onFocusChange(false);
            }}
            className="min-w-0 flex-1 rounded-md border border-border px-3 py-2 text-sm focus:border-border focus:outline-none"
          />
          {view === 'all' && (
            <button
              ref={columnBtnRef}
              type="button"
              onClick={() => setColumnConfigOpen((v) => !v)}
              className="rounded-md border border-border px-2.5 py-2 text-sm flex-shrink-0 text-muted-foreground hover:bg-muted transition-colors"
              title={t('studentList.columnConfigTitle', 'Cấu hình cột hiển thị')}
            >
              <Settings2 size={16} />
            </button>
          )}
          {view === 'all' && (
            <button
              ref={filterBtnRef}
              type="button"
              onClick={() => {
                if (!filterOpen) {
                  positionFilterPopover();
                }
                setFilterOpen((v) => !v);
              }}
              className={`rounded-md border px-2.5 py-2 text-sm flex-shrink-0 transition-colors ${
                isFilterActive(filters)
                  ? 'border-destructive/60 bg-destructive/10 text-destructive'
                  : 'border-border text-muted-foreground hover:bg-muted'
              }`}
              title={t('studentList.filterTitle')}
            >
              <Filter size={16} />
            </button>
          )}
          <button
            tabIndex={-1}
            onMouseDown={(e) => {
              e.preventDefault();
              setQuery('');
              inputRef.current?.focus();
            }}
            className={`rounded-md border px-2.5 py-2 text-sm flex-shrink-0 ${
              query
                ? 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15'
                : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            ✕ {t('studentList.clear')}
          </button>

          {view === 'all' && columnConfigOpen && (
            <div
              ref={columnPanelRef}
              className="absolute right-0 top-full z-40 mt-1 rounded-lg border border-border bg-card p-3 shadow-xl"
              style={{ width: COLUMN_POPOVER_W, maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">
                  {t('studentList.columnConfigTitle', 'Cấu hình cột hiển thị')}
                </span>
                <button
                  type="button"
                  onClick={() => setColumnConfigOpen(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X size={14} />
                </button>
              </div>
              <p className="mb-2 text-xs text-muted-foreground">
                {t('studentList.columnConfigHint', 'Chọn thêm cột dữ liệu để hiển thị trong bảng.')}
              </p>
              {availableExtraKeys.length === 0 ? (
                <p className="text-xs italic text-muted-foreground">
                  {t('studentList.columnConfigEmpty', 'Chưa có dữ liệu để gợi ý cột.')}
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {availableExtraKeys.map((key) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 rounded px-1.5 py-1 text-xs text-foreground hover:bg-muted cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={extraColumns.includes(key)}
                        onChange={() => toggleExtraColumn(key)}
                        className="cursor-pointer"
                      />
                      <GripVertical size={12} className="text-muted-foreground" />
                      <span className="truncate">{key}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === 'all' && filterOpen && (
            <div
              ref={filterPanelRef}
              className="fixed z-40 rounded-lg border border-border bg-card p-3 shadow-xl"
              style={{
                left: `${filterPopoverPos.x}px`,
                top: `${filterPopoverPos.y}px`,
                width: `${FILTER_POPOVER_W}px`,
                maxWidth: `calc(100vw - 24px)`,
                maxHeight: `calc(100vh - ${filterPopoverPos.y + 12}px)`,
                overflowY: 'auto',
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">{t('studentList.filterPanelTitle')}</span>
                <button
                  type="button"
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  {t('studentList.resetFilter')}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <label className="text-xs text-foreground">
                  {t('studentList.filters.status')}
                  <select
                    value={filters.status}
                    onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                    className="mt-1 w-full rounded border border-border px-2 py-1.5 text-xs"
                  >
                    <option value="all">{t('studentList.filters.all')}</option>
                    {filterOptions.statuses.map((v) => <option key={v} value={v}>{getStatusLabel(v as any)}</option>)}
                  </select>
                </label>

                <label className="text-xs text-foreground">
                  {t('studentList.filters.played')}
                  <select
                    value={filters.played}
                    onChange={(e) => setFilters((f) => ({ ...f, played: e.target.value as YesNoAll }))}
                    className="mt-1 w-full rounded border border-border px-2 py-1.5 text-xs"
                  >
                    <option value="all">{t('studentList.filters.all')}</option>
                    <option value="yes">{t('studentList.filters.playedYes')}</option>
                    <option value="no">{t('studentList.filters.playedNo')}</option>
                  </select>
                </label>

                <label className="text-xs text-foreground">
                  {t('studentList.filters.scanned')}
                  <select
                    value={filters.scanned}
                    onChange={(e) => setFilters((f) => ({ ...f, scanned: e.target.value as YesNoAll }))}
                    className="mt-1 w-full rounded border border-border px-2 py-1.5 text-xs"
                  >
                    <option value="all">{t('studentList.filters.all')}</option>
                    <option value="yes">{t('studentList.filters.scannedYes')}</option>
                    <option value="no">{t('studentList.filters.scannedNo')}</option>
                  </select>
                </label>

                <label className="text-xs text-foreground">
                  {t('studentList.filters.hasAvatar')}
                  <select
                    value={filters.hasAvatar}
                    onChange={(e) => setFilters((f) => ({ ...f, hasAvatar: e.target.value as YesNoAll }))}
                    className="mt-1 w-full rounded border border-border px-2 py-1.5 text-xs"
                  >
                    <option value="all">{t('studentList.filters.all')}</option>
                    <option value="yes">{t('studentList.filters.hasAvatarYes')}</option>
                    <option value="no">{t('studentList.filters.hasAvatarNo')}</option>
                  </select>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Dòng 3: Count + Đang active button */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {view === 'scanned'
              ? t('studentList.countScanned', { count: filtered.length })
              : t('studentList.count', { count: filtered.length })}
          </span>
          <button
            onClick={scrollToOnStage}
            disabled={!onStage}
            className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30"
          >
            ⊙ {t('studentList.activeButton')}
          </button>
        </div>
      </div>

      {/* Header — data cols cuộn ngang, action col freeze bên phải */}
      <div
        className="relative flex-shrink-0 border-b border-border bg-muted"
        style={{ height: HEADER_HEIGHT }}
      >
        <div
          ref={headerRef}
          className="absolute inset-0 overflow-x-hidden"
          style={{ right: ACTION_COL_W }}
        >
          <div
            className="flex h-full select-none pl-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            style={{ minWidth: dataWidth }}
          >
            {headerCols.map(({ key, label, core }) => (
              <div
                key={key}
                className="relative flex flex-shrink-0 items-center pr-2"
                style={{ width: widths[key] }}
              >
                {label}
                <ResizeHandle onDrag={(dx) => (core ? resizeCore(key as CoreColKey, dx) : resizeExtra(key, dx))} />
              </div>
            ))}
          </div>
        </div>
        <div
          className="absolute bottom-0 right-0 top-0 flex items-center border-l border-border bg-muted px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          style={{ width: ACTION_COL_W }}
        >
          {t('studentList.columns.actions')}
        </div>
      </div>

      {/* Body */}
      <div className="relative flex-1 overflow-hidden">
        {/* Data cols — cuộn ngang + dọc, thu hẹp bên phải nhường chỗ action col */}
        <div
          ref={bodyRef}
          className="absolute inset-0 overflow-auto"
          style={{ right: ACTION_COL_W }}
          onScroll={syncHeaderScroll}
        >
          {filtered.length === 0 && view === 'scanned' && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {t('studentList.emptyScanned')}
            </div>
          )}
          <div
            style={{
              minWidth: dataWidth,
              height: virtualizer.getTotalSize(),
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const r = filtered[vi.index];
              const flat = flattenCanonicalRecord(r);
              const status = runtimeStates[r.id]?.status ?? 'registered';
              const isOn = onStage?.record.id === r.id;
              const isSelected = selectedId === r.id;
              const isAutoPlaying = view === 'scanned' && autoPlay.currentCode === r.id;
              const hasPlayed = view === 'scanned' && autoPlay.playedCodes.includes(r.id);
              const pgSt = pregenStatus?.records?.[r.id];
              const rowBg = getRowColorClass({
                selected: isSelected,
                autoplayOrOnStage: isAutoPlaying || isOn,
                pregenStatus: pgSt,
                hasPlayed,
              });

              return (
                <div
                  key={r.id}
                  onClick={() => {
                    setSelectedId(r.id);
                    onFocusChange(true);
                  }}
                  onContextMenu={(e) => openCtxMenu(r, e)}
                  className={`absolute left-0 flex cursor-pointer items-center border-b border-border pl-2 text-sm font-medium overflow-hidden ${rowBg} ${
                    isSelected ? 'ring-2 ring-inset ring-blue-400' : ''
                  }`}
                  style={{
                    width: dataWidth,
                    height: ROW_HEIGHT,
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  {/* Shimmer overlay khi đang processing */}
                  {pgSt === 'processing' && !isSelected && !isOn && (
                    <div
                      className="pointer-events-none absolute inset-0 animate-shimmer-ltr"
                      style={{
                        background:
                          'linear-gradient(90deg, transparent 0%, rgba(59,130,246,0.18) 40%, rgba(99,155,255,0.32) 50%, rgba(59,130,246,0.18) 60%, transparent 100%)',
                        backgroundSize: '200% 100%',
                      }}
                    />
                  )}
                  {/* Thanh xanh lá bên trái khi done */}
                  {pgSt === 'done' && !isSelected && !isOn && (
                    <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-success rounded-r-sm" />
                  )}

                  <span
                    onClick={(e) => openStudentPopover(r, e)}
                    className="relative flex-shrink-0 truncate text-foreground cursor-pointer hover:underline"
                    style={{ width: widths.display_order }}
                  >
                    {r.displayOrder || vi.index + 1}
                  </span>
                  <span
                    className="relative flex-shrink-0 flex items-center justify-center"
                    style={{ width: widths.avatar }}
                  >
                    <span
                      className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-border bg-muted"
                      onMouseEnter={(e) => updateAvatarPreview(r, e)}
                      onMouseMove={(e) => updateAvatarPreview(r, e)}
                      onMouseLeave={() => setAvatarPreview(null)}
                    >
                      {r.image_relative_path ? (
                        <img
                          src={resolveAsset(r.image_relative_path)}
                          alt={r.full_name}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                          }}
                        />
                      ) : (
                        <span className="text-[10px] font-semibold text-muted-foreground">NA</span>
                      )}
                    </span>
                  </span>
                  <span
                    className="relative flex-shrink-0 flex items-center justify-center"
                    style={{ width: widths.layout }}
                    title={flat.award_type_code === '3' ? t('studentList.layoutMiddleTitle') : undefined}
                  >
                    {flat.award_type_code === '3' && (
                      <Crown size={14} className="text-warning" />
                    )}
                  </span>
                  <span
                    className="relative flex-shrink-0 truncate font-mono text-xs"
                    style={{ width: widths.identifier }}
                  >
                    {r.identifierCode ?? r.id}
                  </span>
                  <span
                    className={`relative flex-shrink-0 truncate font-medium ${hasPlayed && !isAutoPlaying && !isOn ? 'text-muted-foreground' : ''}`}
                    style={{ width: widths.full_name }}
                  >
                    {r.full_name}
                  </span>
                  <span
                    className="relative flex-shrink-0 truncate text-xs text-foreground"
                    style={{ width: widths.status }}
                  >
                    {getStatusLabel(status)}
                  </span>
                  {extraColumns.map((key) => (
                    <span
                      key={key}
                      className="relative flex-shrink-0 truncate text-xs text-foreground"
                      style={{ width: widths[key] }}
                    >
                      {flat[key] ?? ''}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Action col — overlay bên phải, translate theo scrollTop của body */}
        <div
          className="absolute bottom-0 right-0 top-0 overflow-hidden border-l border-border bg-card"
          style={{ width: ACTION_COL_W }}
          onWheel={(e) => {
            if (bodyRef.current) bodyRef.current.scrollTop += e.deltaY;
          }}
        >
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: 'relative',
              transform: `translateY(-${scrollTop}px)`,
            }}
          >
            {filtered.map((r, rawIdx) => {
              const status = runtimeStates[r.id]?.status ?? 'registered';
              const isOn = onStage?.record.id === r.id;
              const isSelected = selectedId === r.id;
              const isAutoPlaying = view === 'scanned' && autoPlay.currentCode === r.id;
              const hasPlayed = view === 'scanned' && autoPlay.playedCodes.includes(r.id);
              const pgSt = pregenStatus?.records?.[r.id];
              const actionBg = getRowColorClass(
                {
                  selected: isSelected,
                  autoplayOrOnStage: isAutoPlaying || isOn,
                  pregenStatus: pgSt,
                  hasPlayed,
                },
                { bold: true },
              );

              return (
                <div
                  key={r.id}
                  onClick={() => {
                    setSelectedId(r.id);
                    onFocusChange(true);
                  }}
                  onContextMenu={(e) => openCtxMenu(r, e)}
                  className={`absolute left-0 right-0 flex cursor-pointer items-center justify-end gap-2 border-b border-border px-2 font-medium ${actionBg}`}
                  style={{ height: ROW_HEIGHT, top: rawIdx * ROW_HEIGHT }}
                >
                  {view === 'all' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = status === 'absent' ? 'registered' : 'absent';
                        socket.current?.emit('cmd:setStatus', {
                          id: r.id,
                          status: next,
                        });
                        patchRuntimeStateLocal(r.id, { status: next });
                      }}
                      className={`rounded border px-2 py-1 text-xs font-medium ${
                        status === 'absent'
                          ? 'border-border text-foreground hover:bg-muted'
                          : 'border-warning/40 text-warning hover:bg-warning/10'
                      }`}
                    >
                      {status === 'absent' ? t('studentList.present') : t('studentList.absent')}
                    </button>
                  )}
                  {view === 'scanned' && hasPlayed ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onReplay?.(r.id);
                      }}
                      className="flex items-center gap-1 rounded border border-warning/40 px-3 py-1.5 text-xs text-warning hover:bg-warning/10 font-medium"
                    >
                      <RotateCcw size={12} /> {t('studentList.replay')}
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        socket.current?.emit('cmd:show', {
                          id: r.id,
                          source: 'manual',
                        });
                      }}
                      className="rounded bg-success px-3 py-1.5 text-xs font-medium text-success-foreground hover:bg-success/90"
                    >
                      {t('studentList.play')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Context menu chuột phải */}
      {ctxMenu && (
        <RowContextMenu
          record={ctxMenu.record}
          status={runtimeStates[ctxMenu.record.id]?.status ?? 'registered'}
          pgSt={pregenStatus?.records?.[ctxMenu.record.id]}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          onViewDetail={() => {
            setPopoverStudent(ctxMenu.record);
            setPopoverPos({ x: ctxMenu.x, y: ctxMenu.y });
            setPopoverOpen(true);
            setPopoverMode('card');
          }}
          onPlayAudio={async () => {
            const res = await slide?.pregenGetAudio(ctxMenu.record.id);
            if (res?.ok && res.buffer) await playPcm(res.buffer.slice(44), 48000);
          }}
          onRegenAudio={() => slide?.pregenRequeue(ctxMenu.record.id)}
          onToggleAbsent={() => {
            const r = ctxMenu.record;
            const status = runtimeStates[r.id]?.status ?? 'registered';
            const next = status === 'absent' ? 'registered' : 'absent';
            socket.current?.emit('cmd:setStatus', { id: r.id, status: next });
            patchRuntimeStateLocal(r.id, { status: next });
          }}
          onPlay={() =>
            socket.current?.emit('cmd:show', {
              id: ctxMenu.record.id,
              source: 'manual',
            })
          }
        />
      )}

      {/* Preview ảnh lớn khi hover avatar */}
      {avatarPreview && (
        <div
          className="pointer-events-none fixed z-[220] overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
          style={{
            left: `${Math.max(12, Math.min(avatarPreview.x, window.innerWidth - 196))}px`,
            top: `${Math.max(12, Math.min(avatarPreview.y, window.innerHeight - 236))}px`,
            width: 184,
            height: 224,
          }}
        >
          {avatarPreview.record.image_relative_path ? (
            <img
              src={resolveAsset(avatarPreview.record.image_relative_path)}
              alt={avatarPreview.record.full_name}
              className="h-full w-full object-cover"
              loading="eager"
              decoding="async"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted text-sm font-semibold text-muted-foreground">
              {t('studentList.noPhoto')}
            </div>
          )}
        </div>
      )}

      {/* Popover chi tiết sinh viên */}
      {popoverOpen && popoverStudent && (
        <StudentDetailPopover
          popoverRef={popoverRef}
          student={popoverStudent}
          status={runtimeStates[popoverStudent.id]?.status ?? 'registered'}
          displayOrderFallback={
            records.findIndex((x) => x.id === popoverStudent.id) + 1
          }
          pos={popoverPos}
          mode={popoverMode}
          onToggleMode={() => setPopoverMode((m) => (m === 'card' ? 'table' : 'card'))}
          onClose={() => setPopoverOpen(false)}
        />
      )}
    </div>
  );
}
