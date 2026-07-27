import { useState } from 'react';
import { Copy, Plus, RefreshCw, X } from 'lucide-react';
import type { AspectRatio, LayoutVariant } from '@sky-app/slide-shared';
import type { OverwriteAllLockStrategy } from '@sky-app/layout-editor-core';
import { AddVariantModal } from './AddVariantModal.js';
import { CopyVariantPopover, type CopyVariantMode } from './CopyVariantPopover.js';
import { cn } from '../lib/cn.js';

export interface VariantTabsProps {
  variants: LayoutVariant[];
  activeVariantId: string;
  onSelect: (variantId: string) => void;
  onAdd: (aspect: AspectRatio) => void;
  onRemove?: (variantId: string) => void;
  onCopyFromVariant?: (sourceVariantId: string, targetVariantId: string, mode: CopyVariantMode, lockStrategy?: OverwriteAllLockStrategy) => void;
  onChangeAspect?: (variantId: string, newAspect: AspectRatio) => void;
}

function formatAspectLabel(aspect: AspectRatio): string {
  return aspect.label ?? `${aspect.w}:${aspect.h}`;
}

type SubPopover = 'copy' | 'change-aspect' | 'remove' | null;

export function VariantTabs({ variants, activeVariantId, onSelect, onAdd, onRemove, onCopyFromVariant, onChangeAspect }: VariantTabsProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [actionVariantId, setActionVariantId] = useState<string | null>(null);
  const [subPopover, setSubPopover] = useState<SubPopover>(null);
  const [hoveredVariantId, setHoveredVariantId] = useState<string | null>(null);
  const usedAspectIds = new Set(variants.map((v) => v.aspect.id));

  const closeAll = () => {
    setActionVariantId(null);
    setSubPopover(null);
  };

  return (
    <div className="absolute top-4 left-4 z-[5] flex items-center gap-0.5 bg-white border border-[#e6e6ee] rounded-[10px] p-1 shadow-[0_4px_14px_rgba(0,0,0,0.08)]">
      {variants.map((v) => {
        const active = v.aspect.id === activeVariantId;
        const hovered = hoveredVariantId === v.aspect.id;
        return (
          <div
            key={v.aspect.id}
            onClick={() => {
              if (!active) onSelect(v.aspect.id);
              setActionVariantId(v.aspect.id);
              setSubPopover(null);
            }}
            onMouseEnter={() => setHoveredVariantId(v.aspect.id)}
            onMouseLeave={() => setHoveredVariantId((cur) => (cur === v.aspect.id ? null : cur))}
            className={cn(
              'relative flex items-center gap-1 h-[26px] px-2 rounded-[7px] cursor-pointer font-semibold text-[11.5px] transition-colors duration-100',
              active ? 'bg-[#4b57e6]/12 text-[#4b57e6]' : hovered ? 'bg-[#f4f5f9] text-[#5c5d6e]' : 'text-[#5c5d6e]'
            )}
            style={{
              background: active ? 'color-mix(in srgb, var(--accent-color, #4b57e6) 12%, transparent)' : hovered ? '#f4f5f9' : 'transparent',
            }}
          >
            <span>{formatAspectLabel(v.aspect)}</span>
            {actionVariantId === v.aspect.id && subPopover === null && (
              <VariantActionPopover
                label={formatAspectLabel(v.aspect)}
                canCopy={Boolean(onCopyFromVariant) && variants.length > 1}
                canChangeAspect={Boolean(onChangeAspect)}
                canRemove={Boolean(onRemove) && variants.length > 1}
                onClose={closeAll}
                onPickCopy={() => setSubPopover('copy')}
                onPickChangeAspect={() => setSubPopover('change-aspect')}
                onPickRemove={() => setSubPopover('remove')}
              />
            )}
            {actionVariantId === v.aspect.id && subPopover === 'copy' && onCopyFromVariant && (
              <CopyVariantPopover
                variants={variants}
                targetVariantId={v.aspect.id}
                onClose={closeAll}
                onConfirm={(sourceId, mode, lockStrategy) => {
                  onCopyFromVariant(sourceId, v.aspect.id, mode, lockStrategy);
                  closeAll();
                }}
              />
            )}
            {actionVariantId === v.aspect.id && subPopover === 'change-aspect' && onChangeAspect && (
              <AddVariantModal
                title={`Đổi tỷ lệ (hiện tại: ${formatAspectLabel(v.aspect)})`}
                confirmLabel="Đổi"
                usedAspectIds={new Set([...usedAspectIds].filter((id) => id !== v.aspect.id))}
                onClose={closeAll}
                onConfirm={(newAspect) => {
                  onChangeAspect(v.aspect.id, newAspect);
                  closeAll();
                }}
              />
            )}
            {actionVariantId === v.aspect.id && subPopover === 'remove' && onRemove && (
              <RemoveVariantConfirm
                label={formatAspectLabel(v.aspect)}
                onClose={closeAll}
                onConfirm={() => {
                  onRemove(v.aspect.id);
                  closeAll();
                }}
              />
            )}
          </div>
        );
      })}
      <button
        onClick={() => setModalOpen(true)}
        aria-label="Thêm tỷ lệ"
        className="flex items-center justify-center w-[26px] h-[26px] rounded-[7px] border-none bg-transparent text-[#5c5d6e] hover:bg-[#f4f5f9] cursor-pointer"
      >
        <Plus size={15} />
      </button>
      {modalOpen && (
        <AddVariantModal
          usedAspectIds={usedAspectIds}
          onClose={() => setModalOpen(false)}
          onConfirm={(aspect) => {
            onAdd(aspect);
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function VariantActionPopover({
  label,
  canCopy,
  canChangeAspect,
  canRemove,
  onClose,
  onPickCopy,
  onPickChangeAspect,
  onPickRemove,
}: {
  label: string;
  canCopy: boolean;
  canChangeAspect: boolean;
  canRemove: boolean;
  onClose: () => void;
  onPickCopy: () => void;
  onPickChangeAspect: () => void;
  onPickRemove: () => void;
}) {
  return (
    <>
      <div
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute -inset-[1000px] z-[9]"
        style={{ position: 'absolute', inset: '-1000px' }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute top-full left-0 mt-[6px] w-[190px] bg-white border border-[#e6e6ee] rounded-[11px] shadow-[0_14px_34px_rgba(20,20,40,0.18)] z-[10] p-1"
      >
        <div className="p-[5px_8px_7px] text-[11px] font-bold text-[#9a9bab]">{label}</div>
        {canChangeAspect && (
          <button
            onClick={onPickChangeAspect}
            className="flex items-center gap-2 w-full p-[8px_10px] bg-transparent hover:bg-[#f4f5f9] border-none rounded-[7px] font-semibold text-[12.5px] text-[#5c5d6e] cursor-pointer text-left"
          >
            <RefreshCw size={13} />
            Đổi tỷ lệ
          </button>
        )}
        {canCopy && (
          <button
            onClick={onPickCopy}
            className="flex items-center gap-2 w-full p-[8px_10px] bg-transparent hover:bg-[#f4f5f9] border-none rounded-[7px] font-semibold text-[12.5px] text-[#5c5d6e] cursor-pointer text-left"
          >
            <Copy size={13} />
            Copy từ tỷ lệ khác
          </button>
        )}
        {canRemove && (
          <button
            onClick={onPickRemove}
            className="flex items-center gap-2 w-full p-[8px_10px] bg-transparent hover:bg-red-50 border-none rounded-[7px] font-semibold text-[12.5px] text-[#e05656] cursor-pointer text-left"
          >
            <X size={13} />
            Xoá
          </button>
        )}
      </div>
    </>
  );
}

function RemoveVariantConfirm({ label, onClose, onConfirm }: { label: string; onClose: () => void; onConfirm: () => void }) {
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
        className="absolute top-full left-0 mt-[6px] w-[260px] bg-white border border-[#e6e6ee] rounded-[11px] shadow-[0_14px_34px_rgba(20,20,40,0.18)] z-[10] p-[14px]"
      >
        <div className="font-bold text-[13px] mb-[6px]">Xoá tỷ lệ {label}?</div>
        <div className="text-[11.5px] text-[#5c5d6e] mb-[12px]">Toàn bộ nội dung của tỷ lệ này sẽ bị xoá. Có thể hoàn tác bằng Ctrl/Cmd+Z.</div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-[7px] bg-[#f4f5f9] text-[#5c5d6e] border-none rounded-lg font-semibold text-xs cursor-pointer">
            Huỷ
          </button>
          <button onClick={onConfirm} className="flex-1 py-[7px] bg-[#e05656] text-white border-none rounded-lg font-bold text-xs cursor-pointer">
            Xoá
          </button>
        </div>
      </div>
    </>
  );
}
