import React, { useState, useEffect } from 'react';
import type { SidebarItem } from '../types';

interface FileSidebarProps {
  items?: SidebarItem[];
  collapsedDefault?: boolean;
}

export const FileSidebar: React.FC<FileSidebarProps> = ({
  items = [],
  collapsedDefault = false,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(collapsedDefault);

  useEffect(() => {
    const saved = localStorage.getItem('file-manager-sidebar-collapsed');
    if (saved !== null) {
      setIsCollapsed(saved === 'true');
    }
  }, []);

  const handleToggle = () => {
    setIsCollapsed(!isCollapsed);
    localStorage.setItem('file-manager-sidebar-collapsed', String(!isCollapsed));
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className={`flex flex-col border-r border-gray-200 transition-all duration-200 ${
        isCollapsed ? 'w-16' : 'w-48'
      }`}
    >
      <button
        onClick={handleToggle}
        className="p-3 hover:bg-gray-100"
        title={isCollapsed ? 'Expand' : 'Collapse'}
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d={isCollapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'}
          />
        </svg>
      </button>

      <nav className="flex-1 overflow-y-auto">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={item.onClick}
            className={`w-full text-left px-3 py-2 hover:bg-gray-100 ${
              item.isActive ? 'bg-blue-50 border-l-4 border-blue-500' : ''
            } ${isCollapsed ? 'flex justify-center' : ''}`}
            title={isCollapsed ? item.label : undefined}
          >
            <div className="flex items-center gap-2">
              {item.icon && <span className="w-5 h-5">{item.icon}</span>}
              {!isCollapsed && (
                <span className="flex-1 text-sm font-medium truncate">
                  {item.label}
                </span>
              )}
              {!isCollapsed && item.badge && (
                <span className="ml-auto text-xs bg-gray-200 px-2 py-1 rounded-full">
                  {item.badge}
                </span>
              )}
            </div>
          </button>
        ))}
      </nav>
    </div>
  );
};
