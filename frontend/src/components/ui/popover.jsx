import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  Popover, PopoverTrigger, PopoverAnchor, PopoverPortal,
  PopoverContent as ContentPrimitive,
} from '@/components/animate-ui/primitives/radix/popover';

// Popover with a spring pop from its trigger (Animate UI). Same API as before.
const PopoverContent = ({ className, align = 'end', sideOffset = 8, alignOffset = -8, ...props }) => (
  <PopoverPortal>
    {/* Plain wrapper: Radix hands the portal's direct child a ref, which a
        function component can't take on React 18. */}
    <div>
    <ContentPrimitive
      align={align}
      sideOffset={sideOffset}
      alignOffset={alignOffset}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      className={cn(
        'z-50 rounded-2xl border border-slate-200/80 bg-white shadow-2xl outline-none overflow-hidden origin-[var(--radix-popover-content-transform-origin)]',
        className
      )}
      {...props}
    />
    </div>
  </PopoverPortal>
);

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
