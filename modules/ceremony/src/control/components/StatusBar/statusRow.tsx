import { Info } from 'lucide-react';

export function StatRow({
  label,
  value,
  accent,
  tooltip,
}: {
  label: string;
  value: string;
  accent?: 'green' | 'red' | 'yellow' | 'slate';
  tooltip?: string;
}) {
  const textCls = accent
    ? {
        green: 'text-success',
        red: 'text-destructive',
        yellow: 'text-warning',
        slate: 'text-muted-foreground',
      }[accent]
    : 'text-foreground';

  return (
    <div className="flex gap-3 leading-relaxed items-start select-text">
      <div className="flex items-center gap-1 text-muted-foreground shrink-0 w-24 select-none">
        <span>{label}</span>
        {tooltip && (
          <div className="group relative flex items-center cursor-help">
            <Info className="h-3 w-3 text-muted-foreground hover:text-foreground shrink-0" />
            <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 w-48 -translate-x-1/2 rounded bg-foreground p-2 text-2xs leading-normal text-background opacity-0 transition-opacity duration-200 group-hover:opacity-100 shadow-lg z-50 whitespace-normal text-center font-normal">
              {tooltip}
              <div className="absolute top-full left-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-0.5 rotate-45 bg-foreground" />
            </div>
          </div>
        )}
      </div>
      <span className={`${textCls} break-words flex-1 select-text`}>{value}</span>
    </div>
  );
}
