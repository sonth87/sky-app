// LayoutLibraryScreen — Giai đoạn 5.1 (docs/roadmap/plans/layout-designer/12-thu-vien-layout.md).
// Màn hình đầu tiên khi mở app Layout Designer: liệt kê MỌI LayoutDocument (theo currentDraft —
// KHÁC LayoutPickerModal bên ceremony vốn chỉ hiện layout đã publish, ở đây là công cụ SỬA nên
// layout đang soạn dở cũng phải thấy được), tìm theo tên, mở để sửa, tạo mới, sao chép cả layout.
// Thumbnail dùng lại đúng pattern LayoutPickerModal (LayoutRenderer + demoCanonicalSubject +
// cache resolveAssetUrl theo batch).

import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Info, Plus, Search, Download, Upload, ChevronLeft, Layers, Trash2, Grid3X3, List } from 'lucide-react';
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
  createdAt?: number;
  updatedAt?: number;
}

const THUMB_SIZE = { w: 220, h: 124 };
const DEMO_RECORD = demoCanonicalSubject();

function normalizeString(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

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
  const [containerRect, setContainerRect] = useState<DOMRect | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; layoutId: string } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem('layout-library-sidebar-collapsed');
    return saved ? JSON.parse(saved) : false;
  });
  const [currentView, setCurrentView] = useState<'layouts' | 'trash'>('layouts');
  const [trashConfirm, setTrashConfirm] = useState<{ layoutId: string; layoutName: string } | null>(null);
  const [trashedIds, setTrashedIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    const saved = localStorage.getItem('layout-library-trashed-ids');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [rangeAnchorId, setRangeAnchorId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    if (typeof window === 'undefined') return 'grid';
    const saved = localStorage.getItem('layout-library-view-mode');
    return (saved as 'grid' | 'list') || 'grid';
  });
  const cardRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const gridContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!message) return;
    const timeout = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timeout);
  }, [message]);

  // Persist sidebar collapsed state
  useEffect(() => {
    localStorage.setItem('layout-library-sidebar-collapsed', JSON.stringify(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Persist trashed IDs
  useEffect(() => {
    localStorage.setItem('layout-library-trashed-ids', JSON.stringify([...trashedIds]));
  }, [trashedIds]);

  // Persist view mode
  useEffect(() => {
    localStorage.setItem('layout-library-view-mode', viewMode);
  }, [viewMode]);

  // Close context menu on Escape
  useEffect(() => {
    if (!contextMenu) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [contextMenu]);

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
    e.preventDefault();

    // Capture container rect for offset calculation
    if (gridContainerRef.current) {
      setContainerRect(gridContainerRef.current.getBoundingClientRect());
    }

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
            createdAt: (d as any).createdAt || (d as any).created_at,
            updatedAt: (d as any).updatedAt || (d as any).updated_at,
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

    // Filter by view (layouts vs trash)
    const viewFiltered = currentView === 'trash'
      ? entries.filter((e) => trashedIds.has(e.id))
      : entries.filter((e) => !trashedIds.has(e.id));

    // Filter by search (diacritic-insensitive)
    const q = normalizeString(search);
    if (q === '') return viewFiltered;
    return viewFiltered.filter(
      (e) =>
        normalizeString(e.name).includes(q) ||
        (e.category ? normalizeString(e.category).includes(q) : false) ||
        e.tags.some((t) => normalizeString(t).includes(q)),
    );
  }, [entries, search, currentView, trashedIds]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Close context menu & selection on Escape
      if (e.key === 'Escape') {
        if (contextMenu) {
          setContextMenu(null);
          return;
        }
        if (selectedIds.size > 0) {
          setSelectedIds(new Set());
          return;
        }
      }

      // Arrow navigation (only in layouts view)
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') && currentView === 'layouts') {
        if (filtered.length === 0 || !lastSelectedId) return;
        e.preventDefault();

        const currentRect = cardRectsRef.current.get(lastSelectedId);
        if (!currentRect) return;

        // For grid view: find neighbor based on position
        if (viewMode === 'grid') {
          const allIds = filtered.map((x) => x.id);
          let nextId: string | undefined;

          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            // Vertical: find item at same horizontal position, above/below
            const centerX = currentRect.left + currentRect.width / 2;
            const neighbors = allIds
              .filter((id) => {
                const rect = cardRectsRef.current.get(id);
                if (!rect) return false;
                const rectCenterX = rect.left + rect.width / 2;
                return Math.abs(rectCenterX - centerX) < rect.width * 0.8; // same column
              })
              .map((id) => ({ id, rect: cardRectsRef.current.get(id)! }))
              .sort((a, b) => a.rect.top - b.rect.top);

            const currentIndex = neighbors.findIndex((n) => n.id === lastSelectedId);
            if (currentIndex >= 0) {
              const offset = e.key === 'ArrowDown' ? 1 : -1;
              nextId = neighbors[Math.max(0, Math.min(neighbors.length - 1, currentIndex + offset))]?.id;
            }
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            // Horizontal: find item at same vertical position, left/right
            const centerY = currentRect.top + currentRect.height / 2;
            const neighbors = allIds
              .filter((id) => {
                const rect = cardRectsRef.current.get(id);
                if (!rect) return false;
                const rectCenterY = rect.top + rect.height / 2;
                return Math.abs(rectCenterY - centerY) < rect.height * 0.8; // same row
              })
              .map((id) => ({ id, rect: cardRectsRef.current.get(id)! }))
              .sort((a, b) => a.rect.left - b.rect.left);

            const currentIndex = neighbors.findIndex((n) => n.id === lastSelectedId);
            if (currentIndex >= 0) {
              const offset = e.key === 'ArrowRight' ? 1 : -1;
              const neighborIndex = Math.max(0, Math.min(neighbors.length - 1, currentIndex + offset));
              nextId = neighbors[neighborIndex]?.id;
            } else if (neighbors.length > 0) {
              // Fallback: wrap to next/prev row (linear navigation)
              const currentLinearIndex = allIds.indexOf(lastSelectedId);
              if (currentLinearIndex >= 0) {
                const nextLinearIndex = currentLinearIndex + (e.key === 'ArrowRight' ? 1 : -1);
                if (nextLinearIndex >= 0 && nextLinearIndex < allIds.length) {
                  nextId = allIds[nextLinearIndex];
                }
              }
            }
          }

          if (nextId) {
            if (e.shiftKey) {
              // Range selection: start from anchor (or current if first shift)
              const anchor = rangeAnchorId || lastSelectedId;
              if (anchor) {
                const allIds = filtered.map((x) => x.id);
                const anchorIndex = allIds.indexOf(anchor);
                const nextIndex = allIds.indexOf(nextId);
                if (anchorIndex >= 0 && nextIndex >= 0) {
                  const [start, end] = anchorIndex < nextIndex ? [anchorIndex, nextIndex] : [nextIndex, anchorIndex];
                  setSelectedIds(new Set(allIds.slice(start, end + 1)));
                  setRangeAnchorId(anchor);
                  setLastSelectedId(nextId); // Update to allow continuing expansion
                }
              }
            } else {
              // Normal selection: single item
              setSelectedIds(new Set([nextId]));
              setLastSelectedId(nextId);
              setRangeAnchorId(null);
            }
          }
        } else {
          // List view: only vertical navigation
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;

          const allIds = filtered.map((x) => x.id);
          const currentIndex = allIds.indexOf(lastSelectedId);
          if (currentIndex < 0) return;

          const nextIndex = e.key === 'ArrowDown'
            ? Math.min(currentIndex + 1, allIds.length - 1)
            : Math.max(currentIndex - 1, 0);

          const nextId = allIds[nextIndex];
          if (nextId) {
            if (e.shiftKey) {
              // Range selection: start from anchor (or current if first shift)
              const anchor = rangeAnchorId || lastSelectedId;
              if (anchor) {
                const anchorIndex = allIds.indexOf(anchor);
                const nextIndexAdjusted = allIds.indexOf(nextId);
                if (anchorIndex >= 0 && nextIndexAdjusted >= 0) {
                  const [start, end] = anchorIndex < nextIndexAdjusted ? [anchorIndex, nextIndexAdjusted] : [nextIndexAdjusted, anchorIndex];
                  setSelectedIds(new Set(allIds.slice(start, end + 1)));
                  setRangeAnchorId(anchor);
                  setLastSelectedId(nextId); // Update to allow continuing expansion
                }
              }
            } else {
              // Normal selection: single item
              setSelectedIds(new Set([nextId]));
              setLastSelectedId(nextId);
              setRangeAnchorId(null);
            }
          }
        }
      }

      // Enter to open selected
      if (e.key === 'Enter' && selectedIds.size === 1 && currentView === 'layouts') {
        const selectedId = Array.from(selectedIds)[0];
        if (selectedId) {
          onOpen(selectedId);
        }
      }

      // Delete to move to trash
      if (e.key === 'Delete' && selectedIds.size === 1 && currentView === 'layouts') {
        const selectedId = Array.from(selectedIds)[0];
        const entry = filtered.find((x) => x.id === selectedId);
        if (entry) {
          setTrashConfirm({ layoutId: entry.id, layoutName: entry.name });
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [contextMenu, selectedIds, lastSelectedId, filtered, currentView, onOpen, rangeAnchorId, viewMode]);

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

  async function handleConfirmMoveToTrash() {
    if (!trashConfirm) return;
    try {
      // Call port to update DB (soft delete)
      if (layoutPort?.moveToTrash) {
        await layoutPort.moveToTrash(trashConfirm.layoutId);
      } else {
        // Fallback to localStorage only if moveToTrash not available
        setTrashedIds((prev) => new Set([...prev, trashConfirm.layoutId]));
      }
      setMessage({ type: 'success', text: `Đã chuyển "${trashConfirm.layoutName}" vào thùng rác.` });
      setTrashConfirm(null);
      setSelectedIds(new Set());
      // Reload entries to reflect deletion from DB
      setReloadKey((k) => k + 1);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Lỗi chuyển vào thùng rác.' });
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f4f5f9]">
      <div className="h-[52px] shrink-0 flex items-center gap-3 px-[14px] bg-white border-b border-[#e6e6ee]">
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
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode('grid')}
            title="Grid view"
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-md cursor-pointer transition-colors',
              viewMode === 'grid'
                ? 'bg-[#4b57e6] text-white'
                : 'text-[#5c5d6e] hover:bg-[#f4f5f9]'
            )}
          >
            <Grid3X3 size={16} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            title="List view"
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-md cursor-pointer transition-colors',
              viewMode === 'list'
                ? 'bg-[#4b57e6] text-white'
                : 'text-[#5c5d6e] hover:bg-[#f4f5f9]'
            )}
          >
            <List size={16} />
          </button>
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

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className={cn(
          'shrink-0 bg-white border-r border-[#e6e6ee] flex flex-col transition-all duration-200',
          sidebarCollapsed ? 'w-[60px]' : 'w-[200px]'
        )}>
          {/* Menu items */}
          <div className="flex-1 pt-2">
            {/* Layouts item */}
            <div
              onClick={() => setCurrentView('layouts')}
              className={cn(
                'group relative hover:bg-[#f4f5f9] cursor-pointer transition-colors',
                currentView === 'layouts' && 'bg-[#f0f2ff]'
              )}
            >
              <div className={cn(
                'flex items-center gap-2.5',
                currentView === 'layouts' ? 'text-[#4b57e6]' : 'text-[#5c5d6e]',
                sidebarCollapsed ? 'justify-center px-3 py-3' : 'px-3 py-3'
              )}>
                <Layers size={18} className="shrink-0" />
                {!sidebarCollapsed && <span className="text-sm font-medium">Layouts</span>}
              </div>
              {sidebarCollapsed && (
                <div className="absolute left-[60px] top-1/2 -translate-y-1/2 bg-[#26262e] text-white text-xs px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                  Layouts
                </div>
              )}
            </div>

            {/* Trash item */}
            <div
              onClick={() => setCurrentView('trash')}
              className={cn(
                'group relative hover:bg-[#f4f5f9] cursor-pointer transition-colors',
                currentView === 'trash' && 'bg-[#f0f2ff]'
              )}
            >
              <div className={cn(
                'flex items-center gap-2.5',
                currentView === 'trash' ? 'text-[#4b57e6]' : 'text-[#5c5d6e]',
                sidebarCollapsed ? 'justify-center px-3 py-3' : 'px-3 py-3'
              )}>
                <Trash2 size={18} className="shrink-0" />
                {!sidebarCollapsed && <span className="text-sm font-medium">Trash</span>}
              </div>
              {sidebarCollapsed && (
                <div className="absolute left-[60px] top-1/2 -translate-y-1/2 bg-[#26262e] text-white text-xs px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
                  Trash
                </div>
              )}
            </div>
          </div>

          {/* Toggle button - bottom */}
          <div className="border-t border-[#e6e6ee]">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              title={sidebarCollapsed ? 'Mở sidebar' : 'Đóng sidebar'}
              className={cn(
                'w-full flex items-center justify-center py-3 hover:bg-[#f4f5f9] text-[#5c5d6e] cursor-pointer transition-colors',
                sidebarCollapsed ? 'px-3' : 'px-3'
              )}
            >
              <ChevronLeft size={18} className={cn('transition-transform', sidebarCollapsed && 'rotate-180')} />
            </button>
          </div>
        </div>

        {/* Main content */}
        <div
          ref={gridContainerRef}
          className="flex-1 overflow-auto p-[18px] relative select-none"
          onMouseDown={handleGridMouseDown}
        >
        {entries == null ? (
          <div className="py-10 text-center text-sm text-[#9a9bab]">Đang tải...</div>
        ) : filtered.length === 0 ? (
          currentView === 'trash' ? (
            <div className="rounded-[12px] border border-dashed border-[#d8d9e3] p-10 text-center">
              <Trash2 size={40} className="mx-auto mb-4 text-[#9a9bab]" />
              <div className="text-sm text-[#9a9bab]">Thùng rác trống</div>
            </div>
          ) : entries.length === 0 ? (
            <div className="rounded-[12px] border border-dashed border-[#d8d9e3] p-10 text-center text-sm text-[#9a9bab]">
              Chưa có layout nào — bấm "Tạo layout mới" để bắt đầu.
            </div>
          ) : (
            <div className="rounded-[12px] border border-dashed border-[#d8d9e3] p-10 text-center text-sm text-[#9a9bab]">
              Không tìm thấy layout khớp "{search}".
            </div>
          )
        ) : viewMode === 'grid' ? (
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
                  'group relative flex flex-col gap-1.5 rounded-[12px] border p-1.5 cursor-pointer transition-all',
                  isSelected(entry.id)
                    ? 'border-[#4b57e6] bg-[#f0f2ff] shadow-[0_4px_14px_rgba(75,87,230,0.15)]'
                    : 'border-[#e6e6ee] bg-white hover:border-[#4b57e6] hover:bg-[#f9faff] hover:shadow-[0_4px_14px_rgba(75,87,230,0.1)]'
                )}
                onClick={(e) => handleCardClick(entry.id, e)}
                onDoubleClick={() => onOpen(entry.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, layoutId: entry.id });
                }}
              >
                <div className="relative w-full overflow-hidden rounded-lg bg-black" style={{ aspectRatio: `${THUMB_SIZE.w}/${THUMB_SIZE.h}` }}>
                  <LayoutRenderer content={entry.content} screen={THUMB_SIZE} record={DEMO_RECORD} resolveAsset={resolveAsset} />
                  <div className="absolute inset-0 pointer-events-auto" />
                </div>
                <div className="flex items-center gap-1.5 px-1 min-w-0">
                  {entry.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />}
                  <span className="truncate text-xs font-semibold text-[#26262e]">{entry.name}</span>
                </div>
                {entry.description && (
                  <div className="px-1 text-[9px] text-[#9a9bab] line-clamp-1">{entry.description}</div>
                )}
                <div className="px-1 text-[9px] text-[#9a9bab]">
                  {entry.content.variants.map((v) => v.aspect.id).join(', ')}
                  {entry.category && <span> · {entry.category}</span>}
                </div>
                {(entry.createdAt || entry.updatedAt) && (
                  <div className="px-1 text-[8px] text-[#c5c7d0]">
                    {entry.updatedAt && <span>Modified: {new Date(entry.updatedAt).toLocaleDateString()}</span>}
                    {entry.createdAt && !entry.updatedAt && <span>Created: {new Date(entry.createdAt).toLocaleDateString()}</span>}
                  </div>
                )}
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
        ) : (
          <div className="w-full border border-[#e6e6ee] rounded-lg overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_120px] gap-4 px-4 py-3 bg-[#f9faff] border-b border-[#e6e6ee] font-semibold text-xs text-[#5c5d6e]">
              <div>Name</div>
              <div>Description</div>
              <div>Category</div>
              <div>Modified</div>
              <div className="text-center">Actions</div>
            </div>
            {/* Table rows */}
            <div>
              {filtered.map((entry) => (
                <div
                  key={entry.id}
                  data-card={entry.id}
                  className={cn(
                    'group grid grid-cols-[2fr_1.5fr_1fr_1fr_120px] gap-4 px-4 py-3 items-center cursor-pointer transition-all border-b',
                    isSelected(entry.id)
                      ? 'bg-[#f0f2ff] border-[#4b57e6] border-l-4'
                      : 'border-[#e6e6ee] hover:bg-[#f9faff]'
                  )}
                  onClick={(e) => handleCardClick(entry.id, e)}
                  onDoubleClick={() => onOpen(entry.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, layoutId: entry.id });
                  }}
                >
                  {/* Name */}
                  <div className="flex items-center gap-2 min-w-0">
                    {entry.color && <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />}
                    <span className="font-semibold text-sm text-[#26262e] truncate">{entry.name}</span>
                  </div>

                  {/* Description */}
                  <div className="text-xs text-[#9a9bab] truncate">
                    {entry.description || '—'}
                  </div>

                  {/* Category + Aspects */}
                  <div className="flex flex-wrap gap-1">
                    {entry.category && (
                      <span className="rounded-full bg-[#e6f2ff] px-[6px] py-px text-[8px] font-semibold text-[#4b57e6]">
                        {entry.category}
                      </span>
                    )}
                    {entry.content.variants.map((v) => (
                      <span key={v.aspect.id} className="rounded-full bg-[#f4f5f9] px-[6px] py-px text-[8px] font-semibold text-[#5c5d6e]">
                        {v.aspect.id}
                      </span>
                    ))}
                  </div>

                  {/* Modified Date */}
                  <div className="text-xs text-[#9a9bab]">
                    {entry.updatedAt ? new Date(entry.updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setInfoModalEntry(entry);
                      }}
                      title="Info"
                      className="flex items-center justify-center w-7 h-7 rounded-md text-[#5c5d6e] hover:bg-[#f4f5f9]"
                    >
                      <Info size={14} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setNameModal({ mode: 'duplicate', source: entry });
                      }}
                      title="Duplicate"
                      className="flex items-center justify-center w-7 h-7 rounded-md text-[#5c5d6e] hover:bg-[#f4f5f9]"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {dragStart && dragEnd && containerRect && (
          <div
            className="absolute border-2 border-[#4b57e6] bg-[#4b57e6]/5 pointer-events-none"
            style={{
              left: Math.min(dragStart.x, dragEnd.x) - containerRect.left,
              top: Math.min(dragStart.y, dragEnd.y) - containerRect.top,
              width: Math.abs(dragEnd.x - dragStart.x),
              height: Math.abs(dragEnd.y - dragStart.y),
            }}
          />
        )}

        {contextMenu && (
          <>
            <div
              className="absolute inset-0 cursor-default"
              onClick={() => setContextMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu(null);
              }}
            />
            <div
              className="absolute bg-white border border-[#e6e6ee] rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.15)] z-50 py-1 min-w-[160px]"
              style={{ left: contextMenu.x - (gridContainerRef.current?.getBoundingClientRect().left ?? 0), top: contextMenu.y - (gridContainerRef.current?.getBoundingClientRect().top ?? 0) - 5 }}
            >
              <button
                onClick={() => {
                  onOpen(contextMenu.layoutId);
                  setContextMenu(null);
                }}
                className="w-full px-3 py-2 text-left text-sm text-[#26262e] hover:bg-[#f4f5f9] cursor-pointer"
              >
                Open
              </button>
              <button
                onClick={() => {
                  setSelectedIds(new Set([contextMenu.layoutId]));
                  handleExport();
                  setContextMenu(null);
                }}
                className="w-full px-3 py-2 text-left text-sm text-[#26262e] hover:bg-[#f4f5f9] cursor-pointer"
              >
                Download
              </button>
              <button
                onClick={() => {
                  setInfoModalEntry(
                    filtered.find((e) => e.id === contextMenu.layoutId) || null
                  );
                  setContextMenu(null);
                }}
                className="w-full px-3 py-2 text-left text-sm text-[#26262e] hover:bg-[#f4f5f9] cursor-pointer"
              >
                Info
              </button>
              <button
                onClick={() => {
                  setNameModal({ mode: 'duplicate', source: filtered.find((e) => e.id === contextMenu.layoutId)! });
                  setContextMenu(null);
                }}
                className="w-full px-3 py-2 text-left text-sm text-[#26262e] hover:bg-[#f4f5f9] cursor-pointer"
              >
                Duplicate
              </button>
              <div className="h-px bg-[#e6e6ee]" />
              <button
                onClick={() => {
                  const entry = filtered.find((e) => e.id === contextMenu.layoutId);
                  if (entry) {
                    setTrashConfirm({ layoutId: entry.id, layoutName: entry.name });
                  }
                  setContextMenu(null);
                }}
                className="w-full px-3 py-2 text-left text-sm text-[#d04343] hover:bg-[#fee2e2] cursor-pointer"
              >
                Move to Trash
              </button>
            </div>
          </>
        )}
        </div>
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

      {trashConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setTrashConfirm(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[360px] rounded-[12px] bg-white p-[18px] shadow-[0_14px_34px_rgba(20,20,40,0.18)]"
          >
            <div className="mb-4 font-bold text-sm">Move to Trash?</div>
            <div className="mb-6 text-sm text-[#5c5d6e]">
              Bạn có chắc muốn chuyển "{trashConfirm.layoutName}" vào thùng rác không?
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setTrashConfirm(null)}
                className="flex-1 py-[8px] bg-[#f4f5f9] text-[#5c5d6e] border-none rounded-[8px] font-semibold text-xs cursor-pointer hover:bg-[#e6e6ee]"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmMoveToTrash}
                className="flex-1 py-[8px] bg-[#d04343] text-white border-none rounded-[8px] font-bold text-xs cursor-pointer hover:bg-[#c03333]"
              >
                Move to Trash
              </button>
            </div>
          </div>
        </div>
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
