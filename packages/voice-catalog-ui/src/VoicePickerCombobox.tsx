import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Loader2 } from 'lucide-react';
import { useVoiceFilter } from './useVoiceFilter.js';
import { VoiceSearchBar } from './VoiceSearchBar.js';
import { VoiceRow, type PreviewState } from './VoiceRow.js';
import type { VoiceListItem, VoiceListOrigin } from './types.js';

export interface VoicePickerComboboxProps {
  items: VoiceListItem[];
  value: string | null;
  onChange: (id: string) => void;
  /** state === 'idle' nếu không truyền, key = item.id */
  previewStates?: Record<string, PreviewState>;
  onPreview: (item: VoiceListItem, e: React.MouseEvent) => void;
  /** Resolve ảnh minh hoạ (voice-covers/cover-NN.webp, xem getVoiceCoverPath) thành URL hiển
   * thị được — path tương đối cần đi qua platform.assetUrl vì khác nhau giữa Web/Electron,
   * xem VoicePicker.tsx (tts-studio)/VoicePickerPopover.tsx (ceremony) là nơi truyền vào. */
  getCoverUrl: (item: VoiceListItem) => string;
  loading?: boolean;
  loadingLabel?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  compact?: boolean;
  /** false = chỉ cho nghe thử, không cho chọn (vd model chưa tải xong) — mặc định true. */
  canSelect?: boolean;
  /** Nhãn 2 tab (origin 'system' = hệ thống cung cấp sẵn, 'custom' = user tự upload/clone).
   * Bỏ trống = không chia tab, gộp chung 1 danh sách. */
  tabLabels?: { system: string; custom: string };
  /** Callback khi click nút thêm voice (chỉ hiện trong tab custom). */
  onAddVoice?: () => void;
  /** Callback khi click nút xóa voice (chỉ hiện trong tab custom). */
  onDeleteVoice?: (id: string) => void;
  /** Filter "Ngôn ngữ" chọn sẵn khi mở lần đầu (vd "Vietnamese") — xem useVoiceFilter. */
  defaultLanguage?: string;
}

/**
 * Voice picker dạng combobox: trigger button hiện voice đang chọn, click mở dropdown
 * panel chứa search + filter chips + danh sách cuộn được. Dùng chung cho TTS Studio
 * và Ceremony. Không có khái niệm "Clone/Import" ở UI — chọn 1 voice là dùng được
 * ngay, mọi việc chuẩn bị (encode reference) diễn ra ngầm phía server.
 */
