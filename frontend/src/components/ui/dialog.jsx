import * as React from 'react';
import { HiOutlineX } from 'react-icons/hi';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogTrigger, DialogPortal, DialogClose,
  DialogOverlay as OverlayPrimitive, DialogContent as ContentPrimitive,
  DialogTitle as TitlePrimitive, DialogDescription as DescriptionPrimitive,
} from '@/components/animate-ui/primitives/radix/dialog';

// App dialog, animated by Animate UI (spring tilt-in + blur). Same API as the
// shadcn one it replaced.
const DialogOverlay = ({ className, ...props }) => (
  <OverlayPrimitive className={cn('fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs', className)} {...props} />
);

// The panel animates its own `transform`, so it is centred by a flex wrapper
// rather than by translate classes (which the animation would overwrite).
const DialogContent = ({ className, children, hideClose, ...props }) => (
  <DialogPortal>
    {/* Plain wrapper: Radix hands the portal's direct child a ref, which a
        function component can't take on React 18. */}
    <div>
    <DialogOverlay />
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
      <ContentPrimitive
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        className={cn(
          'pointer-events-auto relative w-full max-w-lg flex flex-col max-h-[85vh] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl outline-none',
          className
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogClose className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors focus:outline-none">
            <HiOutlineX className="w-4.5 h-4.5" />
          </DialogClose>
        )}
      </ContentPrimitive>
    </div>
    </div>
  </DialogPortal>
);

const DialogHeader = ({ className, ...props }) => (
  <div className={cn('flex-shrink-0 px-5 py-4 border-b border-slate-100', className)} {...props} />
);
const DialogFooter = ({ className, ...props }) => (
  <div className={cn('flex-shrink-0 flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-100', className)} {...props} />
);

const DialogTitle = ({ className, ...props }) => (
  <TitlePrimitive className={cn('text-base font-bold text-slate-900', className)} {...props} />
);
const DialogDescription = ({ className, ...props }) => (
  <DescriptionPrimitive className={cn('text-xs text-slate-500 mt-0.5', className)} {...props} />
);

export {
  Dialog, DialogPortal, DialogOverlay, DialogTrigger, DialogClose,
  DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
};
