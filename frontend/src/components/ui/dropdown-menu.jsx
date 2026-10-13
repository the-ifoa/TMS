import * as React from 'react';
import { HiCheck } from 'react-icons/hi';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuGroup, DropdownMenuPortal,
  DropdownMenuSub, DropdownMenuRadioGroup,
  DropdownMenuContent as ContentPrimitive, DropdownMenuItem as ItemPrimitive,
  DropdownMenuCheckboxItem as CheckboxItemPrimitive, DropdownMenuItemIndicator,
  DropdownMenuLabel as LabelPrimitive, DropdownMenuSeparator as SeparatorPrimitive,
} from '@/components/animate-ui/primitives/radix/dropdown-menu';

// Dropdown menu animated by Animate UI. Same API as the shadcn one it replaced.
const DropdownMenuContent = ({ className, align = 'end', sideOffset = 8, alignOffset = -8, ...props }) => (
  <ContentPrimitive
    align={align}
    sideOffset={sideOffset}
    alignOffset={alignOffset}
    transition={{ type: 'spring', stiffness: 460, damping: 32 }}
    className={cn(
      'z-50 min-w-[10rem] overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-2xl outline-none origin-[var(--radix-dropdown-menu-content-transform-origin)]',
      className
    )}
    {...props}
  />
);

const DropdownMenuItem = ({ className, inset, danger, ...props }) => (
  <ItemPrimitive
    whileTap={{ scale: 0.98 }}
    className={cn(
      'relative flex cursor-pointer select-none items-center gap-2 rounded-xl px-3 py-2.5 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      danger ? 'text-red-600 focus:bg-red-50' : 'text-slate-700 focus:bg-slate-100 focus:text-slate-900',
      inset && 'pl-8',
      className
    )}
    {...props}
  />
);

const DropdownMenuCheckboxItem = ({ className, children, checked, ...props }) => (
  <CheckboxItemPrimitive
    className={cn(
      'relative flex cursor-pointer select-none items-center rounded-xl py-2.5 pl-8 pr-3 text-sm text-slate-700 outline-none transition-colors focus:bg-slate-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2.5 flex h-3.5 w-3.5 items-center justify-center">
      <DropdownMenuItemIndicator initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <HiCheck className="h-4 w-4 text-blue-600" />
      </DropdownMenuItemIndicator>
    </span>
    {children}
  </CheckboxItemPrimitive>
);

const DropdownMenuLabel = ({ className, inset, ...props }) => (
  <LabelPrimitive
    className={cn('px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400', inset && 'pl-8', className)}
    {...props}
  />
);

const DropdownMenuSeparator = ({ className, ...props }) => (
  <SeparatorPrimitive className={cn('-mx-1 my-1 h-px bg-slate-100', className)} {...props} />
);

export {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuGroup, DropdownMenuPortal, DropdownMenuSub, DropdownMenuRadioGroup,
};
