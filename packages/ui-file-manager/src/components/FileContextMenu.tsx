import React, { useEffect } from 'react';
import type { ContextMenuItem, ContextMenuState } from '../types';

interface FileContextMenuProps {
  state: ContextMenuState | null;
  items: ContextMenuItem[];
  onClose: () => void;
}

export const FileContextMenu: React.FC<FileContextMenuProps> = ({
  state,
  items,
  onClose,
}) => {
  useEffect(() => {
    const handleClose = () => onClose();
    document.addEventListener('click', handleClose);
    document.addEventListener('contextmenu', handleClose);

    return () => {
      document.removeEventListener('click', handleClose);
      document.removeEventListener('contextmenu', handleClose);
    };
  }, [onClose]);

  if (!state) {
    return null;
  }

  const handleItemClick = (item: ContextMenuItem) => {
    item.onClick(state.itemId);
    onClose();
  };

  const visibleItems = items.filter(
    (item) => !item.visible || item.visible(state.itemId)
  );

  return (
    <div
      className="fixed bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50"
      style={{
        left: `${state.x}px`,
        top: `${state.y}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {visibleItems.map((item) => (
        <button
          key={item.id}
          onClick={() => handleItemClick(item)}
          className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
            item.isDanger ? 'text-red-600' : 'text-gray-700'
          }`}
        >
          <div className="flex items-center gap-2">
            {item.icon && <span className="w-4 h-4">{item.icon}</span>}
            {item.label}
          </div>
        </button>
      ))}
    </div>
  );
};
