import { useMemo, useRef, useState } from 'react';
import { cn } from '@sky-app/ui';

export interface VariableTextareaProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  onTokenInserted?: (key: string) => void;
  style?: React.CSSProperties;
}

export function VariableTextarea({ value, onChange, suggestions, onTokenInserted, style }: VariableTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [atIndex, setAtIndex] = useState<number | null>(null);

  const filtered = useMemo(() => {
    if (!query) return suggestions;
    return suggestions.filter((s) => s.toLowerCase().includes(query.toLowerCase()));
  }, [suggestions, query]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    onChange(next);

    const caret = e.target.selectionStart;
    const uptoCaret = next.slice(0, caret);
    const match = /(?:^|\s)@([a-zA-Z0-9_-]*)$/.exec(uptoCaret);
    if (match) {
      setOpen(true);
      setQuery(match[1] ?? '');
      setAtIndex(caret - (match[1]?.length ?? 0) - 1);
    } else {
      setOpen(false);
      setAtIndex(null);
    }
  }

  function insertToken(key: string) {
    if (atIndex == null || !textareaRef.current) return;
    const before = value.slice(0, atIndex);
    const caret = textareaRef.current.selectionStart;
    const after = value.slice(caret);
    const next = `${before}@${key}${after}`;
    onChange(next);
    onTokenInserted?.(key);
    setOpen(false);
    setAtIndex(null);
    requestAnimationFrame(() => {
      const pos = before.length + key.length + 1;
      textareaRef.current?.setSelectionRange(pos, pos);
      textareaRef.current?.focus();
    });
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full min-h-[58px] resize-y border border-[#e6e6ee] rounded-[9px] p-[9px_10px] font-semibold text-[12.5px]"
        style={style}
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 top-full mt-[6px] bg-white border border-[#e6e6ee] rounded-[11px] shadow-[0_14px_34px_rgba(20,20,40,0.18)] p-[6px] w-[230px] z-[40]">
          {filtered.map((key) => (
            <div
              key={key}
              data-testid="variable-suggestion"
              onMouseDown={(e) => {
                e.preventDefault();
                insertToken(key);
              }}
              className="flex items-center gap-[9px] p-[8px_9px] rounded-lg cursor-pointer hover:bg-[#f4f5f9]"
            >
              <span className="font-mono font-semibold text-[11px] text-[#c07a1e]">@{key}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
