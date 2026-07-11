import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

interface TooltipSimpleProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

/** Wrapper tiện lợi quanh Tooltip composable của shadcn — giữ API cũ (prop `content`) cho call site đơn giản. */
export function TooltipSimple({ content, children, side = 'top' }: TooltipSimpleProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{content}</TooltipContent>
    </Tooltip>
  );
}
