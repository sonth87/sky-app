import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { RotateCcw, Crown, Filter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { playPcm } from '../../../lib/audio';
import { resolveAsset } from '../../../lib/assets';
import { useCardReader } from '../../hooks/useCardReader';
import { useVirtualizer } from '@tanstack/react-virtual';
import { getStatusLabel } from '@sky-app/slide-shared';
import type { Student } from '@sky-app/slide-shared';
import { useControlStore } from '../../store';
import { useSocketRef } from '../../SocketContext';
import { useScrollContext } from '../../ScrollContext';
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
  major: string;
  gender: string;
  faculty: string;
  course: string;
  classCode: string;
  status: string;
  awardType: string;
  played: YesNoAll;
  scanned: YesNoAll;
  receivedDegree: YesNoAll;
  hasAvatar: YesNoAll;
}

const DEFAULT_FILTERS: ListFilters = {
  major: 'all',
  gender: 'all',
  faculty: 'all',
  course: 'all',
  classCode: 'all',
  status: 'all',
  awardType: 'all',
  played: 'all',
  scanned: 'all',
  receivedDegree: 'all',
  hasAvatar: 'all',
};

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const isDegreeReceived = (student: Student): boolean => {
  const raw = String(student.degree_award_status ?? '').trim();
  if (!raw) return false;
  const n = normalize(raw);
  return (
    n === '1' ||
    n === 'true' ||
    n === 'yes' ||
    n === 'received' ||
    n === 'done' ||
    n.includes('da nhan') ||
    n.includes('da_nhan') ||
    n.includes('nhan bang')
  );
};

const isFilterActive = (filters: ListFilters): boolean =>
  Object.entries(filters).some(([k, v]) => v !== (DEFAULT_FILTERS as any)[k]);

