import React, { useRef } from 'react';
import type { FileItem } from '../types';

interface FileListProps {
  items: FileItem[];
  selectedIds: Set<string>;
  onItemClick: (id: string, e: React.MouseEvent) => void;
  onContextMenu: (id: string, x: number, y: number) => void;
  containerRef: React.RefObject<HTMLDivElement>;
  cardRectsRef: React.MutableRefObject<Map<string, DOMRect>>;
  itemSize?: number;
}

export const FileList: React.FC<FileListProps> = ({
  items,
  selectedIds,
  onItemClick,
  onContextMenu,
  containerRef,
  cardRectsRef,
  itemSize = 40,
}) => {
  const itemsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  const handleRowRef = (id: string, el: HTMLDivElement | null) => {
    if (el) {
      itemsRef.current.set(id, el);
      const rect = el.getBoundingClientRect();
      cardRectsRef.current.set(id, rect);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-auto bg-white"
    >
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-4 py-3 font-semibold text-gray-700">
              Name
            </th>
            <th className="text-left px-4 py-3 font-semibold text-gray-700">
              Description
            </th>
            <th className="text-left px-4 py-3 font-semibold text-gray-700">
              Tags
            </th>
            <th className="text-left px-4 py-3 font-semibold text-gray-700">
              Modified
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              ref={(el) => handleRowRef(item.id, el)}
              onClick={(e) => onItemClick(item.id, e)}
              onContextMenu={(e) => {
                e.preventDefault();
                onContextMenu(item.id, e.clientX, e.clientY);
              }}
              className={`cursor-pointer border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                selectedIds.has(item.id)
                  ? 'bg-blue-50 border-l-4 border-blue-500'
                  : ''
              } group`}
              style={{ height: `${itemSize}px` }}
            >
              <td className="px-4 py-3">
                <span
                  className={`inline-block w-2.5 h-2.5 rounded-full mr-2 ${
                    item.color || 'bg-gray-300'
                  }`}
                />
                <span className="font-medium truncate">{item.name}</span>
              </td>
              <td className="px-4 py-3 text-gray-600 truncate max-w-xs">
                {item.description || '—'}
              </td>
              <td className="px-4 py-3">
                {item.tags && item.tags.length > 0 ? (
                  <div className="flex gap-1 flex-wrap">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-block text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                {item.updatedAt
                  ? new Date(item.updatedAt).toLocaleString('en-US', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

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
  );
};
