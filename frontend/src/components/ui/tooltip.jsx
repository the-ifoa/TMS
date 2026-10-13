import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  TooltipProvider, Tooltip, TooltipTrigger, TooltipPortal,
  TooltipContent as ContentPrimitive,
} from '@/components/animate-ui/primitives/radix/tooltip';

// Tooltip with a spring pop (Animate UI). Same API as the shadcn one it replaced.
const TooltipContent = ({ className, sideOffset = 6, ...props }) => (
  <TooltipPortal>
    {/* Plain wrapper: Radix hands the portal's direct child a ref, which a
        function component can't take on React 18. */}
    <div>
    <ContentPrimitive
      sideOffset={sideOffset}
      transition={{ type: 'spring', stiffness: 460, damping: 30 }}
      className={cn(
        'z-50 overflow-hidden rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-md origin-[var(--radix-tooltip-content-transform-origin)]',
        className
      )}
      {...props}
    />
    </div>
  </TooltipPortal>
);

// Convenience wrapper — <SimpleTooltip label="Delete"><button>...</button></SimpleTooltip>
function SimpleTooltip({ label, children, side = 'top' }) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, SimpleTooltip };
