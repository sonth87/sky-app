// LayoutInfoModal — Giai đoạn 5.2 (docs/roadmap/plans/layout-designer/15-import-export.md
// "Category/tag cho layout"). Panel "Thông tin layout" (tên/mô tả/category/tags) — trước đây
// không có cách nào sửa tên/mô tả sau khi tạo layout. Mở/lưu qua LayoutPort.updateDocumentMeta
// (true partial-patch, xem packages/ceremony-db/src/queries/layout.ts) từ LayoutLibraryScreen.

import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '@sky-app/ui';

export interface LayoutInfoModalInitial {
  name: string;
  description?: string;
  category?: string;
  tags: string[];
}

export interface LayoutInfoModalProps {
  initial: LayoutInfoModalInitial;
  onClose: () => void;
  onSave: (patch: { name: string; description?: string; category?: string; tags: string[] }) => void | Promise<void>;
}

export function LayoutInfoModal({ initial, onClose, onSave }: LayoutInfoModalProps) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? '');
  const [category, setCategory] = useState(initial.category ?? '');
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);

  const trimmedName = name.trim();

  function addTagFromInput() {
    const value = tagInput.trim();
    setTagInput('');
    if (value === '' || tags.includes(value)) return;
    setTags((cur) => [...cur, value]);
  }

  function handleTagInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTagFromInput();
    } else if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) {
      setTags((cur) => cur.slice(0, -1));
    }
  }

  function removeTag(tag: string) {
    setTags((cur) => cur.filter((t) => t !== tag));
  }

  async function handleSave() {
    if (!trimmedName || saving) return;
    setSaving(true);
    try {
      await onSave({
        name: trimmedName,
        description: description.trim() || undefined,
        category: category.trim() || undefined,
        tags,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[420px] rounded-[12px] bg-white p-[18px] shadow-[0_14px_34px_rgba(20,20,40,0.18)]"
      >
        <div className="mb-3 font-bold text-sm">Thông tin layout</div>

        <label className="mb-1 block text-[11px] font-bold text-[#9a9bab] uppercase tracking-[.04em]">Tên</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tên layout"
          className="mb-3 w-full rounded-[8px] border border-[#e6e6ee] p-[8px_10px] text-sm"
        />

        <label className="mb-1 block text-[11px] font-bold text-[#9a9bab] uppercase tracking-[.04em]">Mô tả</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Mô tả (tuỳ chọn)"
          rows={2}
          className="mb-3 w-full resize-none rounded-[8px] border border-[#e6e6ee] p-[8px_10px] text-sm"
        />

        <label className="mb-1 block text-[11px] font-bold text-[#9a9bab] uppercase tracking-[.04em]">Phân loại</label>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="VD: Trao bằng, Khen thưởng..."
          className="mb-3 w-full rounded-[8px] border border-[#e6e6ee] p-[8px_10px] text-sm"
        />

        <label className="mb-1 block text-[11px] font-bold text-[#9a9bab] uppercase tracking-[.04em]">Thẻ (tags)</label>
        <div className="mb-4 flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-[8px] border border-[#e6e6ee] p-[6px_8px]">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 rounded-full bg-[#f4f5f9] px-[8px] py-[3px] text-[11px] font-semibold text-[#5c5d6e]"
            >
              {tag}
              <button
                onClick={() => removeTag(tag)}
                aria-label={`Xoá thẻ ${tag}`}
                className="flex items-center justify-center border-none bg-transparent p-0 text-[#9a9bab] cursor-pointer hover:text-[#e05656]"
              >
                <X size={11} />
              </button>
            </span>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagInputKeyDown}
            onBlur={addTagFromInput}
            placeholder={tags.length === 0 ? 'Gõ rồi nhấn Enter để thêm thẻ' : ''}
            className="min-w-[80px] flex-1 border-none p-[3px] text-[11.5px] outline-none"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-[8px] bg-[#f4f5f9] text-[#5c5d6e] border-none rounded-[8px] font-semibold text-xs cursor-pointer"
          >
            Huỷ
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={!trimmedName || saving}
            className={cn(
              'flex-1 py-[8px] border-none rounded-[8px] font-bold text-xs',
              trimmedName && !saving ? 'bg-[#4b57e6] text-white cursor-pointer hover:bg-[#3b47d6]' : 'bg-[#e6e6ee] text-[#9a9bab] cursor-default',
            )}
          >
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  );
}
