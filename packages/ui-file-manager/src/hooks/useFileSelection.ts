import { useState } from 'react';
import type { SelectionState } from '../types';

export function useFileSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [rangeAnchorId, setRangeAnchorId] = useState<string | null>(null);

  const selectId = (id: string) => {
    setSelectedIds(new Set([id]));
    setLastSelectedId(id);
    setRangeAnchorId(null);
  };

  const toggleId = (id: string) => {
    const newIds = new Set(selectedIds);
    if (newIds.has(id)) {
      newIds.delete(id);
    } else {
      newIds.add(id);
    }
    setSelectedIds(newIds);
    setLastSelectedId(id);
    setRangeAnchorId(null);
  };

  const selectRange = (id: string, items: Array<{ id: string }>) => {
    if (!lastSelectedId) {
      selectId(id);
      return;
    }

    const lastIndex = items.findIndex((item) => item.id === lastSelectedId);
    const currentIndex = items.findIndex((item) => item.id === id);

    if (lastIndex === -1 || currentIndex === -1) {
      selectId(id);
      return;
    }

    const start = Math.min(lastIndex, currentIndex);
    const end = Math.max(lastIndex, currentIndex);
    const newIds = new Set<string>();

    for (let i = start; i <= end; i++) {
      newIds.add(items[i].id);
    }

    setSelectedIds(newIds);
    setLastSelectedId(id);
    setRangeAnchorId(lastSelectedId);
  };

  const selectByDragBox = (ids: string[]) => {
    setSelectedIds(new Set(ids));
    if (ids.length > 0) {
      setLastSelectedId(ids[ids.length - 1]);
    }
    setRangeAnchorId(null);
  };

  const expandRange = (id: string, items: Array<{ id: string }>) => {
    if (!rangeAnchorId) {
      setRangeAnchorId(lastSelectedId);
    }

    const anchorIndex = items.findIndex((item) => item.id === rangeAnchorId || item.id === lastSelectedId);
    const currentIndex = items.findIndex((item) => item.id === id);

    if (anchorIndex === -1 || currentIndex === -1) {
      return;
    }

    const start = Math.min(anchorIndex, currentIndex);
    const end = Math.max(anchorIndex, currentIndex);
    const newIds = new Set<string>();

    for (let i = start; i <= end; i++) {
      newIds.add(items[i].id);
    }

    setSelectedIds(newIds);
    setLastSelectedId(id);
  };

  const clear = () => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
    setRangeAnchorId(null);
  };

  return {
    selectedIds,
    lastSelectedId,
    rangeAnchorId,
    selectId,
    toggleId,
    selectRange,
    selectByDragBox,
    expandRange,
    clear,
  };
}
