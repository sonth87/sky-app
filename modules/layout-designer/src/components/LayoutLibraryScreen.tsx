// LayoutLibraryScreen — Giai đoạn 5.1 (docs/roadmap/plans/layout-designer/12-thu-vien-layout.md).
// Màn hình đầu tiên khi mở app Layout Designer: liệt kê MỌI LayoutDocument (theo currentDraft —
// KHÁC LayoutPickerModal bên ceremony vốn chỉ hiện layout đã publish, ở đây là công cụ SỬA nên
// layout đang soạn dở cũng phải thấy được), tìm theo tên, mở để sửa, tạo mới, sao chép cả layout.
// Thumbnail dùng lại đúng pattern LayoutPickerModal (LayoutRenderer + demoCanonicalSubject +
// cache resolveAssetUrl theo batch).

import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Info, Plus, Search, Download, Upload } from 'lucide-react';
import type { LayoutPort } from '@sky-app/service-contracts';
import { LayoutRenderer, demoCanonicalSubject, type LayoutContent } from '@sky-app/slide-shared';
import { cn } from '@sky-app/ui';
import { LayoutInfoModal } from './LayoutInfoModal.js';

export interface LayoutLibraryScreenProps {
  layoutPort: LayoutPort;
  resolveAssetUrl?: (path: string) => Promise<string>;
  onOpen: (layoutId: string) => void;
}

interface LibraryEntry {
  id: string;
  name: string;
  description?: string;
  color?: string;
  category?: string;
  tags: string[];
  content: LayoutContent;
}

const THUMB_SIZE = { w: 220, h: 124 };
const DEMO_RECORD = demoCanonicalSubject();

