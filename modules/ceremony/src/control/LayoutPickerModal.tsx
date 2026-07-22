// LayoutPickerModal — Giai đoạn 4b kế hoạch Event (wizard Bước 3: bảng quy tắc layout theo điều
// kiện, docs/roadmap/plans/layout-designer/16-wireframe-control.md, 17-prompt-claude-design-
// control.md Màn 4). Lưới thumbnail render qua LayoutRenderer + record demo cố định (không phụ
// thuộc DataSource thật — có thể chưa tồn tại lúc cấu hình Bước 3). Chọn 1 layout → trả về
// {layoutId, layoutVersion} ĐÃ GHIM version published lúc chọn (21-layout-versioning.md §5),
// KHÔNG trỏ "bản mới nhất" — Event đang chạy phải ổn định dù designer sửa tiếp layout đó sau.
//
// UX tích chọn + nút xác nhận (phản hồi thật, 2026-07-20) — trước đó click = chọn NGAY, đóng
// modal luôn, không có cách xem/đổi ý giữa các layout trước khi chốt. Giờ click = TÍCH CHỌN
// (viền + dấu tick góc), phải bấm "Chọn layout này" ở footer mới thực sự xác nhận. Double-click
// vẫn chọn ngay (lối tắt cho ai đã quen thao tác cũ).

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Search } from 'lucide-react';
import type { AssetPort, LayoutPort } from '@sky-app/service-contracts';
import { LayoutRenderer, type LayoutContent } from '@sky-app/slide-shared';
import { Modal } from './components/ui/Modal.js';
import { Button } from './components/ui/Button.js';
import { demoCanonicalSubject } from './lib/demoCanonicalSubject.js';

interface LayoutPickerModalProps {
  open: boolean;
  onClose: () => void;
  layoutPort: LayoutPort;
  assetPort: AssetPort | undefined;
  onPick: (ref: { layoutId: string; layoutVersion: number }) => void;
}

interface PickableLayout {
  id: string;
  name: string;
  version: number;
  content: LayoutContent;
  color?: string;
}

const THUMB_SIZE = { w: 200, h: 112 };
const DEMO_RECORD = demoCanonicalSubject();

/** Danh sách tỷ lệ duy nhất xuất hiện trong ÍT NHẤT 1 variant của MỘT layout bất kỳ — suy trực
 * tiếp từ dữ liệu đang có, không hard-code danh sách preset (khớp layout thật đang tồn tại). */
function collectAspectOptions(layouts: PickableLayout[]): string[] {
  const seen = new Set<string>();
  for (const layout of layouts) {
    for (const variant of layout.content.variants) seen.add(variant.aspect.id);
  }
  return [...seen];
}

export function LayoutPickerModal({ open, onClose, layoutPort, assetPort, onPick }: LayoutPickerModalProps) {
  const { t } = useTranslation();
  const [layouts, setLayouts] = useState<PickableLayout[] | null>(null);
  const [assetUrlCache, setAssetUrlCache] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [aspectFilter, setAspectFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLayouts(null);
    setSearch('');
    setAspectFilter('');
    setSelectedId(null);
    void (async () => {
      const docs = await layoutPort.listDocuments();
      // Layout CHƯA publish version nào → ẩn khỏi lưới (không thể ghim version không tồn tại).
      const publishable = docs.filter((d) => d.latestPublishedVersion != null);
      const withContent = await Promise.all(
        publishable.map(async (d) => {
          const version = await layoutPort.getVersion(d.id, d.latestPublishedVersion as number);
          if (!version) return null;
          const picked: PickableLayout = { id: d.id, name: d.name, version: version.version, content: version.content, color: d.color };
          return picked;
        }),
      );
      if (!cancelled) setLayouts(withContent.filter((x): x is PickableLayout => x != null));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, layoutPort]);

  // Preload URL ảnh nền của mọi variant hiển thị trong lưới — LayoutRenderer's resolveAsset
  // đồng bộ, nhưng AssetPort.resolveAssetUrl bất đồng bộ (WASM cần tạo object URL) — cache trước.
  useEffect(() => {
    if (!layouts || !assetPort) return;
    let cancelled = false;
    const paths = new Set<string>();
    for (const layout of layouts) {
      for (const variant of layout.content.variants) {
        if (variant.background?.kind === 'image' && variant.background.src) paths.add(variant.background.src);
      }
    }
    void (async () => {
      const entries = await Promise.all(
        [...paths].map(async (p) => [p, await assetPort.resolveAssetUrl(p)] as const),
      );
      if (!cancelled) setAssetUrlCache(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [layouts, assetPort]);

  const resolveAsset = (relativePath: string) => assetUrlCache[relativePath] ?? relativePath;

  const aspectOptions = useMemo(() => collectAspectOptions(layouts ?? []), [layouts]);

  const filteredLayouts = useMemo(() => {
    if (!layouts) return [];
    const q = search.trim().toLowerCase();
    return layouts.filter((layout) => {
      const matchesSearch = q === '' || layout.name.toLowerCase().includes(q);
      const matchesAspect = aspectFilter === '' || layout.content.variants.some((v) => v.aspect.id === aspectFilter);
      return matchesSearch && matchesAspect;
    });
  }, [layouts, search, aspectFilter]);

  const selectedLayout = layouts?.find((l) => l.id === selectedId);

  const confirmPick = (layout: PickableLayout) => onPick({ layoutId: layout.id, layoutVersion: layout.version });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('layoutPicker.title')}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-xs text-muted-foreground">
            {selectedLayout ? t('layoutPicker.selectedHint', { name: selectedLayout.name }) : t('layoutPicker.noneSelectedHint')}
          </span>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" disabled={!selectedLayout} onClick={() => selectedLayout && confirmPick(selectedLayout)}>
              {t('layoutPicker.confirmButton')}
            </Button>
          </div>
        </div>
      }
    >
      {layouts == null && <div className="py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</div>}
      {layouts != null && layouts.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t('layoutPicker.emptyState')}
        </div>
      )}
      {layouts != null && layouts.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-2 text-sm"
                placeholder={t('layoutPicker.searchPlaceholder') as string}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {aspectOptions.length > 1 && (
              <select
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                value={aspectFilter}
                onChange={(e) => setAspectFilter(e.target.value)}
                aria-label={t('layoutPicker.aspectFilterLabel') as string}
              >
                <option value="">{t('layoutPicker.allAspectRatios')}</option>
                {aspectOptions.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            )}
          </div>

          {filteredLayouts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {t('layoutPicker.noMatchState')}
            </div>
          ) : (
            <div className="grid max-h-[55vh] grid-cols-3 gap-3 overflow-auto">
              {filteredLayouts.map((layout) => {
                const isSelected = layout.id === selectedId;
                return (
                  <button
                    key={layout.id}
                    type="button"
                    className={`relative flex flex-col gap-1.5 rounded-lg border p-2 text-left ${
                      isSelected ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:border-primary/50'
                    }`}
                    onClick={() => setSelectedId(layout.id)}
                    onDoubleClick={() => confirmPick(layout)}
                  >
                    {isSelected && (
                      <span className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check size={13} />
                      </span>
                    )}
                    <div style={{ width: THUMB_SIZE.w, height: THUMB_SIZE.h }} className="overflow-hidden rounded-md bg-black">
                      <LayoutRenderer content={layout.content} screen={THUMB_SIZE} record={DEMO_RECORD} resolveAsset={resolveAsset} />
                    </div>
                    <span className="flex items-center gap-1.5 truncate text-xs font-medium text-foreground">
                      {layout.color && (
                        <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: layout.color }} />
                      )}
                      <span className="truncate">{layout.name}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
