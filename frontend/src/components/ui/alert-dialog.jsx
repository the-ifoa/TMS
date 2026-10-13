import * as React from 'react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogTrigger, AlertDialogPortal,
  AlertDialogOverlay as OverlayPrimitive, AlertDialogContent as ContentPrimitive,
  AlertDialogTitle as TitlePrimitive, AlertDialogDescription as DescriptionPrimitive,
  AlertDialogAction as ActionPrimitive, AlertDialogCancel as CancelPrimitive,
} from '@/components/animate-ui/primitives/radix/alert-dialog';

// Confirm dialog, animated by Animate UI. Same API as the shadcn one it replaced.
const AlertDialogOverlay = ({ className, ...props }) => (
  <OverlayPrimitive className={cn('fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs', className)} {...props} />
);

// Centred by a flex wrapper — the panel animates its own `transform`.
const AlertDialogContent = ({ className, ...props }) => (
  <AlertDialogPortal>
    {/* Plain wrapper: Radix hands the portal's direct child a ref, which a
        function component can't take on React 18. */}
    <div>
    <AlertDialogOverlay />
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
      <ContentPrimitive
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        className={cn(
          'pointer-events-auto relative w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xl outline-none',
          className
        )}
        {...props}
      />
    </div>
    </div>
  </AlertDialogPortal>
);

const AlertDialogHeader = ({ className, ...props }) => (
  <div className={cn('flex flex-col gap-1.5 mb-4', className)} {...props} />
);
const AlertDialogFooter = ({ className, ...props }) => (
  <div className={cn('flex items-center justify-end gap-2 mt-5', className)} {...props} />
);

const AlertDialogTitle = ({ className, ...props }) => (
  <TitlePrimitive className={cn('text-base font-bold text-slate-900', className)} {...props} />
);
const AlertDialogDescription = ({ className, ...props }) => (
  <DescriptionPrimitive className={cn('text-sm text-slate-500 leading-relaxed whitespace-pre-line', className)} {...props} />
);
const AlertDialogAction = ({ className, ...props }) => (
  <ActionPrimitive className={cn(buttonVariants({ variant: 'destructive' }), className)} {...props} />
);
const AlertDialogCancel = ({ className, ...props }) => (
  <CancelPrimitive className={cn(buttonVariants({ variant: 'ghost' }), className)} {...props} />
);

export {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
};
