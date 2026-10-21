import { useCallback, useRef, useState } from 'react';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';

// Drop-in async replacement for window.confirm(), backed by a shadcn AlertDialog.
// Usage: const { confirm, ConfirmDialog } = useConfirm();
//        if (!(await confirm('Delete this record?'))) return;
//        ...render {ConfirmDialog} once, anywhere in the component's JSX.
// Optional opts.checkbox = { label, hint, required } adds an unticked checkbox;
// confirm then resolves to { checked } (still truthy) instead of true.
// `required` keeps the confirm button disabled until it is ticked.
export function useConfirm() {
  const [state, setState] = useState({ open: false, message: '', title: 'Are you sure?', confirmLabel: 'Confirm', cancelLabel: 'Cancel', checkbox: null });
  const [checked, setChecked] = useState(false);
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
        checkbox: opts.checkbox || null,
      });
      setChecked(false);
    });
  }, []);

  const settle = (result) => {
    setState((s) => ({ ...s, open: false }));
    resolverRef.current?.(result && state.checkbox ? { checked } : result);
    resolverRef.current = null;
  };

  const ConfirmDialog = (
    <AlertDialog open={state.open} onOpenChange={(open) => !open && settle(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state.title}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line">{state.message}</AlertDialogDescription>
        </AlertDialogHeader>
        {state.checkbox && (
          <label className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/60 p-3 cursor-pointer">
            <Checkbox checked={checked} onCheckedChange={(v) => setChecked(!!v)} className="mt-0.5 flex-shrink-0" />
            <span className="text-sm">
              <span className="font-semibold text-rose-700">{state.checkbox.label}</span>
              {state.checkbox.hint && <span className="block text-xs text-slate-600 mt-0.5">{state.checkbox.hint}</span>}
            </span>
          </label>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>{state.cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!!state.checkbox?.required && !checked}
            className={state.checkbox && checked ? 'bg-rose-600 hover:bg-rose-700' : undefined}
            onClick={() => settle(true)}
          >
            {state.checkbox && checked ? (state.checkbox.confirmLabel || state.confirmLabel) : state.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, ConfirmDialog };
}
