import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Settings2, AudioLines, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Student, CustomVariable } from '@sky-app/slide-shared';
import { renderTemplate, STUDENT_TEMPLATE_VARIABLES } from '../../lib/renderTemplate';
import { useControlStore } from '../store';
import { playPcm, stopPcm } from '../../lib/audio';

interface Props {
  value: string;
  onChange: (v: string) => void;
  previewStudent: Student | null;
  placeholder?: string;
  voiceId?: string;
  speed?: number;
  customVariables?: CustomVariable[];
  /** Mở modal quản lý biến câu đọc (hiện nút nhỏ nếu có) */
  onManageVariables?: () => void;
}

const VARIABLE_REGEX = /@([a-zA-Z_]+)/g;

// Escape HTML rồi bọc @variable trong <span> tô màu — dùng làm innerHTML cho ô contentEditable.
// Biến có trong `knownKeys` tô xanh (hợp lệ); biến lạ tô đỏ + gạch chân để báo không khớp biến nào.
function buildHighlightedHtml(text: string, knownKeys: Set<string>, unknownVarTitle: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let html = '';
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  VARIABLE_REGEX.lastIndex = 0;
  while ((match = VARIABLE_REGEX.exec(text)) !== null) {
    html += escape(text.slice(lastIdx, match.index));
    const isKnown = knownKeys.has(match[1]);
    const cls = isKnown
      ? 'text-success font-medium'
      : 'text-destructive font-medium underline decoration-wavy decoration-destructive/50';
    const title = isKnown ? '' : ` title="${escape(unknownVarTitle)}"`;
    html += `<span class="${cls}"${title}>@${escape(match[1])}</span>`;
    lastIdx = VARIABLE_REGEX.lastIndex;
  }
  html += escape(text.slice(lastIdx));
  // Giữ dòng trống cuối cùng hiển thị được (contentEditable cần <br> thay vì chuỗi rỗng ở cuối).
  return html.length > 0 ? html : '<br>';
}

// Lưu vị trí con trỏ dạng "số ký tự tính từ đầu" (offset trên text thuần, không phải trên DOM node)
// để có thể khôi phục chính xác sau khi innerHTML bị thay thế hoàn toàn (làm mất mọi Range cũ).
function getCaretCharOffset(root: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;
  const preRange = range.cloneRange();
  preRange.selectNodeContents(root);
  preRange.setEnd(range.startContainer, range.startOffset);
  return preRange.toString().length;
}

