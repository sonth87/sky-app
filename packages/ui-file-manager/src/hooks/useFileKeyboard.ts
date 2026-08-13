import { useEffect, useRef } from 'react';
import type { FileItem } from '../types';

export interface UseFileKeyboardOptions {
  items: FileItem[];
  selectedIds: Set<string>;
  lastSelectedId: string | null;
  rangeAnchorId: string | null;
  viewMode: 'grid' | 'list';
  cardRectsRef: React.MutableRefObject<Map<string, DOMRect>>;

  onSelectId: (id: string) => void;
  onToggleId: (id: string) => void;
  onSelectRange: (id: string) => void;
  onExpandRange: (id: string) => void;
  onClear: () => void;

  onOpen?: (id: string) => void;
  onDelete?: (ids: string[]) => void;
}

export function useFileKeyboard(options: UseFileKeyboardOptions) {
  const isShiftPressedRef = useRef(false);

  useEffect(() => {
    const {
      items,
      selectedIds,
      lastSelectedId,
      rangeAnchorId,
      viewMode,
      cardRectsRef,
      onSelectId,
      onToggleId,
      onSelectRange,
      onExpandRange,
      onClear,
      onOpen,
      onDelete,
    } = options;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isShift = e.shiftKey;
      const isCtrl = e.ctrlKey || e.metaKey;

      if (e.key === 'Shift') {
        isShiftPressedRef.current = true;
        return;
      }

      if (e.key === 'Escape') {
        if (selectedIds.size > 0) {
          onClear();
          e.preventDefault();
        }
        return;
      }

      if (e.key === 'Enter' && lastSelectedId && onOpen) {
        onOpen(lastSelectedId);
        e.preventDefault();
        return;
      }

      if (e.key === 'Delete' && selectedIds.size > 0 && onDelete) {
        onDelete(Array.from(selectedIds));
        e.preventDefault();
        return;
      }

      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        return;
      }

      const currentId = lastSelectedId;
      if (!currentId) {
        if (items.length > 0) {
          onSelectId(items[0].id);
        }
        e.preventDefault();
        return;
      }

      const currentIndex = items.findIndex((item) => item.id === currentId);
      if (currentIndex === -1) {
        e.preventDefault();
        return;
      }

      let nextId: string | null = null;

      if (viewMode === 'grid') {
        // 4-way navigation in grid
        const currentRect = cardRectsRef.current.get(currentId);
        if (!currentRect) {
          e.preventDefault();
          return;
        }

        const currentCenterX = (currentRect.left + currentRect.right) / 2;
        const currentCenterY = (currentRect.top + currentRect.bottom) / 2;

        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          // Find neighbors in vertical direction
          const direction = e.key === 'ArrowDown' ? 1 : -1;
          let bestMatch: { id: string; distance: number } | null = null;

          for (const item of items) {
            const rect = cardRectsRef.current.get(item.id);
            if (!rect || item.id === currentId) continue;

            const centerX = (rect.left + rect.right) / 2;
            const centerY = (rect.top + rect.bottom) / 2;

            // Check if in same row/area
            const isAbove = direction < 0 ? centerY < currentCenterY - 10 : centerY > currentCenterY + 10;
            if (!isAbove) continue;

            // Prefer items with similar X position
            const xDistance = Math.abs(centerX - currentCenterX);
            const yDistance = direction < 0
              ? currentCenterY - centerY
              : centerY - currentCenterY;

            if (yDistance <= 0) continue;

            const totalDistance = xDistance + yDistance;
            if (!bestMatch || totalDistance < bestMatch.distance) {
              bestMatch = { id: item.id, distance: totalDistance };
            }
          }

          nextId = bestMatch?.id || null;
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          // Find neighbors in horizontal direction
          const direction = e.key === 'ArrowRight' ? 1 : -1;
          let bestMatch: { id: string; distance: number } | null = null;

          for (const item of items) {
            const rect = cardRectsRef.current.get(item.id);
            if (!rect || item.id === currentId) continue;

            const centerX = (rect.left + rect.right) / 2;
            const centerY = (rect.top + rect.bottom) / 2;

            // Check if in same column/area
            const isInDirection = direction > 0 ? centerX > currentCenterX + 10 : centerX < currentCenterX - 10;
            if (!isInDirection) continue;

            const xDistance = direction > 0
              ? centerX - currentCenterX
              : currentCenterX - centerX;
            const yDistance = Math.abs(centerY - currentCenterY);

            if (xDistance <= 0) continue;

            const totalDistance = xDistance + yDistance;
            if (!bestMatch || totalDistance < bestMatch.distance) {
              bestMatch = { id: item.id, distance: totalDistance };
            }
          }

          nextId = bestMatch?.id || null;
        }

        // Fallback: sequential navigation if no neighbor found
        if (!nextId) {
          if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            nextId = items[currentIndex + 1]?.id || null;
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            nextId = items[currentIndex - 1]?.id || null;
          }
        }
      } else {
        // Vertical-only navigation in list
        if (e.key === 'ArrowDown') {
          nextId = items[currentIndex + 1]?.id || null;
        } else if (e.key === 'ArrowUp') {
          nextId = items[currentIndex - 1]?.id || null;
        }
      }

      if (!nextId) {
        e.preventDefault();
        return;
      }

      if (isShift) {
        if (isShiftPressedRef.current) {
          // Continue range expansion
          onExpandRange(nextId);
        } else {
          // Start new range
          onSelectRange(nextId);
        }
      } else {
        // Single select
        onSelectId(nextId);
        isShiftPressedRef.current = false;
      }

      e.preventDefault();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        isShiftPressedRef.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [options]);

  return {
    isShiftPressed: isShiftPressedRef.current,
  };
}