const DEFAULT_WIDTHS = {
  display_order: 30,
  layout: 32,
  avatar: 40,
  student_code: 96,
  full_name: 160,
  major_name: 130,
  class_code: 72,
  status: 80,
};
type ColKey = keyof typeof DEFAULT_WIDTHS;

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
  const students = useControlStore((s) => s.students);
  const scanLog = useControlStore((s) => s.scanLog);
  const onStage = useControlStore((s) => s.onStage);
  const selectedMsv = useControlStore((s) => s.selectedMsv);
  const setSelectedMsv = useControlStore((s) => s.setSelectedMsv);
  const patchStudentLocal = useControlStore((s) => s.patchStudentLocal);
  const autoPlay = useControlStore((s) => s.autoPlay);
  const pregenStatus = useControlStore((s) => s.pregenStatus);
  const socket = useSocketRef();

  const [query, setQuery] = useState('');
  const [widths, setWidths] = useState(DEFAULT_WIDTHS);
  const [scrollTop, setScrollTop] = useState(0);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverStudent, setPopoverStudent] = useState<any>(null);
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 });
  const [popoverMode, setPopoverMode] = useState<'card' | 'table'>('card');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<ListFilters>(DEFAULT_FILTERS);
  const [filterPopoverPos, setFilterPopoverPos] = useState({ x: 0, y: 0 });
  const [avatarPreview, setAvatarPreview] = useState<{
    student: Student;
    x: number;
    y: number;
  } | null>(null);

  const [ctxMenu, setCtxMenu] = useState<{ student: Student; x: number; y: number } | null>(null);

  const openCtxMenu = useCallback((s: Student, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ student: s, x: e.clientX, y: e.clientY });
  }, []);
  const popoverRef = useRef<HTMLDivElement>(null);

  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const FILTER_POPOVER_W = 640;

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

  const resize = useCallback((col: ColKey, dx: number) => {
    setWidths((w) => ({ ...w, [col]: Math.max(36, w[col] + dx) }));
  }, []);

  const source = useMemo(() => {
    if (view === 'all') return students;
    const byCode = new Map(students.map((s) => [s.student_code, s]));
    // scanLog mới nhất ở đầu → đảo lại để cũ ở trên, mới ở dưới
    return scanLog
      .slice()
      .reverse()
      .map((e) => byCode.get(e.student.student_code) ?? e.student)
      .filter((s, i, arr) => arr.findIndex((x) => x.student_code === s.student_code) === i);
  }, [view, students, scanLog]);

  const playedSet = useMemo(() => new Set(autoPlay.playedCodes), [autoPlay.playedCodes]);
  const scannedSet = useMemo(
    () => new Set(scanLog.map((e) => e.student.student_code)),
    [scanLog],
  );

  const filterOptions = useMemo(() => {
    const uniq = (arr: string[]) => Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'vi'));
    return {
      majors: uniq(students.map((s) => s.major_name ?? '')),
      genders: uniq(students.map((s) => s.gender ?? '')),
      faculties: uniq(students.map((s) => s.faculty_name ?? '')),
      courses: uniq(students.map((s) => s.course_code ?? '')),
      classes: uniq(students.map((s) => s.class_code ?? '')),
      statuses: uniq(students.map((s) => s.status ?? '')),
      awardTypes: uniq(students.map((s) => String(s.award_type_code ?? s.award_type ?? ''))),
    };
  }, [students]);

  const sourceAfterFilter = useMemo(() => {
    if (view !== 'all') return source;
    return source.filter((s) => {
      if (filters.major !== 'all' && s.major_name !== filters.major) return false;
      if (filters.gender !== 'all' && s.gender !== filters.gender) return false;
      if (filters.faculty !== 'all' && s.faculty_name !== filters.faculty) return false;
      if (filters.course !== 'all' && s.course_code !== filters.course) return false;
      if (filters.classCode !== 'all' && s.class_code !== filters.classCode) return false;
      if (filters.status !== 'all' && s.status !== filters.status) return false;

      if (filters.awardType !== 'all') {
        const award = String(s.award_type_code ?? s.award_type ?? '');
        if (award !== filters.awardType) return false;
      }

      const played = playedSet.has(s.student_code);
      if (filters.played === 'yes' && !played) return false;
      if (filters.played === 'no' && played) return false;

      const scanned = scannedSet.has(s.student_code);
      if (filters.scanned === 'yes' && !scanned) return false;
      if (filters.scanned === 'no' && scanned) return false;

      const received = isDegreeReceived(s);
      if (filters.receivedDegree === 'yes' && !received) return false;
      if (filters.receivedDegree === 'no' && received) return false;

      const hasAvatar = !!s.image_relative_path?.trim();
      if (filters.hasAvatar === 'yes' && !hasAvatar) return false;
      if (filters.hasAvatar === 'no' && hasAvatar) return false;

      return true;
    });
  }, [view, source, filters, playedSet, scannedSet]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return sourceAfterFilter;
    return sourceAfterFilter.filter(
      (s) =>
        normalize(s.full_name).includes(q) ||
        s.student_code.includes(q) ||
        (s.phone_number && s.phone_number.includes(q)),
    );
  }, [sourceAfterFilter, query]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => bodyRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const dataWidth = Object.values(widths).reduce((a, b) => a + b, 0);

  const headerCols: { key: ColKey; label: string }[] = [
    { key: 'display_order', label: '#' },
    { key: 'avatar', label: t('studentList.columns.avatar') },
    { key: 'layout', label: '' },
    { key: 'student_code', label: t('studentList.columns.studentCode') },
    { key: 'full_name', label: t('studentList.columns.fullName') },
    { key: 'major_name', label: t('studentList.columns.majorName') },
    { key: 'class_code', label: t('studentList.columns.classCode') },
    { key: 'status', label: t('studentList.columns.status') },
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

  const scrollToMsv = useCallback((code: string) => {
    const idx = filteredRef.current.findIndex((s) => s.student_code === code);
    if (idx !== -1) virtualizerRef.current.scrollToIndex(idx, { align: 'center' });
  }, []);

  const { register, unregister } = useScrollContext();
  useEffect(() => {
    register(view, scrollToMsv);
    return () => unregister(view);
  }, [view, scrollToMsv, register, unregister]);

  const scrollToOnStage = () => {
    if (onStage) scrollToMsv(onStage.student_code);
  };

  const openStudentPopover = (student: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setPopoverStudent(student);
    setPopoverOpen(true);
    setPopoverMode('card');
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopoverPos({ x: rect.left, y: rect.bottom + 4 });
  };

  const updateAvatarPreview = useCallback((student: Student, e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setAvatarPreview({
      student,
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

        {/* Dòng 2: Search + Filter + Clear */}
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
                  {t('studentList.filters.major')}
                  <select
                    value={filters.major}
                    onChange={(e) => setFilters((f) => ({ ...f, major: e.target.value }))}
                    className="mt-1 w-full rounded border border-border px-2 py-1.5 text-xs"
                  >
                    <option value="all">{t('studentList.filters.all')}</option>
                    {filterOptions.majors.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>

                <label className="text-xs text-foreground">
                  {t('studentList.filters.gender')}
                  <select
                    value={filters.gender}
                    onChange={(e) => setFilters((f) => ({ ...f, gender: e.target.value }))}
                    className="mt-1 w-full rounded border border-border px-2 py-1.5 text-xs"
                  >
                    <option value="all">{t('studentList.filters.all')}</option>
                    {filterOptions.genders.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>

                <label className="text-xs text-foreground">
                  {t('studentList.filters.faculty')}
                  <select
                    value={filters.faculty}
                    onChange={(e) => setFilters((f) => ({ ...f, faculty: e.target.value }))}
                    className="mt-1 w-full rounded border border-border px-2 py-1.5 text-xs"
                  >
                    <option value="all">{t('studentList.filters.all')}</option>
                    {filterOptions.faculties.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>

                <label className="text-xs text-foreground">
                  {t('studentList.filters.course')}
                  <select
                    value={filters.course}
                    onChange={(e) => setFilters((f) => ({ ...f, course: e.target.value }))}
                    className="mt-1 w-full rounded border border-border px-2 py-1.5 text-xs"
                  >
                    <option value="all">{t('studentList.filters.all')}</option>
                    {filterOptions.courses.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>

                <label className="text-xs text-foreground">
                  {t('studentList.filters.classCode')}
                  <select
                    value={filters.classCode}
                    onChange={(e) => setFilters((f) => ({ ...f, classCode: e.target.value }))}
                    className="mt-1 w-full rounded border border-border px-2 py-1.5 text-xs"
                  >
                    <option value="all">{t('studentList.filters.all')}</option>
                    {filterOptions.classes.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>

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
                  {t('studentList.filters.awardType')}
                  <select
                    value={filters.awardType}
                    onChange={(e) => setFilters((f) => ({ ...f, awardType: e.target.value }))}
                    className="mt-1 w-full rounded border border-border px-2 py-1.5 text-xs"
                  >
                    <option value="all">{t('studentList.filters.all')}</option>
                    {filterOptions.awardTypes.map((v) => <option key={v} value={v}>{v}</option>)}
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
                  {t('studentList.filters.receivedDegree')}
                  <select
                    value={filters.receivedDegree}
                    onChange={(e) => setFilters((f) => ({ ...f, receivedDegree: e.target.value as YesNoAll }))}
                    className="mt-1 w-full rounded border border-border px-2 py-1.5 text-xs"
                  >
                    <option value="all">{t('studentList.filters.all')}</option>
                    <option value="yes">{t('studentList.filters.receivedYes')}</option>
                    <option value="no">{t('studentList.filters.receivedNo')}</option>
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
            {headerCols.map(({ key, label }) => (
              <div
                key={key}
                className="relative flex flex-shrink-0 items-center pr-2"
                style={{ width: widths[key] }}
              >
                {label}
                <ResizeHandle onDrag={(dx) => resize(key, dx)} />
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
              const s = filtered[vi.index];
              const isOn = onStage?.student_code === s.student_code;
              const isSelected = selectedMsv === s.student_code;
              const isAutoPlaying = view === 'scanned' && autoPlay.currentCode === s.student_code;
              const hasPlayed = view === 'scanned' && autoPlay.playedCodes.includes(s.student_code);
              const pgSt = pregenStatus?.students?.[s.student_code];
              const rowBg = getRowColorClass({
                selected: isSelected,
                autoplayOrOnStage: isAutoPlaying || isOn,
                pregenStatus: pgSt,
                hasPlayed,
              });

              return (
                <div
                  key={s.student_code}
                  onClick={() => {
                    setSelectedMsv(s.student_code);
                    onFocusChange(true);
                  }}
                  onContextMenu={(e) => openCtxMenu(s, e)}
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
                    onClick={(e) => openStudentPopover(s, e)}
                    className="relative flex-shrink-0 truncate text-foreground cursor-pointer hover:underline"
                    style={{ width: widths.display_order }}
                  >
                    {s.display_order || vi.index + 1}
                  </span>
                  <span
                    className="relative flex-shrink-0 flex items-center justify-center"
                    style={{ width: widths.avatar }}
                  >
                    <span
                      className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-border bg-muted"
                      onMouseEnter={(e) => updateAvatarPreview(s, e)}
                      onMouseMove={(e) => updateAvatarPreview(s, e)}
                      onMouseLeave={() => setAvatarPreview(null)}
                    >
                      {s.image_relative_path ? (
                        <img
                          src={resolveAsset(s.image_relative_path)}
                          alt={s.full_name}
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
                    title={s.award_type_code !== null && String(s.award_type_code) === '3' ? t('studentList.layoutMiddleTitle') : undefined}
                  >
                    {s.award_type_code !== null && String(s.award_type_code) === '3' && (
                      <Crown size={14} className="text-warning" />
                    )}
                  </span>
                  <span
                    className="relative flex-shrink-0 truncate font-mono text-xs"
                    style={{ width: widths.student_code }}
                  >
                    {s.student_code}
                  </span>
                  <span
                    className={`relative flex-shrink-0 truncate font-medium ${hasPlayed && !isAutoPlaying && !isOn ? 'text-muted-foreground' : ''}`}
                    style={{ width: widths.full_name }}
                  >
                    {s.full_name}
                  </span>
                  <span
                    className="relative flex-shrink-0 truncate text-xs text-foreground"
                    style={{ width: widths.major_name }}
                  >
                    {s.major_name}
                  </span>
                  <span
                    className="relative flex-shrink-0 truncate text-xs text-foreground"
                    style={{ width: widths.class_code }}
                  >
                    {s.class_code}
                  </span>
                  <span
                    className="relative flex-shrink-0 truncate text-xs text-foreground"
                    style={{ width: widths.status }}
                  >
                    {getStatusLabel(s.status)}
                  </span>
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
            {filtered.map((s, rawIdx) => {
              const isOn = onStage?.student_code === s.student_code;
              const isSelected = selectedMsv === s.student_code;
              const isAutoPlaying = view === 'scanned' && autoPlay.currentCode === s.student_code;
              const hasPlayed = view === 'scanned' && autoPlay.playedCodes.includes(s.student_code);
              const pgSt = pregenStatus?.students?.[s.student_code];
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
                  key={s.student_code}
                  onClick={() => {
                    setSelectedMsv(s.student_code);
                    onFocusChange(true);
                  }}
                  onContextMenu={(e) => openCtxMenu(s, e)}
                  className={`absolute left-0 right-0 flex cursor-pointer items-center justify-end gap-2 border-b border-border px-2 font-medium ${actionBg}`}
                  style={{ height: ROW_HEIGHT, top: rawIdx * ROW_HEIGHT }}
                >
                  {view === 'all' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = s.status === 'absent' ? 'registered' : 'absent';
                        socket.current?.emit('cmd:setStatus', {
                          student_code: s.student_code,
                          status: next,
                        });
                        patchStudentLocal(s.student_code, { status: next });
                      }}
                      className={`rounded border px-2 py-1 text-xs font-medium ${
                        s.status === 'absent'
                          ? 'border-border text-foreground hover:bg-muted'
                          : 'border-warning/40 text-warning hover:bg-warning/10'
                      }`}
                    >
                      {s.status === 'absent' ? t('studentList.present') : t('studentList.absent')}
                    </button>
                  )}
                  {view === 'scanned' && hasPlayed ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onReplay?.(s.student_code);
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
                          student_code: s.student_code,
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
          student={ctxMenu.student}
          pgSt={pregenStatus?.students?.[ctxMenu.student.student_code]}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          onViewDetail={() => {
            setPopoverStudent(ctxMenu.student);
            setPopoverPos({ x: ctxMenu.x, y: ctxMenu.y });
            setPopoverOpen(true);
            setPopoverMode('card');
          }}
          onPlayAudio={async () => {
            const res = await slide?.pregenGetAudio(ctxMenu.student.student_code);
            if (res?.ok && res.buffer) await playPcm(res.buffer.slice(44), 48000);
          }}
          onRegenAudio={() => slide?.pregenRequeue(ctxMenu.student.student_code)}
          onToggleAbsent={() => {
            const s = ctxMenu.student;
            const next = s.status === 'absent' ? 'registered' : 'absent';
            socket.current?.emit('cmd:setStatus', { student_code: s.student_code, status: next });
            patchStudentLocal(s.student_code, { status: next });
          }}
          onPlay={() =>
            socket.current?.emit('cmd:show', {
              student_code: ctxMenu.student.student_code,
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
          {avatarPreview.student.image_relative_path ? (
            <img
              src={resolveAsset(avatarPreview.student.image_relative_path)}
              alt={avatarPreview.student.full_name}
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
          displayOrderFallback={
            students.findIndex((x) => x.student_code === popoverStudent.student_code) + 1
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
