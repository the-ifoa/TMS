'use client';;
import * as React from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { AnimatePresence, motion } from 'motion/react';

import { useControlledState } from '@/hooks/use-controlled-state';
import { getStrictContext } from '@/lib/get-strict-context';

const [DialogProvider, useDialog] =
  getStrictContext('DialogContext');

function Dialog(props) {
  const [isOpen, setIsOpen] = useControlledState({
    value: props?.open,
    defaultValue: props?.defaultOpen,
    onChange: props?.onOpenChange,
  });

  return (
    <DialogProvider value={{ isOpen, setIsOpen }}>
      <DialogPrimitive.Root data-slot="dialog" {...props} onOpenChange={setIsOpen} />
    </DialogProvider>
  );
}

function DialogTrigger(props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal(props) {
  const { isOpen } = useDialog();

  return (
    <AnimatePresence>
      {isOpen && (
        <DialogPrimitive.Portal data-slot="dialog-portal" forceMount {...props} />
      )}
    </AnimatePresence>
  );
}

function DialogOverlay({
  transition = { duration: 0.2, ease: 'easeInOut' },
  ...props
}) {
  return (
    <DialogPrimitive.Overlay data-slot="dialog-overlay" asChild forceMount>
      <motion.div
        key="dialog-overlay"
        initial={{ opacity: 0, filter: 'blur(4px)' }}
        animate={{ opacity: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, filter: 'blur(4px)' }}
        transition={transition}
        {...props} />
    </DialogPrimitive.Overlay>
  );
}

function DialogContent({
  from = 'top',
  onOpenAutoFocus,
  onCloseAutoFocus,
  onEscapeKeyDown,
  onPointerDownOutside,
  onInteractOutside,
  transition = { type: 'spring', stiffness: 150, damping: 25 },
  ...props
}) {
  const initialRotation =
    from === 'bottom' || from === 'left' ? '20deg' : '-20deg';
  const isVertical = from === 'top' || from === 'bottom';
  const rotateAxis = isVertical ? 'rotateX' : 'rotateY';

  return (
    <DialogPrimitive.Content
      asChild
      forceMount
      onOpenAutoFocus={onOpenAutoFocus}
      onCloseAutoFocus={onCloseAutoFocus}
      onEscapeKeyDown={onEscapeKeyDown}
      onPointerDownOutside={onPointerDownOutside}
      onInteractOutside={onInteractOutside}>
      <motion.div
        key="dialog-content"
        data-slot="dialog-content"
        initial={{
          opacity: 0,
          filter: 'blur(4px)',
          transform: `perspective(500px) ${rotateAxis}(${initialRotation}) scale(0.8)`,
        }}
        animate={{
          opacity: 1,
          filter: 'blur(0px)',
          transform: `perspective(500px) ${rotateAxis}(0deg) scale(1)`,
        }}
        exit={{
          opacity: 0,
          filter: 'blur(4px)',
          transform: `perspective(500px) ${rotateAxis}(${initialRotation}) scale(0.8)`,
        }}
        transition={transition}
        {...props} />
    </DialogPrimitive.Content>
  );
}

function DialogClose(props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogHeader(props) {
  return <div data-slot="dialog-header" {...props} />;
}

function DialogFooter(props) {
  return <div data-slot="dialog-footer" {...props} />;
}

function DialogTitle(props) {
  return <DialogPrimitive.Title data-slot="dialog-title" {...props} />;
}

function DialogDescription(props) {
  return (<DialogPrimitive.Description data-slot="dialog-description" {...props} />);
}

export { Dialog, DialogPortal, DialogOverlay, DialogClose, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, useDialog };