export function VoicePickerCombobox({
  items,
  value,
  onChange,
  previewStates = {},
  onPreview,
  getCoverUrl,
  loading,
  loadingLabel = 'Đang tải giọng đọc...',
  placeholder = 'Chọn giọng đọc',
  searchPlaceholder,
  compact,
  canSelect = true,
  tabLabels,
  onAddVoice,
  onDeleteVoice,
  defaultLanguage,
}: VoicePickerComboboxProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<VoiceListOrigin>('system');
  const ref = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  const tabItems = useMemo(
    () => (tabLabels ? items.filter((i) => i.origin === tab) : items),
    [items, tab, tabLabels],
  );

  const { filter, filtered, options, setQuery, setLanguage, setAccent, setCategory, setGender } = useVoiceFilter(tabItems, defaultLanguage);

  const selected = useMemo(() => items.find((i) => i.id === value) ?? null, [items, value]);

  // Tự lật lên trên khi bên dưới trigger không đủ chỗ (vd trigger nằm gần đáy FloatingWindow) —
  // dropdownHeight=0 ở lần đo đầu (chưa mount, chưa biết chiều cao thật) nên tạm đặt bên dưới;
  // effect thứ 2 đo lại kích thước THẬT sau khi đã mount rồi mới quyết định lật hay không. Cả
  // 2 đều dùng useLayoutEffect nên các lần setCoords nối tiếp nhau đều được React flush xong
  // TRƯỚC khi trình duyệt vẽ khung hình — không bị chớp vị trí sai 1 nhịp.
  const measurePosition = () => {
    if (!ref.current) return null;
    const rect = ref.current.getBoundingClientRect();
    const dropdownHeight = dropdownRef.current?.offsetHeight ?? 0;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = dropdownHeight > 0 && spaceBelow < dropdownHeight + 8 && spaceAbove > spaceBelow;
    return {
      top: openUp ? rect.top + window.scrollY - dropdownHeight - 4 : rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
      width: rect.width,
    };
  };

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    setCoords(measurePosition());
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !coords || !dropdownRef.current) return;
    const next = measurePosition();
    if (next && (Math.abs(next.top - coords.top) > 0.5 || Math.abs(next.left - coords.left) > 0.5)) {
      setCoords(next);
    }
  }, [open, coords]);

  useEffect(() => {
    if (!open) return;
    // Lắng nghe scroll ở chế độ capture để bắt được scroll của bất cứ scrollable container nào
    const onScrollResize = () => setCoords(measurePosition());
    window.addEventListener('scroll', onScrollResize, true);
    window.addEventListener('resize', onScrollResize);
    return () => {
      window.removeEventListener('scroll', onScrollResize, true);
      window.removeEventListener('resize', onScrollResize);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedTrigger = ref.current && ref.current.contains(target);
      const clickedDropdown = dropdownRef.current && dropdownRef.current.contains(target);
      if (!clickedTrigger && !clickedDropdown) {
        setOpen(false);
      }
    };
    const handleBlur = () => {
      setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('blur', handleBlur);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('blur', handleBlur);
    };
  }, [open]);

  const handleSelect = (item: VoiceListItem) => {
    if (!canSelect) return;
    onChange(item.id);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={loading}
        className={
          open
            ? `flex w-full items-center justify-between rounded border border-primary/60 bg-card ${compact ? 'px-2 py-1.5 text-sm' : 'px-3 py-2 text-sm'} text-left ring-1 ring-primary/30 focus:outline-none`
            : `flex w-full items-center justify-between rounded border border-border bg-card ${compact ? 'px-2 py-1.5 text-sm' : 'px-3 py-2 text-sm'} text-left hover:border-primary/60 focus:outline-none`
        }
      >
        {loading ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 size={13} className="animate-spin" /> {loadingLabel}
          </span>
        ) : selected ? (
          // flex-1 min-w-0 ở đây BẮT BUỘC: không có nó, span này co về đúng bề rộng nội dung
          // (flex item mặc định không tự giãn), khiến `max-w-[60%]` bên trong tính theo 60%
          // của 1 hộp đã tự co nhỏ thay vì 60% bề rộng trigger thật — name bị cắt còn vài ký tự
          // dù trigger còn thừa rất nhiều chỗ trống. name giữ shrink-0 (ưu tiên hiện đủ), tagline
          // giữ min-w-0/flex-1 (co trước khi hết chỗ thật).
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-foreground">
            <span className="max-w-[60%] shrink-0 truncate font-medium">{selected.name}</span>
            {selected.tagline && <span className="shrink-0 text-muted-foreground">·</span>}
            {selected.tagline && <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{selected.tagline}</span>}
          </span>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
        <ChevronDown size={16} className={open ? 'flex-shrink-0 rotate-180 text-muted-foreground transition-transform' : 'flex-shrink-0 text-muted-foreground transition-transform'} />
      </button>

      {open && coords && createPortal(
        <div
          ref={dropdownRef}
          className="absolute w-[480px] max-w-[95vw] md:w-[500px] overflow-hidden rounded-md border border-border bg-popover shadow-lg"
          style={{
            top: `${coords.top + 4}px`,
            left: `${coords.left}px`,
            // z-50 KHÔNG đủ khi trigger nằm trong FloatingWindow (device-layout dùng
            // zIndex 99999 cho mọi chrome "luôn nổi trên cùng" — dropdown portal thẳng ra
            // document.body nên là SIBLING của FloatingWindow, thua z-index sẽ bị window
            // đè lên, chỉ phần lòi ra ngoài đáy window mới thấy được. 100000 vượt mọi giá
            // trị z-index cao nhất đang dùng trong repo (xem device-layout's FloatingWindow/
            // menu bar/dialog), không ảnh hưởng consumer khác (TTS Studio/Ceremony) — dropdown
            // vốn dĩ LUÔN phải nổi trên trigger của nó bất kể ngữ cảnh nào.
            zIndex: 100000,
          }}
        >
          {tabLabels && (
            <div className="flex border-b border-border">
              <button
                type="button"
                onClick={() => setTab('system')}
                className={
                  tab === 'system'
                    ? 'flex-1 border-b-2 border-primary px-3 py-2 text-xs font-semibold text-primary'
                    : 'flex-1 border-b-2 border-transparent px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground'
                }
              >
                {tabLabels.system}
              </button>
              <button
                type="button"
                onClick={() => setTab('custom')}
                className={
                  tab === 'custom'
                    ? 'flex-1 border-b-2 border-primary px-3 py-2 text-xs font-semibold text-primary'
                    : 'flex-1 border-b-2 border-transparent px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground'
                }
              >
                {tabLabels.custom}
              </button>
            </div>
          )}

          <div className="border-b border-border p-2">
            <VoiceSearchBar
              filter={filter}
              options={options}
              onQueryChange={setQuery}
              onLanguageChange={setLanguage}
              onAccentChange={setAccent}
              onCategoryChange={setCategory}
              onGenderChange={setGender}
              searchPlaceholder={searchPlaceholder}
            />
          </div>

          <div className="max-h-80 divide-y divide-border overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">Không tìm thấy giọng phù hợp.</div>
            )}
            {filtered.map((item) => (
              <VoiceRow
                key={`${item.source}-${item.id}`}
                item={item}
                isSelected={item.id === value}
                previewState={previewStates[item.id] ?? 'idle'}
                coverUrl={getCoverUrl(item)}
                onSelect={() => handleSelect(item)}
                onPreview={(e) => onPreview(item, e)}
                onDelete={onDeleteVoice ? (e) => { e.stopPropagation(); onDeleteVoice(item.id); } : undefined}
              />
            ))}
            
            {tab === 'custom' && onAddVoice && (
              <div className="sticky bottom-0 p-3 bg-popover border-t border-border flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onAddVoice();
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/40 py-2 text-xs font-semibold text-primary hover:bg-primary/5 hover:border-primary/60 transition-colors"
                >
                  + Thêm giọng đọc mới
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
