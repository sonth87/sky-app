import { useRef, useState, useEffect } from 'react';
import type { DragBoxState } from '../types';

export function useDragToSelect() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragBoxState>({
    start: null,
    end: null,
    containerRect: null,
  });

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left mouse button

    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const start = {
      x: e.clientX - containerRect.left,
      y: e.clientY - containerRect.top,
    };

    setDragState({
      start,
      end: start,
      containerRect,
    });

    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState.start) return;

      const container = containerRef.current;
      if (!container) return;

      const containerRect = dragState.containerRect;
      if (!containerRect) return;

      const end = {
        x: e.clientX - containerRect.left,
        y: e.clientY - containerRect.top,
      };

      setDragState((prev) => ({
        ...prev,
        end,
      }));
    };

    const handleMouseUp = () => {
      setDragState({
        start: null,
        end: null,
        containerRect: null,
      });
    };

    if (dragState.start) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragState.start, dragState.containerRect]);

  const isOverlapping = (rect: DOMRect): boolean => {
    if (!dragState.start || !dragState.end || !dragState.containerRect) {
      return false;
    }

    const dragBox = {
      left: Math.min(dragState.start.x, dragState.end.x),
      top: Math.min(dragState.start.y, dragState.end.y),
      right: Math.max(dragState.start.x, dragState.end.x),
      bottom: Math.max(dragState.start.y, dragState.end.y),
    };

    const itemBox = {
      left: rect.left - dragState.containerRect.left,
      top: rect.top - dragState.containerRect.top,
      right: rect.right - dragState.containerRect.left,
      bottom: rect.bottom - dragState.containerRect.top,
    };

    return !(
      dragBox.right < itemBox.left ||
      dragBox.left > itemBox.right ||
      dragBox.bottom < itemBox.top ||
      dragBox.top > itemBox.bottom
    );
  };

  const getDragBoxStyle = () => {
    if (!dragState.start || !dragState.end) return {};

    const left = Math.min(dragState.start.x, dragState.end.x);
    const top = Math.min(dragState.start.y, dragState.end.y);
    const width = Math.abs(dragState.end.x - dragState.start.x);
    const height = Math.abs(dragState.end.y - dragState.start.y);

    return {
      position: 'absolute' as const,
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      border: '1px solid rgb(59, 130, 246)',
      pointerEvents: 'none' as const,
      zIndex: 10,
    };
  };

  return {
    containerRef,
    dragState,
    handleMouseDown,
    isOverlapping,
    getDragBoxStyle,
  };
}
