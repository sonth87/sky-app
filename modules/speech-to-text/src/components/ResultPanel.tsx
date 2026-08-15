import { useState } from 'react';
import { Check, Copy, Download, Loader2 } from 'lucide-react';
import { downloadText } from '../lib/downloadText.js';

export interface ResultPanelProps {
  text: string;
  onChange: (text: string) => void;
  busy?: boolean;
}

export function ResultPanel({ text, onChange, busy }: ResultPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = () => {
    if (!text) return;
    downloadText(text, `speech-to-text-${Date.now()}.txt`);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          Kết quả
          {busy && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopy}
            disabled={!text || busy}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-2xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-40"
            title="Sao chép"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />} Sao chép
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!text || busy}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-2xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-40"
            title="Tải về .txt"
          >
            <Download size={12} /> Tải .txt
          </button>
        </div>
      </div>
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        readOnly={busy}
        placeholder="Kết quả phiên âm sẽ hiện ở đây — sửa được trực tiếp nếu cần."
        rows={10}
        className="text-sm px-3 py-2 rounded-lg border border-border bg-card focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none resize-none transition-all disabled:opacity-60"
      />
    </div>
  );
}