export function LayoutLibraryScreen({ layoutPort, resolveAssetUrl, onOpen }: LayoutLibraryScreenProps) {
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [assetUrlCache, setAssetUrlCache] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [nameModal, setNameModal] = useState<
    | { mode: 'create' }
    | { mode: 'duplicate'; source: LibraryEntry }
    | null
  >(null);
  const [infoModalEntry, setInfoModalEntry] = useState<LibraryEntry | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ x: number; y: number } | null>(null);
  const cardRectsRef = useRef<Map<string, DOMRect>>(new Map());

  useEffect(() => {
    if (!message) return;
    const timeout = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timeout);
  }, [message]);

  // Track document mousemove/mouseup when dragging (keep drag box visible when mouse leaves grid)
  useEffect(() => {
    if (!dragStart) return;

    const handleDocumentMouseMove = (e: MouseEvent) => {
      setDragEnd({ x: e.clientX, y: e.clientY });

      const minX = Math.min(dragStart.x, e.clientX);
      const maxX = Math.max(dragStart.x, e.clientX);
      const minY = Math.min(dragStart.y, e.clientY);
      const maxY = Math.max(dragStart.y, e.clientY);
      const dragBox = new DOMRect(minX, minY, maxX - minX, maxY - minY);

      const newSelection = new Set<string>();
      for (const [id, rect] of cardRectsRef.current) {
        if (boxesOverlap(dragBox, rect)) {
          newSelection.add(id);
        }
      }
      setSelectedIds(newSelection);
    };

    const handleDocumentMouseUp = () => {
      if (dragStart && dragEnd) {
        if (selectedIds.size > 0) {
          setLastSelectedId(Array.from(selectedIds)[selectedIds.size - 1]!);
        }
      }
      setDragStart(null);
      setDragEnd(null);
    };

    document.addEventListener('mousemove', handleDocumentMouseMove);
    document.addEventListener('mouseup', handleDocumentMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      document.removeEventListener('mouseup', handleDocumentMouseUp);
    };
  }, [dragStart]);

  function handleCardClick(id: string, event: React.MouseEvent) {
    event.preventDefault();

    if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd+click: toggle select
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setLastSelectedId(id);
    } else if (event.shiftKey && lastSelectedId && filtered.length > 0) {
      // Shift+click: select range from lastSelectedId to current id
      const allIds = filtered.map((e) => e.id);
      const lastIdx = allIds.indexOf(lastSelectedId);
      const currIdx = allIds.indexOf(id);
      if (lastIdx >= 0 && currIdx >= 0) {
        const [start, end] = lastIdx < currIdx ? [lastIdx, currIdx] : [currIdx, lastIdx];
        const rangeIds = allIds.slice(start, end + 1);
        setSelectedIds(new Set(rangeIds));
      }
      setLastSelectedId(id);
    } else {
      // Normal click: single select
      setSelectedIds(new Set([id]));
      setLastSelectedId(id);
    }
  }

  function isSelected(id: string) {
    return selectedIds.has(id);
  }

  function boxesOverlap(box1: DOMRect, box2: DOMRect): boolean {
    return !(box2.right < box1.left || box2.left > box1.right || box2.bottom < box1.top || box2.top > box1.bottom);
  }

  function handleGridMouseDown(e: React.MouseEvent) {
    // Chỉ bắt đầu drag nếu click ở vùng trống (không click vào card)
    if ((e.target as HTMLElement).closest('[data-card]')) return;
    setDragStart({ x: e.clientX, y: e.clientY });
    setDragEnd({ x: e.clientX, y: e.clientY });
  }


  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    void (async () => {
      const summaries = await layoutPort.listDocuments();
      const docs = await Promise.all(summaries.map((s) => layoutPort.getDocument(s.id)));
      const built = docs
        .filter((d): d is NonNullable<typeof d> => d != null)
        .map(
          (d): LibraryEntry => ({
            id: d.id,
            name: d.name,
            description: d.description,
            color: d.color,
            category: d.category,
            tags: d.tags ?? [],
            content: d.currentDraft,
          }),
        );
      if (!cancelled) setEntries(built);
    })();
    return () => {
      cancelled = true;
    };
  }, [layoutPort, reloadKey]);

  useEffect(() => {
    if (!entries || !resolveAssetUrl) return;
    let cancelled = false;
    const paths = new Set<string>();
    for (const entry of entries) {
      for (const variant of entry.content.variants) {
        if (variant.background?.kind === 'image' && variant.background.src) paths.add(variant.background.src);
      }
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
    return entries.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.category?.toLowerCase().includes(q) ?? false) ||
        e.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [entries, search]);

  async function handleCreate(name: string) {
    const id = `layout_${crypto.randomUUID()}`;
    const emptyContent: LayoutContent = {
      variants: [{ aspect: { id: '16:9', w: 16, h: 9 }, refW: 1920, refH: 1080, items: [] }],
    };
    await layoutPort.createDocument(id, name, emptyContent);
    setNameModal(null);
    onOpen(id);
  }

  async function handleDuplicate(source: LibraryEntry, name: string) {
    const id = `layout_${crypto.randomUUID()}`;
    const clonedContent = structuredClone(source.content);
    await layoutPort.createDocument(id, name, clonedContent, source.description);
    setNameModal(null);
    setReloadKey((k) => k + 1);
  }

  async function handleSaveInfo(id: string, patch: { name: string; description?: string; category?: string; tags: string[] }) {
    await layoutPort.updateDocumentMeta(id, patch);
    setInfoModalEntry(null);
    setReloadKey((k) => k + 1);
  }

  async function handleExport() {
    if (!layoutPort.exportBundle) {
      setMessage({ type: 'error', text: 'Tính năng xuất layout chỉ khả dụng trên Electron.' });
      return;
    }
    if (selectedIds.size === 0) {
      setMessage({ type: 'error', text: 'Chọn ít nhất 1 layout để xuất.' });
      return;
    }
    setExportLoading(true);
    try {
      const layoutIds = Array.from(selectedIds);
      const result = await layoutPort.exportBundle(layoutIds);
      if (result === null) {
        setMessage({ type: 'error', text: 'Hủy xuất layout.' });
      } else if (result.ok) {
        setMessage({ type: 'success', text: `Đã xuất ${layoutIds.length} layout thành công.` });
        setSelectedIds(new Set());
      } else {
        setMessage({ type: 'error', text: result.message });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Lỗi xuất layout.' });
    } finally {
      setExportLoading(false);
    }
  }

  async function handleImport() {
    if (!layoutPort.importBundle) {
      setMessage({ type: 'error', text: 'Tính năng nhập layout chỉ khả dụng trên Electron.' });
      return;
    }
    setImportLoading(true);
    try {
      const result = await layoutPort.importBundle('rename');
      if (result === null) {
        setMessage({ type: 'error', text: 'Hủy nhập layout.' });
      } else if (result.ok) {
        setMessage({ type: 'success', text: `Đã nhập ${result.imported} layout thành công.` });
        setReloadKey((k) => k + 1);
      } else {
        setMessage({ type: 'error', text: result.message });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Lỗi nhập layout.' });
    } finally {
      setImportLoading(false);
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f4f5f9]">
      <div className="h-[52px] shrink-0 flex items-center gap-3 px-[14px] bg-white border-b border-[#e6e6ee]">
        <div className="font-semibold text-sm">Thư viện Layout</div>
        <div className="flex-1" />
        <div className="relative w-[240px]">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9a9bab]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên, phân loại, thẻ..."
            className="w-full rounded-[8px] border border-[#e6e6ee] bg-[#f4f5f9] py-[7px] pl-8 pr-2 text-xs"
          />
        </div>
        <button
          onClick={handleExport}
          disabled={exportLoading || selectedIds.size === 0}
          title={selectedIds.size === 0 ? 'Chọn layout để xuất' : 'Xuất layout được chọn'}
          className="flex items-center gap-1.5 px-3 py-[7px] rounded-[8px] border border-[#e6e6ee] bg-white text-[#5c5d6e] font-bold text-[11.5px] cursor-pointer hover:bg-[#f4f5f9] disabled:opacity-50 disabled:cursor-default"
        >
          <Download size={14} />
          {exportLoading ? 'Đang xuất...' : `Xuất${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
        </button>
        <button
          onClick={handleImport}
          disabled={importLoading}
          title="Nhập layout"
          className="flex items-center gap-1.5 px-3 py-[7px] rounded-[8px] border border-[#e6e6ee] bg-white text-[#5c5d6e] font-bold text-[11.5px] cursor-pointer hover:bg-[#f4f5f9] disabled:opacity-50 disabled:cursor-default"
        >
          <Upload size={14} />
          {importLoading ? 'Đang nhập...' : 'Nhập'}
        </button>
        <button
          onClick={() => setNameModal({ mode: 'create' })}
          className="flex items-center gap-1.5 px-3 py-[7px] rounded-[8px] border-none bg-[#4b57e6] text-white font-bold text-[11.5px] cursor-pointer hover:bg-[#3b47d6]"
        >
          <Plus size={14} />
          Tạo layout mới
        </button>
      </div>

      {message && (
        <div className={cn(
          'px-3.5 py-2.5 text-sm flex items-center justify-between',
          message.type === 'error' ? 'bg-[#fee2e2] text-[#7f1d1d]' : 'bg-[#e6fffa] text-[#134e4a]'
        )}>
          <span>{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            className="text-xs cursor-pointer opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      <div
        className="flex-1 overflow-auto p-[18px] relative select-none"
        onMouseDown={handleGridMouseDown}
      >
        {entries == null && <div className="py-10 text-center text-sm text-[#9a9bab]">Đang tải...</div>}
        {entries != null && entries.length === 0 && (
          <div className="rounded-[12px] border border-dashed border-[#d8d9e3] p-10 text-center text-sm text-[#9a9bab]">
            Chưa có layout nào — bấm "Tạo layout mới" để bắt đầu.
          </div>
        )}
        {entries != null && entries.length > 0 && filtered.length === 0 && (
          <div className="rounded-[12px] border border-dashed border-[#d8d9e3] p-10 text-center text-sm text-[#9a9bab]">
            Không tìm thấy layout khớp "{search}".
          </div>
        )}
        {filtered.length > 0 && (
          <div className="grid gap-[14px]" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {filtered.map((entry) => (
              <div
                key={entry.id}
                data-card={entry.id}
                ref={(el) => {
                  if (el) {
                    const rect = el.getBoundingClientRect();
                    cardRectsRef.current.set(entry.id, rect);
                  }
                }}
                className={cn(
                  'group relative flex flex-col gap-2 rounded-[12px] border p-2 cursor-pointer transition-all',
                  isSelected(entry.id)
                    ? 'border-[#4b57e6] bg-[#f0f2ff] shadow-[0_4px_14px_rgba(75,87,230,0.15)]'
                    : 'border-[#e6e6ee] bg-white hover:border-[#4b57e6]/50 hover:shadow-[0_4px_14px_rgba(0,0,0,0.06)]'
                )}
                onClick={(e) => handleCardClick(entry.id, e)}
                onDoubleClick={() => onOpen(entry.id)}
              >
                <div style={{ width: THUMB_SIZE.w, height: THUMB_SIZE.h }} className="overflow-hidden rounded-[8px] bg-black">
                  <LayoutRenderer content={entry.content} screen={THUMB_SIZE} record={DEMO_RECORD} resolveAsset={resolveAsset} />
                </div>
                <div className="flex items-center gap-1.5 px-1 min-w-0">
                  {entry.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />}
                  <span className="truncate text-xs font-semibold text-[#26262e]">{entry.name}</span>
                </div>
                <div className="truncate px-1 text-[10px] text-[#9a9bab]">
                  {entry.content.variants.map((v) => v.aspect.id).join(', ')}
                  {entry.category && <span> · {entry.category}</span>}
                </div>
                {entry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 px-1">
                    {entry.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-[#f4f5f9] px-[7px] py-[1px] text-[9.5px] font-semibold text-[#5c5d6e]">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setInfoModalEntry(entry);
                    }}
                    title="Thông tin layout"
                    className="flex items-center justify-center w-[26px] h-[26px] rounded-[7px] border border-[#e6e6ee] bg-white text-[#5c5d6e] cursor-pointer hover:bg-[#f4f5f9]"
                  >
                    <Info size={13} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setNameModal({ mode: 'duplicate', source: entry });
                    }}
                    title="Sao chép cả layout"
                    className={cn(
                      'flex items-center justify-center w-[26px] h-[26px] rounded-[7px] border border-[#e6e6ee] bg-white text-[#5c5d6e] cursor-pointer hover:bg-[#f4f5f9]',
                    )}
                  >
                    <Copy size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {dragStart && dragEnd && (
          <div
            className="absolute border-2 border-[#4b57e6] bg-[#4b57e6]/5 pointer-events-none"
            style={{
              left: Math.min(dragStart.x, dragEnd.x),
              top: Math.min(dragStart.y, dragEnd.y),
              width: Math.abs(dragEnd.x - dragStart.x),
              height: Math.abs(dragEnd.y - dragStart.y),
            }}
          />
        )}
      </div>

      {nameModal && (
        <NameModal
          title={nameModal.mode === 'create' ? 'Tạo layout mới' : 'Sao chép layout'}
          initialName={nameModal.mode === 'create' ? '' : `${nameModal.source.name} (bản sao)`}
          confirmLabel={nameModal.mode === 'create' ? 'Tạo' : 'Sao chép'}
          onClose={() => setNameModal(null)}
          onConfirm={(name) => {
            if (nameModal.mode === 'create') void handleCreate(name);
            else void handleDuplicate(nameModal.source, name);
          }}
        />
      )}

      {infoModalEntry && (
        <LayoutInfoModal
          initial={{ name: infoModalEntry.name, description: infoModalEntry.description, category: infoModalEntry.category, tags: infoModalEntry.tags }}
          onClose={() => setInfoModalEntry(null)}
          onSave={(patch) => handleSaveInfo(infoModalEntry.id, patch)}
        />
      )}
    </div>
  );
}

function NameModal({
  title,
  initialName,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  title: string;
  initialName: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[360px] rounded-[12px] bg-white p-[18px] shadow-[0_14px_34px_rgba(20,20,40,0.18)]"
      >
        <div className="mb-3 font-bold text-sm">{title}</div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && trimmed) onConfirm(trimmed);
          }}
          placeholder="Tên layout"
          className="w-full rounded-[8px] border border-[#e6e6ee] p-[8px_10px] text-sm mb-4"
        />
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-[8px] bg-[#f4f5f9] text-[#5c5d6e] border-none rounded-[8px] font-semibold text-xs cursor-pointer"
          >
            Huỷ
          </button>
          <button
            onClick={() => trimmed && onConfirm(trimmed)}
            disabled={!trimmed}
            className={cn(
              'flex-1 py-[8px] border-none rounded-[8px] font-bold text-xs',
              trimmed ? 'bg-[#4b57e6] text-white cursor-pointer hover:bg-[#3b47d6]' : 'bg-[#e6e6ee] text-[#9a9bab] cursor-default',
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
