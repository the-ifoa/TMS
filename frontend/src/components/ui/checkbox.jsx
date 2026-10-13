import * as React from 'react';
import { cn } from '@/lib/utils';
import { Checkbox as CheckboxPrimitive, CheckboxIndicator } from '@/components/animate-ui/primitives/radix/checkbox';

// Checkbox with a drawn-in tick (Animate UI). Same API as the shadcn one it replaced.
const Checkbox = ({ className, ...props }) => (
  <CheckboxPrimitive
    className={cn(
      'peer flex h-4 w-4 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 data-[state=indeterminate]:bg-blue-600 data-[state=indeterminate]:border-blue-600',
      className
    )}
    {...props}
  >
    <CheckboxIndicator viewBox="0 0 24 24" className="h-3 w-3" />
  </CheckboxPrimitive>
);

export { Checkbox };
