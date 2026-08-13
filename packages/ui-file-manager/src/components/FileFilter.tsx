import React from 'react';
import type { FilterConfig } from '../types';

interface FileFilterProps {
  value: string;
  onChange: (value: string) => void;
  config?: FilterConfig;
}

export const FileFilter: React.FC<FileFilterProps> = ({
  value,
  onChange,
  config,
}) => {
  return (
    <input
      type="text"
      placeholder={config?.placeholder || 'Search...'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  );
};
