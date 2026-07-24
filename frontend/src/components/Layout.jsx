import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 1024);

  return (
    <div className="app-layout fixed inset-0 flex overflow-hidden bg-gray-50 text-slate-800">
      {sidebarOpen && (
        <div
          className="app-sidebar-overlay fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} />

      <div className="app-layout-main flex flex-col flex-1 overflow-hidden min-w-0 bg-gray-50">
        <Header sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
        <main className="flex-1 overflow-y-auto bg-gray-50 text-slate-800">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
