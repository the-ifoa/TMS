import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import logoImg from '../assets/logo.png';
import {
  HiOutlineBell,
  HiOutlineUserCircle,
  HiOutlineCog,
  HiOutlineMenu,
  HiOutlineHome,
  HiOutlineCheckCircle,
  HiOutlineDocumentText,
  HiOutlineUserAdd,
  HiOutlineLogout,
  HiOutlineAcademicCap,
  HiOutlineCalendar,
  HiOutlineLocationMarker,
  HiOutlineClock,
  HiOutlineShieldExclamation,
} from 'react-icons/hi';
import { FaPlaneDeparture } from 'react-icons/fa';
import { getNotifications } from '../api';
import { useAuth } from '../context/AuthContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { SimpleTooltip } from '@/components/ui/tooltip';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';


// Notification type → icon + colour config
const NOTIF_CONFIG = {
  certificate: { icon: HiOutlineDocumentText,  color: 'text-emerald-500', bg: 'bg-emerald-50' },
  participant:  { icon: HiOutlineUserAdd,        color: 'text-blue-500',    bg: 'bg-blue-50'    },
  score:        { icon: HiOutlineCheckCircle,    color: 'text-amber-500',   bg: 'bg-amber-50'   },
  airline:      { icon: FaPlaneDeparture, color: 'text-violet-500',  bg: 'bg-violet-50'  },
  pending:      { icon: HiOutlineClock,          color: 'text-orange-500',  bg: 'bg-orange-50'  },
  dgr:          { icon: HiOutlineShieldExclamation, color: 'text-red-500',  bg: 'bg-red-50'     },
  exam:         { icon: HiOutlineAcademicCap,    color: 'text-indigo-500',  bg: 'bg-indigo-50'  },
};

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export default function Header({ sidebarOpen, setSidebarOpen }) {
  const { admin, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notifLoading, setNotifLoading] = useState(false);
  // Persist dismissed/read IDs in localStorage so they survive page refresh
  const storageKey = admin?.id ? `notif_read_${admin.id}` : null;
  const [readIds, setReadIdsState] = useState(() => {
    if (!storageKey) return new Set();
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const setReadIds = (updater) => {
    setReadIdsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (storageKey) {
        try { localStorage.setItem(storageKey, JSON.stringify([...next])); } catch {}
      }
      return next;
    });
  };
  const [bellRinging, setBellRinging] = useState(false);
  const navigate = useNavigate();

  const { isAdmin, isSubAdmin } = useAuth();
  // Secondary line under the user's name. Use the airline name — never
  // department_name here: that field is free text set by whoever created the
  // department and can hold anything (e.g. the creator's email). The account's
  // own email is shown on its own line below.
  const airlineSubLabel = admin?.airlineName || 'Airline User';
  const adminSubLabel   = isSubAdmin ? 'Sub-admin' : 'Administrator';
  const initials = admin?.name
    ? admin.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'AD';

  // Fetch notifications from backend
  const fetchNotifications = async () => {
    if (!admin) return;
    try {
      setNotifLoading(true);
      const res = await getNotifications();
      setNotifications(res.data || []);
    } catch {
      // silently fail
    } finally {
      setNotifLoading(false);
    }
  };

  // Load on mount + refresh every 60s
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [admin]);

  // These must be declared BEFORE any useEffect that references them
  const visibleNotifs = notifications.filter(n => !readIds.has(n.id));
  const unreadCount   = visibleNotifs.filter(n => !n.read).length;

  const markAllRead  = () => setReadIds(prev => new Set([...prev, ...notifications.map(n => n.id)]));
  const dismissNotif = (id) => setReadIds(prev => new Set([...prev, id]));

  const handleNotifClick = (notif) => {
    setReadIds(prev => new Set([...prev, notif.id]));
    setNotifOpen(false);
    if (notif.link) navigate(notif.link);
  };

  // Ring the bell every 12s when there are unread notifications and panel is closed
  useEffect(() => {
    if (unreadCount === 0 || notifOpen) return;
    const ringInterval = setInterval(() => {
      setBellRinging(true);
      setTimeout(() => setBellRinging(false), 700);
    }, 12000);
    setBellRinging(true);
    setTimeout(() => setBellRinging(false), 700);
    return () => clearInterval(ringInterval);
  }, [unreadCount, notifOpen]);

  const handleLogout = () => {
    setProfileOpen(false);
    logout();
    navigate('/login');
  };

  return (
    <header className="app-header sticky top-0 z-30 h-16 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 flex items-center justify-between px-4 sm:px-6 shadow-2xs flex-shrink-0">
      {/* Left side */}
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 max-w-[260px] xs:max-w-[320px] sm:max-w-md">
        {/* Hamburger — mobile only */}
        <SimpleTooltip label="Menu" side="bottom">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden p-2 rounded-xl hover:bg-slate-100 transition-colors flex-shrink-0"
          >
            <HiOutlineMenu className="w-5 h-5 text-slate-600" />
          </button>
        </SimpleTooltip>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Home link */}
        <SimpleTooltip label="Back to Home" side="bottom">
          <button
            onClick={() => navigate('/')}
            className="hidden sm:flex p-2 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <HiOutlineHome className="w-5 h-5 text-slate-500 hover:text-slate-800" />
          </button>
        </SimpleTooltip>

        {/* Notifications */}
        <Popover open={notifOpen} onOpenChange={(open) => { setNotifOpen(open); setProfileOpen(false); if (open) fetchNotifications(); }}>
          <PopoverTrigger asChild>
            <button className="relative p-2 rounded-xl hover:bg-slate-100 transition-colors focus:outline-none">
              <HiOutlineBell className={`w-5 h-5 text-slate-500 ${bellRinging ? 'bell-ring' : ''}`} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-blue-600 ring-2 ring-white rounded-full flex items-center justify-center shadow-xs">
                  <span className="text-[9px] font-bold text-white">{unreadCount > 9 ? '9+' : unreadCount}</span>
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={8} className="w-[calc(100vw-2rem)] sm:w-80 md:w-96 max-w-[calc(100vw-2rem)] p-0 z-50 overflow-hidden shadow-xl border border-slate-200/80 rounded-2xl bg-white">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-slate-800">Notifications</p>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.5 bg-slate-900 text-white text-[10px] font-bold rounded-full">{unreadCount}</span>
                )}
              </div>
              {unreadCount > 0 && (
                <button onClick={markAllRead}
                  className="text-[11px] font-semibold text-slate-700 hover:text-slate-900 transition-colors">
                  Mark all read
                </button>
              )}
            </div>

            {/* Body */}
            {notifLoading && visibleNotifs.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
                <div className="w-4 h-4 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                <span className="text-sm">Loading…</span>
              </div>
            ) : visibleNotifs.length === 0 ? (
              <div className="py-10 text-center">
                <HiOutlineBell className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">All caught up!</p>
                <p className="text-xs text-slate-400 mt-0.5">No new notifications</p>
              </div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-100">
                {visibleNotifs.map((notif) => {
                  const isRead = readIds.has(notif.id);
                  const cfg = NOTIF_CONFIG[notif.type] || { icon: HiOutlineBell, color: 'text-slate-500', bg: 'bg-slate-100' };
                  const Icon = cfg.icon;
                  return (
                    <button key={notif.id}
                      onClick={() => handleNotifClick(notif)}
                      className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-100/80 ${
                        isRead ? 'bg-white' : 'bg-slate-50/80'
                      }`}>
                      <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${cfg.bg}`}>
                        <Icon className={`w-4 h-4 ${cfg.color}`} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 leading-tight">{notif.title}</p>
                        <p className="text-xs text-slate-600 mt-0.5 leading-snug">{notif.message}</p>
                        <p className="text-[10px] text-slate-400 mt-1 font-medium">{timeAgo(notif.time)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Profile dropdown */}
        <DropdownMenu open={profileOpen} onOpenChange={(open) => { setProfileOpen(open); if (open) setNotifOpen(false); }}>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2.5 p-1 rounded-full hover:opacity-90 transition-all outline-none focus:outline-none cursor-pointer">
              {!isAdmin && admin?.logo_url ? (
                <img
                  src={admin.logo_url}
                  alt={admin.airlineName || 'Logo'}
                  className="h-8 max-h-8 sm:h-9 sm:max-h-9 w-auto max-w-[120px] object-contain flex-shrink-0"
                />
              ) : (
                <Avatar className="w-9 h-9 border border-slate-200/80 shadow-2xs flex-shrink-0">
                  <AvatarFallback className="bg-[#0B132B] text-white font-bold text-xs">
                    {!isAdmin && admin?.airlineName ? admin.airlineName.charAt(0).toUpperCase() : initials}
                  </AvatarFallback>
                </Avatar>
              )}
              <div className="hidden md:block text-left leading-tight">
                <p className="text-sm font-bold text-slate-900 leading-tight">
                  {isAdmin ? (admin?.name || 'Admin') : (admin?.name || admin?.airlineName || 'Airline')}
                </p>
                <p className="text-xs text-slate-500 font-normal mt-0.5">
                  {isAdmin ? adminSubLabel : airlineSubLabel}
                </p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 p-0 rounded-2xl bg-white shadow-xl border border-slate-100 overflow-hidden">
            {/* User Info Header */}
            <div className="px-5 py-4 space-y-0.5">
              <p className="text-base font-extrabold text-slate-900 leading-tight">
                {admin?.name || 'User'}
              </p>
              {!isAdmin && (
                <p className="text-xs font-semibold text-slate-700">
                  {airlineSubLabel}
                </p>
              )}
              {isAdmin && (
                <p className="text-xs font-semibold text-slate-700">
                  {adminSubLabel}
                </p>
              )}
              {admin?.email && (
                <p className="text-xs text-slate-400 font-normal truncate">
                  {admin.email}
                </p>
              )}
            </div>

            <div className="border-t border-slate-100" />

            {/* Menu Items */}
            <DropdownMenuItem
              onClick={() => navigate(isAdmin ? '/admin' : '/airline')}
              className="px-5 py-3.5 cursor-pointer text-slate-700 font-semibold text-sm flex items-center gap-3 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
            >
              <HiOutlineCog className="w-5 h-5 text-slate-600 flex-shrink-0" />
              <span>Dashboard</span>
            </DropdownMenuItem>

            <div className="border-t border-slate-100" />

            <DropdownMenuItem
              onClick={() => navigate(isAdmin ? '/admin/profile' : '/airline/profile')}
              className="px-5 py-3.5 cursor-pointer text-slate-700 font-semibold text-sm flex items-center gap-3 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
            >
              <HiOutlineUserCircle className="w-5 h-5 text-slate-600 flex-shrink-0" />
              <span>My Profile</span>
            </DropdownMenuItem>

            <div className="border-t border-slate-100" />

            <DropdownMenuItem
              onClick={handleLogout}
              className="px-5 py-3.5 cursor-pointer text-red-500 font-semibold text-sm flex items-center gap-3 hover:bg-red-50/40 focus:bg-red-50/40 focus:outline-none"
            >
              <HiOutlineLogout className="w-5 h-5 text-red-500 flex-shrink-0" />
              <span>Logout</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
