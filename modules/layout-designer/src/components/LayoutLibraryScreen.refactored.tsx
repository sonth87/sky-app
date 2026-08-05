// LayoutLibraryScreen — Refactored using @sky-app/ui-file-manager (Phase 7)
// This version demonstrates how the reusable file manager library reduces boilerplate
// from ~1060 lines to ~400 lines while maintaining all functionality.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Info, Plus, Download, Upload } from 'lucide-react';
import type { LayoutPort } from '@sky-app/service-contracts';
import { LayoutRenderer, demoCanonicalSubject, type LayoutContent } from '@sky-app/slide-shared';
import { FileLibraryLayout, type FileItem } from '@sky-app/ui-file-manager';
import { LayoutInfoModal } from './LayoutInfoModal.js';

export interface LayoutLibraryScreenProps {
  layoutPort: LayoutPort;
  resolveAssetUrl?: (path: string) => Promise<string>;
  onOpen: (layoutId: string) => void;
}

interface LayoutEntry extends FileItem {
  content: LayoutContent;
  category?: string;
}

const THUMB_SIZE = { w: 220, h: 124 };
const DEMO_RECORD = demoCanonicalSubject();

export function LayoutLibraryScreen({ layoutPort, resolveAssetUrl, onOpen }: LayoutLibraryScreenProps) {
  const [entries, setEntries] = useState<LayoutEntry[] | null>(null);
  const [assetUrlCache, setAssetUrlCache] = useState<Record<string, string>>({});
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // UI state
  const [nameModal, setNameModal] = useState<
    | { mode: 'create' }
    | { mode: 'duplicate'; source: LayoutEntry }
    | null
  >(null);
  const [infoModalEntry, setInfoModalEntry] = useState<LayoutEntry | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [currentView, setCurrentView] = useState<'layouts' | 'trash'>('layouts');
  const [trashConfirm, setTrashConfirm] = useState<{ id: string; name: string } | null>(null);
  const [trashedIds, setTrashedIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    const saved = localStorage.getItem('layout-library-trashed-ids');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  // Auto-dismiss messages
  useEffect(() => {
    if (!message) return;
    const timeout = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timeout);
  }, [message]);

  // Persist trashed IDs
  useEffect(() => {
    localStorage.setItem('layout-library-trashed-ids', JSON.stringify([...trashedIds]));
  }, [trashedIds]);

  // Load layouts from layoutPort
  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    void (async () => {
      const summaries = await layoutPort.listDocuments();
      const docs = await Promise.all(summaries.map((s) => layoutPort.getDocument(s.id)));
      const built = docs
        .filter((d): d is NonNullable<typeof d> => d != null)
        .map((d): LayoutEntry => ({
          id: d.id,
          name: d.name,
          description: d.description,
          color: d.color,
          category: d.category,
          tags: d.tags ?? [],
          content: d.currentDraft,
          createdAt: (d as any).createdAt || (d as any).created_at,
          updatedAt: (d as any).updatedAt || (d as any).updated_at,
        }));
      if (!cancelled) setEntries(built);
    })();
    return () => {
      cancelled = true;
    };
  }, [layoutPort, reloadKey]);

  // Preload asset URLs for thumbnails
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

  // Filter: current view (layouts vs trash)
  const filteredByView = useMemo(() => {
    if (!entries) return [];
    return currentView === 'trash'
      ? entries.filter((e) => trashedIds.has(e.id))
      : entries.filter((e) => !trashedIds.has(e.id));
  }, [entries, currentView, trashedIds]);

  // Handlers
  const handleCreate = async (name: string) => {
    const id = `layout_${crypto.randomUUID()}`;
    const emptyContent: LayoutContent = {
      variants: [{ aspect: { id: '16:9', w: 16, h: 9 }, refW: 1920, refH: 1080, items: [] }],
    };
    await layoutPort.createDocument(id, name, emptyContent);
    setNameModal(null);
    onOpen(id);
  };

  const handleDuplicate = async (source: LayoutEntry, name: string) => {
    const id = `layout_${crypto.randomUUID()}`;
    const clonedContent = structuredClone(source.content);
    await layoutPort.createDocument(id, name, clonedContent, source.description);
    setNameModal(null);
    setReloadKey((k) => k + 1);
  };

  const handleSaveInfo = async (id: string, patch: { name: string; description?: string; category?: string; tags: string[] }) => {
    await layoutPort.updateDocumentMeta(id, patch);
    setInfoModalEntry(null);
    setReloadKey((k) => k + 1);
  };

  const handleExport = async () => {
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
  };

  const handleImport = async () => {
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
  };

  const handleContextMenuAction = async (itemId: string, action: string) => {
    const entry = filteredByView.find((e) => e.id === itemId);
    if (!entry) return;

    switch (action) {
      case 'open':
        onOpen(itemId);
        break;
      case 'info':
        setInfoModalEntry(entry);
        break;
      case 'duplicate':
        setNameModal({ mode: 'duplicate', source: entry });
        break;
      case 'download':
        setSelectedIds(new Set([itemId]));
        await handleExport();
        break;
      case 'trash':
        setTrashConfirm({ id: itemId, name: entry.name });
        break;
    }
  };

  const handleConfirmMoveToTrash = () => {
    if (!trashConfirm) return;
    try {
      setTrashedIds((prev) => new Set([...prev, trashConfirm.id]));
      setMessage({ type: 'success', text: `Đã chuyển "${trashConfirm.name}" vào thùng rác.` });
      setTrashConfirm(null);
      setSelectedIds(new Set());
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Lỗi chuyển vào thùng rác.' });
    }
  };

  if (entries === null) {
    return <div className="flex items-center justify-center h-full text-gray-500">Đang tải...</div>;
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Message banner */}
      {message && (
        <div
          className={`px-4 py-3 text-sm flex items-center justify-between ${
            message.type === 'error' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="text-xs opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* File manager layout */}
      <FileLibraryLayout
        items={filteredByView}
        config={{
          // Sidebar: layouts and trash views
          sidebarItems: [
            {
              id: 'layouts',
              label: 'Layouts',
              isActive: currentView === 'layouts',
              onClick: () => setCurrentView('layouts'),
            },
            {
              id: 'trash',
              label: 'Trash',
              badge: trashedIds.size,
              isActive: currentView === 'trash',
              onClick: () => setCurrentView('trash'),
            },
          ],

          // Context menu
          contextMenuItems: [
            { id: 'open', label: 'Open', onClick: (id) => handleContextMenuAction(id, 'open') },
            { id: 'download', label: 'Download', onClick: (id) => handleContextMenuAction(id, 'download') },
            { id: 'info', label: 'Info', onClick: (id) => handleContextMenuAction(id, 'info') },
            { id: 'duplicate', label: 'Duplicate', onClick: (id) => handleContextMenuAction(id, 'duplicate') },
            currentView !== 'trash' && {
              id: 'trash',
              label: 'Move to Trash',
              isDanger: true,
              onClick: (id) => handleContextMenuAction(id, 'trash'),
            },
          ].filter(Boolean),

          // Header buttons
          showSearch: true,
          showViewToggle: true,
          headerButtons: [
            {
              id: 'export',
              label: `Xuất${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`,
              icon: <Download size={14} />,
              onClick: () => handleExport(),
              disabled: exportLoading || selectedIds.size === 0,
            },
            {
              id: 'import',
              label: importLoading ? 'Đang nhập...' : 'Nhập',
              icon: <Upload size={14} />,
              onClick: () => handleImport(),
              disabled: importLoading,
            },
            {
              id: 'create',
              label: 'Tạo layout mới',
              icon: <Plus size={14} />,
              onClick: () => setNameModal({ mode: 'create' }),
            },
          ],

          // Custom item rendering with layout thumbnail
          itemRenderer: (item: LayoutEntry, isSelected: boolean) => {
            const entry = item as LayoutEntry;
            return (
              <div
                className={`flex flex-col gap-1.5 rounded-lg border p-1.5 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50'
                }`}
              >
                <div className="relative w-full overflow-hidden rounded-md bg-black" style={{ aspectRatio: `${THUMB_SIZE.w}/${THUMB_SIZE.h}` }}>
                  <LayoutRenderer
                    content={entry.content}
                    screen={THUMB_SIZE}
                    record={DEMO_RECORD}
                    resolveAsset={resolveAsset}
                  />
                </div>
                <div className="flex items-center gap-1.5 px-1">
                  {entry.color && (
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                  )}
                  <span className="truncate text-xs font-semibold">{entry.name}</span>
                </div>
                {entry.description && (
                  <div className="px-1 text-[9px] text-gray-600 line-clamp-1">{entry.description}</div>
                )}
                <div className="px-1 text-[9px] text-gray-500">
                  {entry.content.variants.map((v) => v.aspect.id).join(', ')}
                  {entry.category && <span> · {entry.category}</span>}
                </div>
                {entry.updatedAt && (
                  <div className="px-1 text-[8px] text-gray-400">
                    Modified: {new Date(entry.updatedAt).toLocaleString()}
                  </div>
                )}
              </div>
            );
          },

          // Callbacks
          onItemClick: (id) => {
            // Single click: select
          },
          onItemDoubleClick: (id) => {
            onOpen(id);
          },
          onSelectionChange: setSelectedIds,

          // Search config
          filterConfig: {
            placeholder: 'Search by name, category, or tags...',
            debounceMs: 300,
          },
        }}
      />

      {/* Modals */}
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
          initial={{
            name: infoModalEntry.name,
            description: infoModalEntry.description,
            category: infoModalEntry.category,
            tags: infoModalEntry.tags,
          }}
          onClose={() => setInfoModalEntry(null)}
          onSave={(patch) => handleSaveInfo(infoModalEntry.id, patch)}
        />
      )}

      {trashConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setTrashConfirm(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[360px] rounded-lg bg-white p-6 shadow-lg"
          >
            <div className="mb-4 font-bold">Move to Trash?</div>
            <div className="mb-6 text-gray-700">
              Bạn có chắc muốn chuyển "{trashConfirm.name}" vào thùng rác không?
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setTrashConfirm(null)}
                className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmMoveToTrash}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700"
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
        className="w-[360px] rounded-lg bg-white p-6 shadow-lg"
      >
        <div className="mb-3 font-bold">{title}</div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && trimmed) onConfirm(trimmed);
          }}
          placeholder="Tên layout"
          className="w-full rounded-lg border border-gray-300 p-2 text-sm mb-4"
        />
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200"
          >
            Huỷ
          </button>
          <button
            onClick={() => trimmed && onConfirm(trimmed)}
            disabled={!trimmed}
            className={`flex-1 py-2 rounded-lg font-bold ${
              trimmed ? 'bg-blue-600 text-white cursor-pointer hover:bg-blue-700' : 'bg-gray-200 text-gray-400'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
