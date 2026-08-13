import { useLayoutEffect, useState, type RefObject } from 'react';

export interface AutoFitInput {
  text: string;
  boxWidthPx: number;
  boxHeightPx: number;
  requestedFontSizePx: number;
  minFontSizePx: number;
  wrap: boolean;
  enabled: boolean;
}

export function useAutoFitFontSize(ref: RefObject<any>, input: AutoFitInput): number {
  const [fontSizePx, setFontSizePx] = useState(input.requestedFontSizePx);

  useLayoutEffect(() => {
    if (!input.enabled || !ref.current) {
      setFontSizePx(input.requestedFontSizePx);
      return;
    }

    const el = ref.current as HTMLElement;
    let lo = input.minFontSizePx;
    let hi = input.requestedFontSizePx;

    const fits = (px: number) => {
      el.style.fontSize = `${px}px`;
      // reflow xảy ra ngay khi đọc scrollHeight/scrollWidth
      const overflowsHeight = el.scrollHeight > el.clientHeight + 0.5;
      const overflowsWidth = !input.wrap && el.scrollWidth > el.clientWidth + 0.5;
      return !overflowsHeight && !overflowsWidth;
    };

    if (fits(hi)) {
      setFontSizePx(hi);
      return;
    }

    // Binary search
    for (let i = 0; i < 20 && hi - lo > 0.5; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid;
      else hi = mid;
    }

    setFontSizePx(lo);
  }, [input.enabled, input.text, input.boxWidthPx, input.boxHeightPx, input.requestedFontSizePx, input.minFontSizePx, input.wrap]);

  return fontSizePx;
}
