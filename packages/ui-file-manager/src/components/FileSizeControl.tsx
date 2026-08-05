import React, { useState, useRef, useEffect } from 'react';
import type { SizeConfig } from '../types';

interface FileSizeControlProps {
  size: number;
  onSizeChange: (size: number) => void;
  config?: SizeConfig;
}

const DEFAULT_SIZE_CONFIG: Required<SizeConfig> = {
  minSize: 120,
  maxSize: 320,
  defaultSize: 200,
  step: 20,
};

export const FileSizeControl: React.FC<FileSizeControlProps> = ({
  size,
  onSizeChange,
  config,
}) => {
  const sizeConfig = { ...DEFAULT_SIZE_CONFIG, ...config };
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isOpen]);

  const handleSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(e.target.value, 10);
    onSizeChange(newSize);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-gray-100 text-gray-600 text-sm font-semibold transition-colors"
        title="Adjust item size"
      >
        <span className="text-xs">aA</span>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-lg p-4 z-50 w-48">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-700">
              Size
            </label>
            <span className="text-sm font-bold text-blue-600">
              {size}px
            </span>
          </div>

          <input
            type="range"
            min={sizeConfig.minSize}
            max={sizeConfig.maxSize}
            step={sizeConfig.step}
            value={size}
            onChange={handleSizeChange}
            className="w-full"
          />

          <div className="flex justify-between text-xs text-gray-500 mt-2">
            <span>{sizeConfig.minSize}px</span>
            <span>{sizeConfig.maxSize}px</span>
          </div>

          <button
            onClick={() => {
              onSizeChange(sizeConfig.defaultSize);
              setIsOpen(false);
            }}
            className="w-full mt-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
};
