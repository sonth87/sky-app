import type { Guide } from '@sky-app/layout-editor-core';

export function GuideLine({ guide, scaleX, scaleY }: { guide: Guide; scaleX: number; scaleY: number }) {
  const style =
    guide.axis === 'x'
      ? { position: 'absolute' as const, left: guide.position * scaleX, top: 0, bottom: 0, width: 1, background: 'var(--accent-color, #4b57e6)', pointerEvents: 'none' as const }
      : { position: 'absolute' as const, top: guide.position * scaleY, left: 0, right: 0, height: 1, background: 'var(--accent-color, #4b57e6)', pointerEvents: 'none' as const };
  return <div data-testid="snap-guide" style={style} />;
}
