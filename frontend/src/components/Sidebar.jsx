import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import logoImg from '../assets/logo.png';
import {
  HiOutlineHome,
  HiOutlineUsers,
  HiOutlineUserCircle,
  HiOutlinePlusCircle,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineClipboardList,
  HiOutlineClipboardCheck,
  HiOutlineDocumentText,
  HiOutlineShieldExclamation,
  HiOutlineAcademicCap,
  HiOutlineLogout,
  HiOutlineCollection,
} from 'react-icons/hi';
import { FaPlaneDeparture } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import { SimpleTooltip } from '@/components/ui/tooltip';

const adminNavigation = [
  { name: 'Dashboard',    href: '/admin',                  icon: HiOutlineHome },
  { name: 'Airlines',     href: '/admin/airlines',         icon: FaPlaneDeparture },
  { name: 'Contracts',    href: '/admin/contracts',        icon: HiOutlineDocumentText },
  { name: 'Attendance',   href: '/admin/attendance',       icon: HiOutlineClipboardCheck },
  { name: 'Exam Results', href: '/admin/exam-results',     icon: HiOutlineClipboardList },
  { name: 'Exam System',  href: '/admin/exams',            icon: HiOutlineAcademicCap },
  { name: 'Question Bank', href: '/admin/question-bank',   icon: HiOutlineCollection },
  { name: 'DGR CBTA',     href: '/admin/dgr',              icon: HiOutlineShieldExclamation },
  { name: 'Profile',      href: '/admin/profile',          icon: HiOutlineUserCircle },
];

const airlineNavigation = [
  { name: 'Dashboard',      href: '/airline',               icon: HiOutlineHome },
  { name: 'My Submissions', href: '/airline/submissions',   icon: HiOutlineClipboardList },
  { name: 'Participants',   href: '/airline/participants',  icon: HiOutlineUsers },
  { name: 'New Enrollment', href: '/airline/enrollment/new', icon: HiOutlinePlusCircle },
  { name: 'DGR CBTA',       href: '/airline/dgr',           icon: HiOutlineShieldExclamation },
  { name: 'Exam System',    href: '/airline/exams',         icon: HiOutlineAcademicCap },
  { name: 'Profile',        href: '/airline/profile',       icon: HiOutlineUserCircle },
];

export default function Sidebar({ open, setOpen }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin } = useAuth();
  const navigation = isAdmin ? adminNavigation : airlineNavigation;

  const currentPath = location.pathname.replace(/\/$/, '');

  const isTabActive = (item) => {
    if (item.name === 'Dashboard') {
      return (
        currentPath === '/admin' ||
        currentPath === '/airline' ||
        currentPath === '/dashboard' ||
        currentPath === ''
      );
    }
    return currentPath === item.href || currentPath.startsWith(item.href + '/');
  };

  return (
    <aside
      className={[
        'app-sidebar',
        'fixed inset-y-0 left-0 z-50',
        'lg:static lg:z-auto lg:translate-x-0',
        'flex flex-col bg-white border-r border-slate-200/80 shadow-2xs',
        'sidebar-transition',
        open ? 'w-64 translate-x-0' : 'lg:w-16 -translate-x-full lg:translate-x-0',
      ].join(' ')}
    >
      {/* ── Header: logo + collapse toggle ── */}
      <div
        className={[
          'flex items-center h-16 px-4 border-b border-slate-200/80 flex-shrink-0 bg-white',
          open ? 'justify-between' : 'justify-center',
        ].join(' ')}
      >
        {open && (
          <button onClick={() => navigate('/')} className="flex items-center justify-start min-w-0 focus:outline-none">
            <img src={logoImg} alt="IFOA Logo" className="h-9 w-auto max-h-9 object-contain flex-shrink-0" />
          </button>
        )}

        {/* Collapse / expand arrow — desktop only */}
        <SimpleTooltip label={open ? 'Collapse sidebar' : 'Expand sidebar'} side="right">
          <button
            onClick={() => setOpen(!open)}
            className="hidden lg:flex p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors flex-shrink-0"
          >
            {open
              ? <HiOutlineChevronLeft className="w-4 h-4" />
              : <HiOutlineChevronRight className="w-4 h-4" />
            }
          </button>
        </SimpleTooltip>

        {/* Mobile close arrow */}
        {open && (
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors flex-shrink-0"
          >
            <HiOutlineChevronLeft className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 py-4 px-3 space-y-1.5 overflow-y-auto overflow-x-hidden">
        {/* Section label — only when sidebar is open */}
        {open && (
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 pb-2">
            {isAdmin ? 'Management Menu' : 'Airline Menu'}
          </p>
        )}

        {navigation.map((item) => {
          const active = isTabActive(item);
          return (
            <NavLink
              key={item.name}
              to={item.href}
              onClick={() => { if (window.innerWidth < 1024) setOpen(false); }}
              title={!open ? item.name : undefined}
              className={[
                'group flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-150 text-sm font-medium',
                !open ? 'justify-center' : '',
                active
                  ? 'bg-slate-900 text-white font-semibold shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900',
              ].join(' ')}
            >
              <item.icon
                className={`w-5 h-5 flex-shrink-0 transition-colors ${
                  active ? 'text-white' : 'text-slate-400 group-hover:text-slate-700'
                }`}
              />
              {open && (
                <span className="truncate">
                  {item.name}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* ── Footer Logout ── */}
      <div className="p-3 border-t border-slate-200/80 bg-white flex-shrink-0">
        {open ? (
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-50 hover:bg-rose-50 text-slate-700 hover:text-rose-600 border border-slate-200/80 hover:border-rose-200 transition-all text-xs font-bold group shadow-2xs"
          >
            <div className="flex items-center gap-2.5">
              <HiOutlineLogout className="w-4 h-4 text-slate-500 group-hover:text-rose-600 transition-colors" />
              <span>Logout</span>
            </div>
            <span className="text-[10px] font-semibold text-slate-400 group-hover:text-rose-500">
              {isAdmin ? 'Admin' : 'Airline'}
            </span>
          </button>
        ) : (
          <SimpleTooltip label="Logout" side="right">
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="w-full flex items-center justify-center p-2.5 rounded-xl bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200/80 transition-colors"
            >
              <HiOutlineLogout className="w-5 h-5" />
            </button>
          </SimpleTooltip>
        )}
      </div>
    </aside>
  );
}
