export function Dot({ color }: { color: 'green' | 'yellow' | 'red' | 'slate' }) {
  const cls = {
    green: 'bg-success',
    yellow: 'bg-warning',
    red: 'bg-destructive/60',
    slate: 'bg-muted-foreground',
  }[color];
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${cls}`} />;
}
