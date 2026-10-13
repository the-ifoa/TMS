import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 1024);
  const { pathname } = useLocation();

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
        <main className="flex-1 overflow-y-auto bg-slate-50 text-slate-800">
          {/* Keyed on the path so each page fades in when the route changes. */}
          <div key={pathname} className="page-enter min-h-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
