// VariableTextarea — textarea nội dung + autocomplete khi gõ @, theo docs/roadmap/plans/
// layout-designer/09-quy-dinh-variable.md §4 "Quản lý biến trong UI Editor". Gõ `@` → dropdown
// gợi ý (nguồn `suggestions` do caller truyền vào — PropertyPanel gộp token đã dùng trong
// layout hiện tại + variable_registry toàn cục, sub-bước 2.5).
//
// Cú pháp @var đã CHỐT (file 09 §1): mở, không đóng đuôi, @ đứng sau khoảng trắng/đầu dòng.
// Component này KHÔNG tự validate cú pháp (đó là việc của tokens.ts's resolveTokens lúc render)
// — chỉ hỗ trợ chèn nhanh, người dùng vẫn có thể gõ tay bất kỳ token nào.

import { useMemo, useRef, useState } from 'react';

export interface VariableTextareaProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  /** Gọi khi user CHỌN 1 token từ dropdown (không gọi khi gõ tay) — dùng để ghi nhận vào
   * variable_registry toàn cục (file 09 §2.6). Gõ tay không cần ghi nhận ở đây; nếu muốn ghi
   * nhận cả token gõ tay, làm ở tầng cao hơn khi save draft (ngoài phạm vi component này). */
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
    // Tìm '@' gần nhất trước con trỏ mà CHƯA bị ngắt bởi khoảng trắng/xuống dòng (đang gõ dở token).
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
    // Đặt lại con trỏ ngay sau token vừa chèn.
    requestAnimationFrame(() => {
      const pos = before.length + key.length + 1;
      textareaRef.current?.setSelectionRange(pos, pos);
      textareaRef.current?.focus();
    });
  }

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{ width: '100%', minHeight: 58, resize: 'vertical', border: '1px solid #e6e6ee', borderRadius: 9, padding: '9px 10px', fontWeight: 600, fontSize: 12.5, ...style }}
      />
      {open && filtered.length > 0 && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: '100%',
            marginTop: 6,
            background: '#fff',
            border: '1px solid #e6e6ee',
            borderRadius: 11,
            boxShadow: '0 14px 34px rgba(20,20,40,.18)',
            padding: 6,
            width: 230,
            zIndex: 40,
          }}
        >
          {filtered.map((key) => (
            <div
              key={key}
              data-testid="variable-suggestion"
              // onMouseDown (không onClick) — chạy TRƯỚC textarea's onBlur, tránh dropdown đóng
              // trước khi kịp xử lý click chọn token.
              onMouseDown={(e) => {
                e.preventDefault();
                insertToken(key);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px', borderRadius: 8, cursor: 'pointer' }}
            >
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 11, color: '#c07a1e' }}>@{key}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
