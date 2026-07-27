import { useState } from 'react';
import type { LayoutVersion } from '@sky-app/slide-shared';
import { cn } from '../lib/cn.js';

export interface VersioningPanelProps {
  latestPublishedVersion: number | null;
  versions: LayoutVersion[];
  onPublish: (note?: string) => void;
  onRestore: (version: number) => void;
  isPublishing?: boolean;
}

export function VersioningPanel({ latestPublishedVersion, versions, onPublish, onRestore, isPublishing }: VersioningPanelProps) {
  const [open, setOpen] = useState(false);
  const [noteInput, setNoteInput] = useState('');

  function handlePublish() {
    onPublish(noteInput.trim() || undefined);
    setNoteInput('');
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="h-[34px] flex items-center gap-[7px] px-[15px] bg-[#4b57e6] text-white border-none rounded-[9px] font-bold text-[12.5px] cursor-pointer hover:bg-[#3b47d6]"
      >
        {latestPublishedVersion == null ? 'Chưa publish' : `v${latestPublishedVersion}`} ▾
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-[6px] w-[320px] bg-white border border-[#e6e6ee] rounded-[11px] shadow-[0_14px_34px_rgba(20,20,40,0.18)] z-[50]">
          <div className="p-[14px] border-b border-[#f0f0f5]">
            <div className="font-bold text-[13px] mb-2">Publish bản draft hiện tại</div>
            <input
              type="text"
              placeholder="Ghi chú thay đổi (tuỳ chọn)"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              className="w-full border border-[#e6e6ee] rounded-lg p-[7px_9px] text-xs mb-2"
            />
            <button
              onClick={handlePublish}
              disabled={isPublishing}
              className={cn(
                'w-full py-2 border-none rounded-lg font-bold text-xs',
                isPublishing ? 'bg-[#c9c9d3] text-white cursor-default' : 'bg-[#4b57e6] text-white cursor-pointer hover:bg-[#3b47d6]'
              )}
            >
              {isPublishing ? 'Đang publish…' : `Publish → v${(latestPublishedVersion ?? 0) + 1}`}
            </button>
          </div>

          <div className="p-[10px_14px] max-h-[260px] overflow-y-auto">
            <div className="font-semibold text-[10.5px] tracking-[.04em] uppercase text-[#9a9bab] mb-[6px]">
              Lịch sử version
            </div>
            {versions.length === 0 ? (
              <div className="text-[11.5px] text-[#c9c9d3]">Chưa publish lần nào.</div>
            ) : (
              [...versions].reverse().map((v) => (
                <div key={v.version} className="flex items-center gap-2 py-[7px] border-b border-[#f7f7fa]">
                  <span className="font-mono font-bold text-[11.5px] text-[#4b57e6]">v{v.version}</span>
                  <span className="flex-1 text-[11px] text-[#5c5d6e] overflow-hidden text-ellipsis whitespace-nowrap">
                    {v.note || new Date(v.publishedAt).toLocaleString('vi-VN')}
                  </span>
                  <button
                    onClick={() => onRestore(v.version)}
                    className="text-[10.5px] text-[#4b57e6] bg-none border-none cursor-pointer font-semibold hover:underline"
                  >
                    Khôi phục
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
