import { useState } from 'react';
import type { LayoutVariant } from '@sky-app/slide-shared';
import type { OverwriteAllLockStrategy } from '@sky-app/layout-editor-core';
import { cn } from '../lib/cn.js';

export type CopyVariantMode = 'overwrite-all' | 'add-missing' | 'overwrite-existing';

const MODE_OPTIONS: { mode: CopyVariantMode; label: string; description: string }[] = [
  { mode: 'overwrite-all', label: 'Ghi đè toàn bộ', description: 'Thay hết nội dung hiện tại bằng bản copy từ nguồn (cần kéo lại vị trí cho phù hợp).' },
  { mode: 'add-missing', label: 'Chỉ thêm cái chưa có', description: 'Chỉ thêm phần tử nguồn có mà đích chưa có, giữ nguyên mọi thứ đang có.' },
  { mode: 'overwrite-existing', label: 'Cập nhật nội dung cái đã có', description: 'Chỉ cập nhật nội dung/thuộc tính cho phần tử đã khớp, giữ nguyên vị trí.' },
];

export interface CopyVariantPopoverProps {
  variants: LayoutVariant[];
  targetVariantId: string;
  onClose: () => void;
  onConfirm: (sourceVariantId: string, mode: CopyVariantMode, lockStrategy?: OverwriteAllLockStrategy) => void;
}

function formatAspectLabel(aspect: LayoutVariant['aspect']): string {
  return aspect.label ?? `${aspect.w}:${aspect.h}`;
}

export function CopyVariantPopover({ variants, targetVariantId, onClose, onConfirm }: CopyVariantPopoverProps) {
  const sources = variants.filter((v) => v.aspect.id !== targetVariantId);
  const target = variants.find((v) => v.aspect.id === targetVariantId);
  const targetHasLocked = target?.items.some((i) => i.syncLocked) ?? false;
  const targetIsEmpty = (target?.items.length ?? 0) === 0;

  const [sourceId, setSourceId] = useState<string>(sources[0]?.aspect.id ?? '');
  const [mode, setMode] = useState<CopyVariantMode>('add-missing');
  const [confirmStep, setConfirmStep] = useState<'idle' | 'confirm1' | 'confirm2'>('idle');

  function handleCopyClick() {
    if (!sourceId) return;
    if (mode === 'overwrite-all' && targetIsEmpty) {
      onConfirm(sourceId, 'overwrite-all', 'skip-locked');
      return;
    }
    if (mode !== 'overwrite-all') {
      onConfirm(sourceId, mode);
      return;
    }
    setConfirmStep('confirm1');
  }

  function handleConfirm1() {
    if (targetHasLocked) {
      setConfirmStep('confirm2');
    } else {
      onConfirm(sourceId, 'overwrite-all', 'skip-locked');
    }
  }

  function handleConfirm2(lockStrategy: OverwriteAllLockStrategy) {
    onConfirm(sourceId, 'overwrite-all', lockStrategy);
  }

  return (
    <>
      <div
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute -inset-[1000px] z-[9]"
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute top-full left-0 mt-[6px] w-[300px] bg-white border border-[#e6e6ee] rounded-[11px] shadow-[0_14px_34px_rgba(20,20,40,0.18)] z-[10] overflow-hidden"
      >
        {confirmStep === 'idle' && (
          <div className="p-3">
            <div className="font-bold text-xs text-[#5c5d6e] mb-2">Copy từ tỷ lệ khác</div>

            {sources.length === 0 ? (
              <div className="text-[11.5px] text-[#9a9bab]">Chưa có tỷ lệ nào khác để copy.</div>
            ) : (
              <>
                <label className="block text-[10.5px] text-[#9a9bab] mb-1 uppercase tracking-[.04em]">Nguồn</label>
                <select
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  className="w-full border border-[#e6e6ee] rounded-[7px] p-[6px_8px] text-xs mb-[10px]"
                >
                  {sources.map((v) => (
                    <option key={v.aspect.id} value={v.aspect.id}>
                      {formatAspectLabel(v.aspect)}
                    </option>
                  ))}
                </select>

                <label className="block text-[10.5px] text-[#9a9bab] mb-1 uppercase tracking-[.04em]">Cách copy</label>
                <div className="flex flex-col gap-[6px] mb-3">
                  {MODE_OPTIONS.map((opt) => (
                    <label
                      key={opt.mode}
                      className={cn(
                        'flex gap-2 items-start p-2 rounded-lg border cursor-pointer',
                        mode === opt.mode ? 'border-[#4b57e6] bg-[#4b57e6]/10' : 'border-[#e6e6ee] bg-transparent'
                      )}
                    >
                      <input type="radio" name="copy-mode" checked={mode === opt.mode} onChange={() => setMode(opt.mode)} className="mt-[2px]" />
                      <div>
                        <div className="font-semibold text-xs">{opt.label}</div>
                        <div className="text-[10.5px] text-[#9a9bab] mt-[2px]">{opt.description}</div>
                      </div>
                    </label>
                  ))}
                </div>

                <button
                  onClick={handleCopyClick}
                  className="w-full py-2 bg-[#4b57e6] text-white border-none rounded-lg font-bold text-xs cursor-pointer hover:bg-[#3b47d6]"
                >
                  Copy
                </button>
              </>
            )}
          </div>
        )}

        {confirmStep === 'confirm1' && (
          <div className="p-3.5">
            <div className="font-bold text-sm mb-2">Ghi đè toàn bộ tỷ lệ này?</div>
            <div className="text-[11.5px] text-[#5c5d6e] mb-[14px]">
              Toàn bộ nội dung hiện tại của tỷ lệ này sẽ bị thay thế bằng bản copy từ nguồn. Hành động này có thể hoàn tác bằng Ctrl/Cmd+Z.
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmStep('idle')} className="flex-1 py-2 bg-[#f4f5f9] text-[#5c5d6e] border-none rounded-lg font-semibold text-xs cursor-pointer">
                Huỷ
              </button>
              <button onClick={handleConfirm1} className="flex-1 py-2 bg-[#e05656] text-white border-none rounded-lg font-bold text-xs cursor-pointer">
                Ghi đè
              </button>
            </div>
          </div>
        )}

        {confirmStep === 'confirm2' && (
          <div className="p-3.5">
            <div className="font-bold text-sm mb-2">Có phần tử đang khoá</div>
            <div className="text-[11.5px] text-[#5c5d6e] mb-[14px]">Tỷ lệ này có phần tử đã khoá (không nhận đồng bộ tự động). Bạn muốn xử lý thế nào?</div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleConfirm2('skip-locked')}
                className="py-2 bg-[#f4f5f9] text-[#26262e] border-none rounded-lg font-semibold text-xs cursor-pointer"
              >
                Chỉ ghi đè phần tử CHƯA khoá
              </button>
              <button
                onClick={() => handleConfirm2('overwrite-locked')}
                className="py-2 bg-[#e05656] text-white border-none rounded-lg font-bold text-xs cursor-pointer"
              >
                Ghi đè cả phần tử đã khoá
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
