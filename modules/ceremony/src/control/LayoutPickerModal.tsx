// LayoutPickerModal — Giai đoạn 4b kế hoạch Event (wizard Bước 3: bảng quy tắc layout theo điều
// kiện, docs/roadmap/plans/layout-designer/16-wireframe-control.md, 17-prompt-claude-design-
// control.md Màn 4). Lưới thumbnail render qua LayoutRenderer + record demo cố định (không phụ
// thuộc DataSource thật — có thể chưa tồn tại lúc cấu hình Bước 3). Chọn 1 layout → trả về
// {layoutId, layoutVersion} ĐÃ GHIM version published lúc chọn (21-layout-versioning.md §5),
// KHÔNG trỏ "bản mới nhất" — Event đang chạy phải ổn định dù designer sửa tiếp layout đó sau.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetPort, LayoutPort } from '@sky-app/service-contracts';
import { LayoutRenderer, type LayoutContent } from '@sky-app/slide-shared';
import { Modal } from './components/ui/Modal.js';
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
}

const THUMB_SIZE = { w: 200, h: 112 };
const DEMO_RECORD = demoCanonicalSubject();

export function LayoutPickerModal({ open, onClose, layoutPort, assetPort, onPick }: LayoutPickerModalProps) {
  const { t } = useTranslation();
  const [layouts, setLayouts] = useState<PickableLayout[] | null>(null);
  const [assetUrlCache, setAssetUrlCache] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLayouts(null);
    void (async () => {
      const docs = await layoutPort.listDocuments();
      // Layout CHƯA publish version nào → ẩn khỏi lưới (không thể ghim version không tồn tại).
      const publishable = docs.filter((d) => d.latestPublishedVersion != null);
      const withContent = await Promise.all(
        publishable.map(async (d) => {
          const version = await layoutPort.getVersion(d.id, d.latestPublishedVersion as number);
          if (!version) return null;
          return { id: d.id, name: d.name, version: version.version, content: version.content } satisfies PickableLayout;
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

  return (
    <Modal open={open} onClose={onClose} title={t('layoutPicker.title')} size="lg">
      {layouts == null && <div className="py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</div>}
      {layouts != null && layouts.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t('layoutPicker.emptyState')}
        </div>
      )}
      {layouts != null && layouts.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {layouts.map((layout) => (
            <button
              key={layout.id}
              type="button"
              className="flex flex-col gap-1.5 rounded-lg border border-border p-2 text-left hover:border-primary"
              onClick={() => onPick({ layoutId: layout.id, layoutVersion: layout.version })}
            >
              <div style={{ width: THUMB_SIZE.w, height: THUMB_SIZE.h }} className="overflow-hidden rounded-md bg-black">
                <LayoutRenderer content={layout.content} screen={THUMB_SIZE} record={DEMO_RECORD} resolveAsset={resolveAsset} />
              </div>
              <span className="truncate text-xs font-medium text-foreground">{layout.name}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
