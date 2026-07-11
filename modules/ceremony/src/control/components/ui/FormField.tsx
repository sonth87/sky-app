import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface FormFieldProps {
  label: ReactNode;
  help?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}

export function FormField({ label, help, children, htmlFor, className }: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label
        htmlFor={htmlFor}
        className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </label>
      {children}
      {help && <p className="text-2xs italic text-muted-foreground">{help}</p>}
    </div>
  );
}
