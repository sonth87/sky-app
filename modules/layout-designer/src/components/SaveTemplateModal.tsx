import { useState } from 'react';
import { X, CheckCircle2 } from 'lucide-react';

export interface SaveTemplateModalProps {
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}

export function SaveTemplateModal({ onSave, onClose }: SaveTemplateModalProps) {
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      await onSave(name.trim());
      setSaveSuccess(true);
      setTimeout(() => onClose(), 600);
    } finally {
      setIsSaving(false);
    }
  };

  if (saveSuccess) {
    return (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
        <div className="bg-white rounded-[11px] shadow-[0_14px_34px_rgba(20,20,40,0.18)] p-8 flex flex-col items-center gap-3">
          <CheckCircle2 size={48} className="text-green-500" />
          <p className="font-semibold text-sm text-[#5c5d6e]">Đã lưu mẫu</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded-[11px] shadow-[0_14px_34px_rgba(20,20,40,0.18)] w-96 p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Lưu thành mẫu</h2>
          <button onClick={onClose} className="p-1 hover:bg-[#f4f5f9] rounded-[7px]">
            <X size={16} className="text-[#9a9bab]" />
          </button>
        </div>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tên mẫu"
          onKeyDown={(e) => e.key === 'Enter' && !isSaving && handleSave()}
          autoFocus
          className="px-[11px] py-[8px] border border-[#e6e6ee] rounded-[7px] bg-[#fcfcfd] text-sm focus:outline-none focus:border-[#4b57e6]"
        />

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-sm rounded-[7px] border border-[#e6e6ee] text-[#5c5d6e] hover:bg-[#f4f5f9] disabled:opacity-50"
          >
            Huỷ
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || isSaving}
            className="px-4 py-2 text-sm rounded-[7px] bg-[#4b57e6] text-white hover:bg-[#3d47cc] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  );
}
