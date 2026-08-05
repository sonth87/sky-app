import React, { useRef } from 'react';
import type { FileItem } from '../types';

interface FileGridProps {
  items: FileItem[];
  selectedIds: Set<string>;
  onItemClick: (id: string, e: React.MouseEvent) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  itemRenderer?: (item: FileItem, isSelected: boolean) => React.ReactNode;
  dragBoxStyle?: React.CSSProperties;
  containerRef: React.RefObject<HTMLDivElement>;
  cardRectsRef: React.MutableRefObject<Map<string, DOMRect>>;
  itemSize?: number;
}

const defaultItemRenderer = (item: FileItem, isSelected: boolean) => (
  <div
    className={`bg-white rounded-lg border ${
      isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
    } overflow-hidden`}
  >
    <div className="aspect-video bg-gray-200 flex items-center justify-center">
      <svg
        className="w-8 h-8 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
        />
      </svg>
    </div>
    <div className="p-3">
      <h3 className="font-semibold text-sm truncate">{item.name}</h3>
      {item.description && (
        <p className="text-xs text-gray-500 truncate">{item.description}</p>
      )}
      {item.updatedAt && (
        <p className="text-xs text-gray-400 mt-1">
          {new Date(item.updatedAt).toLocaleString()}
        </p>
      )}
    </div>
  </div>
);

export const FileGrid: React.FC<FileGridProps> = ({
  items,
  selectedIds,
  onItemClick,
  onContextMenu,
  itemRenderer = defaultItemRenderer,
  dragBoxStyle,
  containerRef,
  cardRectsRef,
  itemSize = 180,
}) => {
  const itemsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  const handleCardRef = (id: string, el: HTMLDivElement | null) => {
    if (el) {
      itemsRef.current.set(id, el);
      const rect = el.getBoundingClientRect();
      cardRectsRef.current.set(id, rect);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-auto bg-white user-select-none"
      style={{ userSelect: 'none' }}
    >
      <div className="p-6">
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${itemSize}px, 1fr))`,
          }}
        >
          {items.map((item) => (
            <div
              key={item.id}
              ref={(el) => handleCardRef(item.id, el)}
              onClick={(e) => onItemClick(item.id, e)}
              onContextMenu={(e) => {
                e.preventDefault();
                onContextMenu(item.id, e.clientX, e.clientY);
              }}
              className="cursor-pointer"
            >
              {itemRenderer(item, selectedIds.has(item.id))}
            </div>
          ))}
        </div>

        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <svg
              className="w-16 h-16 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p>No items found</p>
          </div>
        )}
      </div>

      {dragBoxStyle && <div style={dragBoxStyle} />}
    </div>
  );
};
