// CrossLayoutVariantPickerModal — Giai đoạn 5.1 (docs/roadmap/plans/layout-designer/
// 12-thu-vien-layout.md "Sao chép variant"). Bước 1 của luồng "Sao chép từ layout khác": liệt
// kê MỌI variant của MỌI layout (draft, không lọc theo published — khác LayoutPickerModal bên
// ceremony), người dùng chọn 1 variant NGUỒN. Bước 2 (chọn tỷ lệ ĐÍCH) do VariantTabs tự mở lại
// AddVariantModal sau khi component này trả kết quả — component này KHÔNG tự làm bước 2, chỉ
// chọn nguồn (giữ đơn giản, tái dùng AddVariantModal có sẵn cho việc chọn tỷ lệ thay vì viết lại).

import { useEffect, useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import type { LayoutPort } from '@sky-app/service-contracts';
import { LayoutRenderer, demoCanonicalSubject, type LayoutContent, type LayoutVariant } from '@sky-app/slide-shared';
import { cn } from '@sky-app/ui';

export interface CrossLayoutVariantPickerModalProps {
  layoutPort: LayoutPort;
  resolveAssetUrl?: (path: string) => Promise<string>;
  onClose: () => void;
  onPick: (variant: LayoutVariant, sourceLabel: string) => void;
}

interface VariantEntry {
  key: string;
  layoutName: string;
  variant: LayoutVariant;
}

const THUMB_SIZE = { w: 180, h: 100 };
const DEMO_RECORD = demoCanonicalSubject();

export function CrossLayoutVariantPickerModal({ layoutPort, resolveAssetUrl, onClose, onPick }: CrossLayoutVariantPickerModalProps) {
  const [entries, setEntries] = useState<VariantEntry[] | null>(null);
  const [assetUrlCache, setAssetUrlCache] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const summaries = await layoutPort.listDocuments();
      const docs = await Promise.all(summaries.map((s) => layoutPort.getDocument(s.id)));
      const built: VariantEntry[] = [];
      for (const d of docs) {
        if (!d) continue;
        for (const variant of d.currentDraft.variants) {
          built.push({ key: `${d.id}::${variant.aspect.id}`, layoutName: d.name, variant });
        }
      }
      if (!cancelled) setEntries(built);
    })();
    return () => {
      cancelled = true;
    };
  }, [layoutPort]);

  useEffect(() => {
    if (!entries || !resolveAssetUrl) return;
    let cancelled = false;
    const paths = new Set<string>();
    for (const entry of entries) {
      if (entry.variant.background?.kind === 'image' && entry.variant.background.src) paths.add(entry.variant.background.src);
    }
    void (async () => {
      const resolved = await Promise.all([...paths].map(async (p) => [p, await resolveAssetUrl(p)] as const));
      if (!cancelled) setAssetUrlCache(Object.fromEntries(resolved));
    })();
    return () => {
      cancelled = true;
    };
  }, [entries, resolveAssetUrl]);

  const resolveAsset = (relativePath: string) => assetUrlCache[relativePath] ?? relativePath;

  const filtered = useMemo(() => {
    if (!entries) return [];
    const q = search.trim().toLowerCase();
    if (q === '') return entries;
    return entries.filter((e) => e.layoutName.toLowerCase().includes(q) || e.variant.aspect.id.toLowerCase().includes(q));
  }, [entries, search]);

  const selected = entries?.find((e) => e.key === selectedKey);

  function confirm(entry: VariantEntry) {
    onPick(entry.variant, `${entry.layoutName} · ${entry.variant.aspect.id}`);
  }

  function thumbnailContent(variant: LayoutVariant): LayoutContent {
    return { variants: [variant] };
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-[720px] flex-col rounded-[12px] bg-white p-[18px] shadow-[0_14px_34px_rgba(20,20,40,0.18)]"
      >
        <div className="mb-3 flex items-center gap-2">
          <div className="font-bold text-sm">Sao chép từ layout khác</div>
          <div className="flex-1" />
          <div className="relative w-[220px]">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9a9bab]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên layout hoặc tỷ lệ..."
              className="w-full rounded-[8px] border border-[#e6e6ee] bg-[#f4f5f9] py-[6px] pl-8 pr-2 text-xs"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {entries == null && <div className="py-8 text-center text-sm text-[#9a9bab]">Đang tải...</div>}
          {entries != null && entries.length === 0 && (
            <div className="rounded-[10px] border border-dashed border-[#d8d9e3] p-8 text-center text-sm text-[#9a9bab]">
              Chưa có variant nào để sao chép.
            </div>
          )}
          {entries != null && entries.length > 0 && filtered.length === 0 && (
            <div className="rounded-[10px] border border-dashed border-[#d8d9e3] p-8 text-center text-sm text-[#9a9bab]">
              Không tìm thấy variant phù hợp.
            </div>
          )}
          {filtered.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {filtered.map((entry) => {
                const isSelected = entry.key === selectedKey;
                return (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => setSelectedKey(entry.key)}
                    onDoubleClick={() => confirm(entry)}
                    className={cn(
                      'relative flex flex-col gap-1.5 rounded-[10px] border p-2 text-left cursor-pointer',
                      isSelected ? 'border-[#4b57e6] ring-2 ring-[#4b57e6]/30' : 'border-[#e6e6ee] hover:border-[#4b57e6]/50',
                    )}
                  >
                    {isSelected && (
                      <span className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[#4b57e6] text-white">
                        <Check size={13} />
                      </span>
                    )}
                    <div style={{ width: THUMB_SIZE.w, height: THUMB_SIZE.h }} className="overflow-hidden rounded-[7px] bg-black">
                      <LayoutRenderer content={thumbnailContent(entry.variant)} screen={THUMB_SIZE} record={DEMO_RECORD} resolveAsset={resolveAsset} />
                    </div>
                    <span className="truncate text-xs font-semibold text-[#26262e]">{entry.layoutName}</span>
                    <span className="truncate text-[10px] text-[#9a9bab]">{entry.variant.aspect.id}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#f0f0f5] pt-3">
          <span className="truncate text-xs text-[#9a9bab]">
            {selected ? `Đã chọn: ${selected.layoutName} · ${selected.variant.aspect.id}` : 'Chưa chọn variant nào'}
          </span>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={onClose}
              className="py-[8px] px-[14px] bg-[#f4f5f9] text-[#5c5d6e] border-none rounded-[8px] font-semibold text-xs cursor-pointer"
            >
              Huỷ
            </button>
            <button
              onClick={() => selected && confirm(selected)}
              disabled={!selected}
              className={cn(
                'py-[8px] px-[14px] border-none rounded-[8px] font-bold text-xs',
                selected ? 'bg-[#4b57e6] text-white cursor-pointer hover:bg-[#3b47d6]' : 'bg-[#e6e6ee] text-[#9a9bab] cursor-default',
              )}
            >
              Tiếp tục — chọn tỷ lệ đích
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
