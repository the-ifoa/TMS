import { NavLink, useNavigate } from 'react-router-dom';
import logoImg from '../assets/logo.png';
import {
  HiOutlineHome,
  HiOutlineUsers,
  HiOutlineUserCircle,
  HiOutlinePlusCircle,
  HiOutlineOfficeBuilding,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineClipboardList,
  HiOutlineClipboardCheck,
  HiOutlineDocumentText,
  HiOutlineShieldExclamation,
} from 'react-icons/hi';
import { useAuth } from '../context/AuthContext';

const adminNavigation = [
  { name: 'Dashboard',    href: '/admin',                  icon: HiOutlineHome },
  { name: 'Airlines',     href: '/admin/airlines',         icon: HiOutlineOfficeBuilding },
  { name: 'Contracts',    href: '/admin/contracts',        icon: HiOutlineDocumentText },
  { name: 'Attendance',   href: '/admin/attendance',       icon: HiOutlineClipboardCheck },
  { name: 'Exam Results', href: '/admin/exam-results',     icon: HiOutlineClipboardList },
  { name: 'DGR CBTA',     href: '/admin/dgr',              icon: HiOutlineShieldExclamation },
  { name: 'Profile',      href: '/admin/profile',          icon: HiOutlineUserCircle },
];

const airlineNavigation = [
  { name: 'Dashboard',      href: '/airline',               icon: HiOutlineHome,       exact: true  },
  { name: 'My Submissions', href: '/airline/submissions',   icon: HiOutlineUsers,      exact: true  },
  { name: 'New Enrollment', href: '/airline/enrollment/new', icon: HiOutlinePlusCircle, exact: true  },
  { name: 'DGR CBTA',       href: '/airline/dgr',           icon: HiOutlineShieldExclamation, exact: true },
  { name: 'Profile',        href: '/airline/profile',       icon: HiOutlineUserCircle, exact: false },
];

export default function Sidebar({ open, setOpen }) {
  const navigate = useNavigate();
  const { isAdmin, admin } = useAuth();
  const navigation = isAdmin ? adminNavigation : airlineNavigation;

  return (
    <aside
      className={[
        'fixed inset-y-0 left-0 z-30',
        'lg:static lg:z-auto lg:translate-x-0',
        'flex flex-col bg-white border-r border-gray-200 shadow-sm',
        'sidebar-transition',
        open ? 'w-64 translate-x-0' : 'lg:w-16 -translate-x-full lg:translate-x-0',
      ].join(' ')}
    >
      {/* ── Header: logo + collapse toggle ── */}
      <div
        className={[
          'flex items-center h-16 px-3 border-b border-gray-200 flex-shrink-0',
          open ? 'justify-between' : 'justify-center',
        ].join(' ')}
      >
        {open && (
          <button onClick={() => navigate('/')} className="flex items-center gap-2 min-w-0 flex-1">
            <img src={logoImg} alt="IFOA" className="h-8 w-auto max-w-[80px] object-contain flex-shrink-0" />
            <span className="text-[11px] font-medium text-primary-400 truncate">
              {isAdmin ? 'Training Management' : 'Airline Portal'}
            </span>
          </button>
        )}

        {/* Collapse / expand arrow — desktop only */}
        <button
          onClick={() => setOpen(!open)}
          className="hidden lg:flex p-1.5 rounded-lg hover:bg-gray-100 text-primary-400 transition-colors flex-shrink-0"
          title={open ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {open
            ? <HiOutlineChevronLeft className="w-4 h-4" />
            : <HiOutlineChevronRight className="w-4 h-4" />
          }
        </button>

        {/* Mobile close arrow */}
        {open && (
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 text-primary-400 transition-colors flex-shrink-0"
          >
            <HiOutlineChevronLeft className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {/* Section label — only when sidebar is open */}
        {open && (
          <p className="text-[10px] font-semibold text-primary-400 uppercase tracking-wider px-2 pb-1">
            {isAdmin ? 'Navigation' : 'My Portal'}
          </p>
        )}

        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            end={item.exact !== false}
            onClick={() => { if (window.innerWidth < 1024) setOpen(false); }}
            title={!open ? item.name : undefined}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150',
                !open ? 'justify-center' : '',
                isActive
                  ? 'bg-blue-50 font-semibold'
                  : 'text-primary-500 hover:bg-gray-100 hover:text-primary-800',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className="w-5 h-5 flex-shrink-0"
                  style={{ color: isActive ? '#0000ff' : undefined }}
                />
                {open && (
                  <span
                    className="text-sm font-medium truncate"
                    style={{ color: isActive ? '#0000ff' : undefined }}
                  >
                    {item.name}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── Footer ── */}
      <div className="p-3 border-t border-gray-200 flex-shrink-0">
        {open ? (
          <div className="rounded-lg p-3 bg-gray-50 border border-gray-100">
            <p className="text-xs font-semibold text-primary-700">IFOA v1.0</p>
            <p className="text-[10px] text-primary-400 mt-0.5">
              {isAdmin ? 'Administrator' : 'Airline User'}
            </p>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center">
              <span className="text-[9px] font-bold text-primary-400">v1</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
