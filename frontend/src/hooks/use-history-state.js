import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// useState that belongs to the current history entry. Going Back / Forward to a
// page restores what the user had (search, filters, open item); arriving by a
// fresh navigation starts clean. Values must be JSON-serialisable.
//   const [search, setSearch] = useHistoryState('search', '');
export function useHistoryState(name, initial) {
  const { key, pathname } = useLocation();
  const storageKey = `view:${key}:${pathname}:${name}`;
  const [value, setValue] = useState(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw !== null) return JSON.parse(raw);
    } catch { /* ignore */ }
    return typeof initial === 'function' ? initial() : initial;
  });
  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* ignore */ }
  }, [storageKey, value]);
  return [value, setValue];
}

// "Back" that really goes to the previous page. Falls back to `fallback` only
// when there is no earlier page in this tab (opened from a link / refresh).
export function useBack(fallback) {
  const navigate = useNavigate();
  return useCallback(() => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, fallback]);
}
