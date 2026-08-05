import React from 'react';
import { FileFilter } from './FileFilter';
import { FileSizeControl } from './FileSizeControl';
import type { FileLibraryConfig, ViewMode } from '../types';

interface FileHeaderProps {
  query: string;
  onQueryChange: (value: string) => void;
  viewMode: string;
  onViewChange: (mode: string) => void;
  itemSize: number;
  onSizeChange: (size: number) => void;
  config?: FileLibraryConfig;
  supportedViews: ViewMode[];
}

export const FileHeader: React.FC<FileHeaderProps> = ({
  query,
  onQueryChange,
  viewMode,
  onViewChange,
  itemSize,
  onSizeChange,
  config,
  supportedViews,
}) => {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-gray-200">
      <div className="flex-1">
        {config?.showSearch !== false && (
          <FileFilter
            value={query}
            onChange={onQueryChange}
            config={config?.filterConfig}
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        {config?.headerButtons?.map((button) => (
          <button
            key={button.id}
            onClick={button.onClick}
            disabled={button.disabled}
            className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2"
          >
            {button.icon && <span className="w-4 h-4">{button.icon}</span>}
            {button.label}
          </button>
        ))}

        {config?.showSizeControl !== false && (
          <FileSizeControl
            size={itemSize}
            onSizeChange={onSizeChange}
            config={config?.sizeConfig}
          />
        )}

        {config?.showViewToggle !== false && supportedViews.length > 1 && (
          <div className="flex gap-1 border border-gray-300 rounded-md p-1">
            {supportedViews.map((view) => (
              <button
                key={view.id}
                onClick={() => onViewChange(view.id)}
                className={`px-3 py-1 rounded text-sm ${
                  viewMode === view.id
                    ? 'bg-gray-200 font-semibold'
                    : 'hover:bg-gray-100'
                }`}
                title={view.label}
              >
                {view.icon ? view.icon : view.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
