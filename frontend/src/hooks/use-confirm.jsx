import { useCallback, useRef, useState } from 'react';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';

// Drop-in async replacement for window.confirm(), backed by a shadcn AlertDialog.
// Usage: const { confirm, ConfirmDialog } = useConfirm();
//        if (!(await confirm('Delete this record?'))) return;
//        ...render {ConfirmDialog} once, anywhere in the component's JSX.
export function useConfirm() {
  const [state, setState] = useState({ open: false, message: '', title: 'Are you sure?', confirmLabel: 'Confirm', cancelLabel: 'Cancel' });
  const resolverRef = useRef(null);

  const confirm = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({
        open: true,
        message,
        title: opts.title || 'Are you sure?',
        confirmLabel: opts.confirmLabel || 'Confirm',
        cancelLabel: opts.cancelLabel || 'Cancel',
      });
    });
  }, []);

  const settle = (result) => {
    setState((s) => ({ ...s, open: false }));
    resolverRef.current?.(result);
    resolverRef.current = null;
  };

  const ConfirmDialog = (
    <AlertDialog open={state.open} onOpenChange={(open) => !open && settle(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state.title}</AlertDialogTitle>
          <AlertDialogDescription>{state.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>{state.cancelLabel}</AlertDialogCancel>
          <AlertDialogAction onClick={() => settle(true)}>{state.confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, ConfirmDialog };
}
