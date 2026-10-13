import { useLayoutEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigationType } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 1024);
  const { pathname, key } = useLocation();
  const navType = useNavigationType();
  const mainRef = useRef(null);

  // Going Back / Forward returns to where the user was scrolled on that page;
  // opening a page fresh starts at the top. Page data loads after mount, so the
  // saved position is re-applied until the content is tall enough to reach it.
  const lastPath = useRef(pathname);
  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return undefined;
    const samePage = lastPath.current === pathname;
    lastPath.current = pathname;
    let saved = 0;
    if (navType === 'POP') {
      try { saved = Number(sessionStorage.getItem(`scroll:${key}`)) || 0; } catch { /* ignore */ }
    } else if (samePage) {
      return undefined; // only the query string changed: leave the scroll alone
    }
    el.scrollTop = saved;
    if (!saved) return undefined;
    let tries = 0;
    const stop = () => clearInterval(timer);
    const timer = setInterval(() => {
      el.scrollTop = saved;
      if (Math.abs(el.scrollTop - saved) < 2 || ++tries >= 25) stop();
    }, 100);
    // The user taking over wins immediately.
    el.addEventListener('wheel', stop, { passive: true, once: true });
    el.addEventListener('touchstart', stop, { passive: true, once: true });
    return () => { stop(); el.removeEventListener('wheel', stop); el.removeEventListener('touchstart', stop); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const rememberScroll = (e) => {
    try { sessionStorage.setItem(`scroll:${key}`, String(e.currentTarget.scrollTop)); } catch { /* ignore */ }
  };

  return (
    <div className="app-layout fixed inset-0 flex overflow-hidden bg-slate-50 text-slate-800">
      {sidebarOpen && (
        <div
          className="app-sidebar-overlay fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} />

      <div className="app-layout-main flex flex-col flex-1 overflow-hidden min-w-0 bg-slate-50">
        <Header sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
        <main ref={mainRef} onScroll={rememberScroll} className="flex-1 overflow-y-auto overflow-x-hidden bg-slate-50 text-slate-800">
          {/* Keyed on the path so each page fades in when the route changes. */}
          <div key={pathname} className="page-enter min-h-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
