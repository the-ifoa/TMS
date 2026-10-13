'use client';;
import * as React from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';
import { AnimatePresence, motion, useMotionValue, useSpring } from 'motion/react';

import { getStrictContext } from '@/lib/get-strict-context';
import { useControlledState } from '@/hooks/use-controlled-state';

const [LocalTooltipProvider, useTooltip] =
  getStrictContext('TooltipContext');

function TooltipProvider(props) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" {...props} />;
}

function Tooltip({
  followCursor = false,
  followCursorSpringOptions = { stiffness: 200, damping: 17 },
  ...props
}) {
  const [isOpen, setIsOpen] = useControlledState({
    value: props?.open,
    defaultValue: props?.defaultOpen,
    onChange: props?.onOpenChange,
  });
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  return (
    <LocalTooltipProvider
      value={{
        isOpen,
        setIsOpen,
        x,
        y,
        followCursor,
        followCursorSpringOptions,
      }}>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} onOpenChange={setIsOpen} />
    </LocalTooltipProvider>
  );
}

function TooltipTrigger({
  onMouseMove,
  ...props
}) {
  const { x, y, followCursor } = useTooltip();

  const handleMouseMove = (event) => {
    onMouseMove?.(event);

    const target = event.currentTarget.getBoundingClientRect();

    if (followCursor === 'x' || followCursor === true) {
      const eventOffsetX = event.clientX - target.left;
      const offsetXFromCenter = (eventOffsetX - target.width / 2) / 2;
      x.set(offsetXFromCenter);
    }

    if (followCursor === 'y' || followCursor === true) {
      const eventOffsetY = event.clientY - target.top;
      const offsetYFromCenter = (eventOffsetY - target.height / 2) / 2;
      y.set(offsetYFromCenter);
    }
  };

  return (<TooltipPrimitive.Trigger data-slot="tooltip-trigger" onMouseMove={handleMouseMove} {...props} />);
}

function TooltipPortal(props) {
  const { isOpen } = useTooltip();

  return (
    <AnimatePresence>
      {isOpen && (
        <TooltipPrimitive.Portal forceMount data-slot="tooltip-portal" {...props} />
      )}
    </AnimatePresence>
  );
}

function TooltipContent({
  onEscapeKeyDown,
  onPointerDownOutside,
  side,
  sideOffset,
  align,
  alignOffset,
  avoidCollisions,
  collisionBoundary,
  collisionPadding,
  arrowPadding,
  sticky,
  hideWhenDetached,
  style,
  transition = { type: 'spring', stiffness: 300, damping: 25 },
  ...props
}) {
  const { x, y, followCursor, followCursorSpringOptions } = useTooltip();
  const translateX = useSpring(x, followCursorSpringOptions);
  const translateY = useSpring(y, followCursorSpringOptions);

  return (
    <TooltipPrimitive.Content
      asChild
      forceMount
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      avoidCollisions={avoidCollisions}
      collisionBoundary={collisionBoundary}
      collisionPadding={collisionPadding}
      arrowPadding={arrowPadding}
      sticky={sticky}
      hideWhenDetached={hideWhenDetached}
      onEscapeKeyDown={onEscapeKeyDown}
      onPointerDownOutside={onPointerDownOutside}>
      <motion.div
        key="popover-content"
        data-slot="popover-content"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.5 }}
        transition={transition}
        style={{
          x:
            followCursor === 'x' || followCursor === true
              ? translateX
              : undefined,
          y:
            followCursor === 'y' || followCursor === true
              ? translateY
              : undefined,
          ...style,
        }}
        {...props} />
    </TooltipPrimitive.Content>
  );
}

function TooltipArrow(props) {
  return <TooltipPrimitive.Arrow data-slot="tooltip-arrow" {...props} />;
}

export { TooltipProvider, Tooltip, TooltipTrigger, TooltipPortal, TooltipContent, TooltipArrow, useTooltip };
