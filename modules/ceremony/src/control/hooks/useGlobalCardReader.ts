import { useEffect, useRef } from 'react';

/**
 * Global HID card reader detector - independent of input focus.
 *
 * When user scans a card/QR code with HID device:
 * - Device sends all characters in rapid succession (5+ chars in ~100ms)
 * - This listener captures the sequence and triggers callback
 * - Input events are collected until a pause is detected
 *
 * Key insight: HID sends characters VERY fast (10-20ms apart),
 * much faster than human typing (200-500ms per char).
 */

interface Options {
  minChars?: number;      // Min characters to trigger scan (default: 5)
  maxGapMs?: number;      // Max gap between chars for same scan (default: 100ms)
  enabled?: boolean;      // Enable/disable the listener (default: true)
}

export function useGlobalCardReader(
  onScan: (code: string) => void,
  opts: Options = {},
) {
  const { minChars = 5, maxGapMs = 100, enabled = true } = opts;

  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const flushTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTargetRef = useRef<HTMLElement | null>(null);

  const clearTextTarget = (target: HTMLElement | null) => {
    if (!target) return;

    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      const proto = Object.getPrototypeOf(target);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      setter?.call(target, '');
      target.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    if (target.isContentEditable) {
      target.textContent = '';
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore modifiers
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const target = e.target as HTMLElement | null;

      // Only capture printable characters
      if (e.key.length !== 1) return;

      const now = performance.now();
      const timeSinceLastKey = now - lastKeyTimeRef.current;


      // If gap is too long, reset buffer (new scan)
      if (timeSinceLastKey > maxGapMs && bufferRef.current) {
        bufferRef.current = '';
      }

      // Add character to buffer
      bufferRef.current += e.key;
      lastKeyTimeRef.current = now;
      lastTargetRef.current = target;

      // Clear existing timeout
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
      }

      // Set new timeout to flush buffer after pause
      flushTimeoutRef.current = setTimeout(() => {
        const code = bufferRef.current.trim();
        if (code.length >= minChars) {
          onScanRef.current(code);
          clearTextTarget(lastTargetRef.current);
        }
        bufferRef.current = '';
        lastTargetRef.current = null;
      }, maxGapMs);
    };

    window.addEventListener('keydown', handleKeyDown, true); // Use capture phase

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      if (flushTimeoutRef.current) {
        clearTimeout(flushTimeoutRef.current);
      }
    };
  }, [minChars, maxGapMs, enabled]);
}