function setCaretCharOffset(root: HTMLElement, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node = walker.nextNode();
  while (node) {
    const len = node.textContent?.length ?? 0;
    if (remaining <= len) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= len;
    node = walker.nextNode();
  }
  // Offset vượt quá nội dung (vd vừa xóa hết) → đặt con trỏ ở cuối cùng.
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function TemplateEditor({
  value,
  onChange,
  previewStudent,
  placeholder,
  voiceId,
  speed,
  customVariables = [],
  onManageVariables,
}: Props) {
  const { t } = useTranslation();
  const editorRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [dropdownQuery, setDropdownQuery] = useState<string | null>(null);
  const [dropdownIndex, setDropdownIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);

  // Gộp biến điều kiện tùy chỉnh + biến tĩnh (hiện trong dropdown gợi ý @)
  const allVariables = useMemo(() => {
    const custom = customVariables
      .filter((v) => v.key)
      .map((v) => ({ key: v.key, label: v.label || v.key, example: v.default || '' }));
    return [...custom, ...STUDENT_TEMPLATE_VARIABLES];
  }, [customVariables]);

  // Tập key hợp lệ để phân biệt @biến_thật (xanh) và @biến_lạ gõ nhầm/không tồn tại (đỏ).
  const knownVariableKeys = useMemo(() => new Set(allVariables.map((v) => v.key)), [allVariables]);

  const filtered = dropdownQuery !== null
    ? allVariables.filter(
        (v) => v.key.startsWith(dropdownQuery) || v.label.toLowerCase().includes(dropdownQuery.toLowerCase())
      )
    : [];

  // Đồng bộ nội dung DOM khi `value` đổi từ bên ngoài (vd chọn preset khác, load config) —
  // giữ nguyên vị trí con trỏ nếu đang focus để không làm gián đoạn việc gõ.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const currentText = el.textContent ?? '';
    if (currentText === value) return;
    const caret = isFocused ? getCaretCharOffset(el) : null;
    el.innerHTML = buildHighlightedHtml(value, knownVariableKeys, t('templateEditor.unknownVariable'));
    if (caret !== null) {
      setCaretCharOffset(el, Math.min(caret, value.length));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, knownVariableKeys]);

  function handleInput(e: React.FormEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const val = el.textContent ?? '';
    const caret = getCaretCharOffset(el);
    onChange(val);
    // Re-highlight ngay để màu cập nhật khi vừa gõ xong @tên_biến, không đợi effect ở lần render sau.
    el.innerHTML = buildHighlightedHtml(val, knownVariableKeys, t('templateEditor.unknownVariable'));
    if (caret !== null) {
      setCaretCharOffset(el, Math.min(caret, val.length));
    }

    const cursor = caret ?? val.length;
    const textBefore = val.slice(0, cursor);
    const match = textBefore.match(/(@\w*)$/);
    if (match) {
      setDropdownQuery(match[1].slice(1));
      setDropdownIndex(0);
    } else {
      setDropdownQuery(null);
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (dropdownQuery === null || filtered.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setDropdownIndex((i) => (i + 1) % filtered.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setDropdownIndex((i) => (i - 1 + filtered.length) % filtered.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertVariable(filtered[dropdownIndex].key); }
    else if (e.key === 'Escape') { setDropdownQuery(null); }
  }

  function insertVariable(key: string) {
    const el = editorRef.current;
    if (!el) return;
    const cursor = getCaretCharOffset(el) ?? value.length;
    const textBefore = value.slice(0, cursor);
    const match = textBefore.match(/(@\w*)$/);
    if (!match) return;
    const start = cursor - match[1].length;
    const newVal = value.slice(0, start) + `@${key}` + value.slice(cursor);
    onChange(newVal);
    setDropdownQuery(null);
    el.innerHTML = buildHighlightedHtml(newVal, knownVariableKeys, t('templateEditor.unknownVariable'));
    const newCursor = start + key.length + 1;
    requestAnimationFrame(() => {
      el.focus();
      setCaretCharOffset(el, newCursor);
    });
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (editorRef.current && !editorRef.current.contains(e.target as Node)) {
        setDropdownQuery(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Cuộn item đang chọn vào vùng nhìn thấy khi di chuyển bằng phím lên/xuống
  useEffect(() => {
    if (dropdownQuery === null) return;
    const active = listRef.current?.children[dropdownIndex] as HTMLElement | undefined;
    active?.scrollIntoView({ block: 'nearest' });
  }, [dropdownIndex, dropdownQuery]);

  const preview = previewStudent && value ? renderTemplate(value, previewStudent, customVariables) : null;
  const isEmpty = value.length === 0;

  const pythonStatus = useControlStore((s) => s.pythonStatus);
  const isTtsReady = pythonStatus === 'ready';

  const [isPlaying, setIsPlaying] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const stopFnRef = useRef<(() => void) | null>(null);

  const stopCurrent = useCallback(() => {
    stopFnRef.current?.();
    stopFnRef.current = null;
    stopPcm();
    setIsPlaying('idle');
  }, []);

  const handlePlayPreview = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!preview) return;

    if (isPlaying === 'playing') {
      stopCurrent();
      return;
    }

    stopCurrent();
    setIsPlaying('loading');

    try {
      const activeVoice = voiceId || 'vieneu-NF';
      const activeSpeed = speed ?? 1.0;

      const result = await window.slide?.speak(preview, activeVoice, activeSpeed);
      if (!result?.ok || !result.buffer) {
        throw new Error(result?.error ?? 'No audio buffer returned');
      }

      setIsPlaying('playing');

      stopFnRef.current = () => {
        stopPcm();
        setIsPlaying('idle');
      };

      await playPcm(result.buffer, result.sampleRate ?? 48000);
      setIsPlaying('idle');
      stopFnRef.current = null;
    } catch (err) {
      console.error('[TemplateEditor] play preview failed:', err);
      setIsPlaying('error');
      setTimeout(() => {
        setIsPlaying('idle');
      }, 2000);
    }
  }, [preview, isPlaying, voiceId, speed, stopCurrent]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopPcm();
    };
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative rounded-md border border-border bg-card focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/30">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          role="textbox"
          aria-multiline="true"
          data-placeholder={placeholder ?? t('templateEditor.placeholder')}
          className={`min-h-[63px] max-h-40 w-full overflow-y-auto whitespace-pre-wrap break-words rounded-md px-3 py-2 pr-9 text-sm text-foreground font-mono leading-[21px] focus:outline-none ${
            isEmpty ? 'before:content-[attr(data-placeholder)] before:text-muted-foreground before:pointer-events-none' : ''
          }`}
        />
        {onManageVariables && (
          <button
            type="button"
            onClick={onManageVariables}
            title={t('templateEditor.manageVariablesTitle')}
            className="absolute border-none bg-none bottom-2 right-1.5 z-10 flex items-center justify-center rounded-md text-accent-foreground shadow-sm hover:text-accent-foreground transition-colors"
          >
            <Settings2 size={14} />
          </button>
        )}
        {dropdownQuery !== null && filtered.length > 0 && (
          <ul ref={listRef} className="absolute left-0 top-full z-50 mt-1 max-h-52 w-80 overflow-y-auto rounded-lg border border-border bg-card shadow-xl">
            {filtered.map((item, idx) => (
              <li
                key={item.key}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${
                  idx === dropdownIndex ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
                }`}
                onMouseDown={(e) => { e.preventDefault(); insertVariable(item.key); }}
                onMouseEnter={() => setDropdownIndex(idx)}
              >
                <span className="font-mono text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded">@{item.key}</span>
                <span className="text-foreground">{item.label}</span>
                <span className="ml-auto text-xs text-muted-foreground truncate max-w-[100px]">{item.example}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {preview !== null && (
        <div className="flex items-center justify-between gap-3 rounded-md bg-accent border border-accent px-3 py-2 text-xs text-accent-foreground">
          <div className="flex-1 min-w-0">
            <span className="mr-1 font-medium text-accent-foreground">{t('templateEditor.previewLabel')}</span>
            {preview || <span className="italic text-muted-foreground">{t('templateEditor.empty')}</span>}
          </div>
          {preview && (
            <button
              onClick={handlePlayPreview}
              disabled={isPlaying === 'loading'}
              title={!isTtsReady ? t('templateEditor.ttsNotReady') : isPlaying === 'loading' ? t('templateEditor.generatingAudio') : isPlaying === 'playing' ? t('templateEditor.stopPlaying') : t('templateEditor.listenPreview')}
              className={`flex-shrink-0 p-1.5 rounded-lg border transition-all duration-200 ${
                !isTtsReady
                  ? 'bg-muted border-border text-muted-foreground cursor-not-allowed opacity-50'
                  : isPlaying === 'loading'
                  ? 'bg-accent border-accent text-accent-foreground'
                  : isPlaying === 'playing'
                  ? 'bg-accent border-accent text-accent-foreground animate-pulse'
                  : 'bg-card border-accent hover:border-accent text-accent-foreground hover:text-accent-foreground'
              }`}
            >
              {isPlaying === 'loading' ? (
                <Loader2 size={14} className="animate-spin text-accent-foreground" />
              ) : (
                <AudioLines size={14} className={isPlaying === 'playing' ? 'animate-bounce' : ''} />
              )}
            </button>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {t('templateEditor.hint.typeAt')} <code className="rounded bg-muted px-1 text-foreground">@</code> {t('templateEditor.hint.toInsertVariable')}
        {' '}{t('templateEditor.hint.example')} <code className="rounded bg-muted px-1 text-foreground">Xin mời @full_name</code>
      </p>
      <p className="text-xs text-muted-foreground">
        {t('templateEditor.hint.addPunctBefore')} <code className="rounded bg-muted px-1 text-foreground">.</code> {t('templateEditor.hint.or')} <code className="rounded bg-muted px-1 text-foreground">,</code> {t('templateEditor.hint.forPause')}
        {' '}{t('templateEditor.hint.useMultiDots')} <code className="rounded bg-muted px-1 text-foreground">...</code> {t('templateEditor.hint.forLongerPause')}
      </p>
    </div>
  );
}
