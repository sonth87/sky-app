import React, { useRef, useState, useEffect } from 'react';
import type { FileItem, FileLibraryConfig, ContextMenuState, ViewMode } from '../types';
import { useFileSelection } from '../hooks/useFileSelection';
import { useFileKeyboard } from '../hooks/useFileKeyboard';
import { useDragToSelect } from '../hooks/useDragToSelect';
import { useFileSearch } from '../hooks/useFileSearch';
import { FileHeader } from './FileHeader';
import { FileSidebar } from './FileSidebar';
import { FileContextMenu } from './FileContextMenu';
import { FileGrid } from './FileGrid';
import { FileList } from './FileList';

interface FileLibraryLayoutProps {
  items: FileItem[];
  config?: FileLibraryConfig;
}

const defaultViews: ViewMode[] = [
  { id: 'grid', label: 'Grid' },
  { id: 'list', label: 'List' },
];

export const FileLibraryLayout: React.FC<FileLibraryLayoutProps> = ({
  items,
  config = {},
}) => {
  const cardRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  // State management
  const selection = useFileSelection();
  const dragBox = useDragToSelect();
  const search = useFileSearch(items, config.filterConfig);

  // Helper to get localStorage key with app namespace
  const getStorageKey = (key: string) => {
    if (config.appId) {
      return `file-manager-${config.appId}-${key}`;
    }
    return `file-manager-${key}`;
  };

  const [viewMode, setViewMode] = useState(
    config.defaultView || 'grid'
  );

  const [itemSize, setItemSize] = useState<number>(() => {
    if (typeof window === 'undefined') return config.sizeConfig?.defaultSize ?? 200;
    const saved = localStorage.getItem(getStorageKey('item-size'));
    return saved ? parseInt(saved, 10) : (config.sizeConfig?.defaultSize ?? 200);
  });

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Persist view mode
  useEffect(() => {
    const saved = localStorage.getItem(getStorageKey('view-mode'));
    if (saved) {
      setViewMode(saved);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(getStorageKey('view-mode'), viewMode);
  }, [viewMode, config.appId]);

  // Persist item size
  useEffect(() => {
    localStorage.setItem(getStorageKey('item-size'), String(itemSize));
    config.onSizeChange?.(itemSize);
  }, [itemSize, config.appId]);

  // Keyboard navigation
  useFileKeyboard({
    items: search.filtered,
    selectedIds: selection.selectedIds,
    lastSelectedId: selection.lastSelectedId,
    rangeAnchorId: selection.rangeAnchorId,
    viewMode: viewMode as 'grid' | 'list',
    cardRectsRef,

    onSelectId: selection.selectId,
    onToggleId: selection.toggleId,
    onSelectRange: (id: string) =>
      selection.selectRange(id, search.filtered),
    onExpandRange: (id: string) =>
      selection.expandRange(id, search.filtered),
    onClear: selection.clear,

    onOpen: config.onItemClick,
    onDelete: () => {
      if (config.onDelete) {
        config.onDelete(Array.from(selection.selectedIds));
      }
    },
  });

  // Drag-to-select overlap detection
  const overlappingIds: string[] = [];
  if (dragBox.dragState.start && dragBox.dragState.end) {
    search.filtered.forEach((item) => {
      const rect = cardRectsRef.current.get(item.id);
      if (rect && dragBox.isOverlapping(rect)) {
        overlappingIds.push(item.id);
      }
    });
  }

  // Handle mouse down for drag-to-select
  const handleContainerMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, input, a')) return;

    dragBox.handleMouseDown(e);
    selection.clear();
  };

  // Handle mouse up for drag-to-select
  useEffect(() => {
    if (dragBox.dragState.start && dragBox.dragState.end && overlappingIds.length > 0) {
      selection.selectByDragBox(overlappingIds);
    }
  }, [overlappingIds.length]);

  const handleItemClick = (id: string, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      selection.toggleId(id);
    } else if (e.shiftKey) {
      selection.selectRange(id, search.filtered);
    } else {
      selection.selectId(id);
    }

    if (e.detail === 2 && config.onItemDoubleClick) {
      config.onItemDoubleClick(id);
    }

    if (e.detail === 1 && config.onItemClick) {
      config.onItemClick(id);
    }
  };

  const handleContextMenu = (id: string, x: number, y: number) => {
    // Select the item if not already selected
    if (!selection.selectedIds.has(id)) {
      selection.selectId(id);
    }

    setContextMenu({ x, y, itemId: id });
  };

  const handleViewChange = (mode: string) => {
    setViewMode(mode);
    if (config.onViewChange) {
      config.onViewChange(mode);
    }
  };

  const supportedViews = config.supportedViews || defaultViews;

  return (
    <div className="flex h-full bg-white">
      {/* Sidebar */}
      <FileSidebar
        items={config.sidebarItems}
        collapsedDefault={config.sidebarCollapsedDefault}
      />

      {/* Main content */}
      <div className="flex flex-col flex-1">
        {/* Header */}
        <FileHeader
          query={search.query}
          onQueryChange={search.setQuery}
          viewMode={viewMode}
          onViewChange={handleViewChange}
          itemSize={itemSize}
          onSizeChange={setItemSize}
          config={config}
          supportedViews={supportedViews}
        />

        {/* View area */}
        <div
          ref={dragBox.containerRef}
          className="flex-1 flex overflow-hidden"
          onMouseDown={handleContainerMouseDown}
        >
          {viewMode === 'grid' ? (
            <FileGrid
              items={search.filtered}
              selectedIds={selection.selectedIds}
              onItemClick={handleItemClick}
              onContextMenu={handleContextMenu}
              itemRenderer={config.itemRenderer}
              dragBoxStyle={dragBox.getDragBoxStyle()}
              containerRef={containerRef}
              cardRectsRef={cardRectsRef}
              itemSize={itemSize}
            />
          ) : (
            <FileList
              items={search.filtered}
              selectedIds={selection.selectedIds}
              onItemClick={handleItemClick}
              onContextMenu={handleContextMenu}
              containerRef={containerRef}
              cardRectsRef={cardRectsRef}
              itemSize={itemSize}
            />
          )}
        </div>
      </div>

      {/* Context menu */}
      <FileContextMenu
        state={contextMenu}
        items={config.contextMenuItems || []}
        onClose={() => setContextMenu(null)}
      />
    </div>
  );
};
