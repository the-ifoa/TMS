import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import logoImg from '../assets/logo.png';
import {
  HiOutlineBell,
  HiOutlineSearch,
  HiOutlineUserCircle,
  HiOutlineCog,
  HiOutlineMenu,
  HiOutlineX,
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
import { getParticipants, getNotifications } from '../api';
import { useAuth } from '../context/AuthContext';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { SimpleTooltip } from '@/components/ui/tooltip';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

function fmtDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Full detail modal shown when a search result is clicked ─────────────────────────
function ParticipantDetailModal({ record, onClose }) {
  if (!record) return null;
  const ini = (name = '') => name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const rows = [
    { label: 'Full Name',      value: record.participant_name },
    { label: 'Airline',        value: record.company },
    { label: 'Department',     value: record.department },
    { label: 'Training Type',  value: record.training_type },
    { label: 'Start Date',     value: fmtDate(record.training_date) },
    { label: 'End Date',       value: record.end_date ? fmtDate(record.end_date) : '—' },
    { label: 'Location',       value: record.online_synchronous ? 'Online Synchronous' : (record.location || '—') },
    { label: 'NDG Subtype',    value: record.training_type === 'NDG' ? (record.ndg_subtype === 'R' ? 'Recurrent' : 'Initial') : null },
    { label: 'NDG Score',      value: record.training_type === 'NDG' && record.ndg_score != null ? `${record.ndg_score}%` : null },
    { label: 'Modules',        value: record.modules || null },
    { label: 'Certificate No', value: record.cert_sequence ? `${record.training_type}-${String(record.cert_sequence).padStart(5,'0')}` : 'Not yet generated' },
    { label: 'Status',         value: record.locked ? 'Locked' : 'Draft' },
  ].filter(r => r.value !== null && r.value !== undefined);

  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed -inset-20 z-[100] bg-black/50 backdrop-blur-sm pointer-events-none"
      />
      <div
        key="layout"
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-4 px-5 py-4 border-b border-slate-100">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-slate-600">{ini(record.participant_name)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-slate-800 truncate">{record.participant_name}</h2>
              <p className="text-xs text-slate-400 mt-0.5">{record.company} · {record.department}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 flex-shrink-0">
              <HiOutlineX className="w-5 h-5" />
            </button>
          </div>
          {/* Details */}
          <div className="px-5 py-4 space-y-0 max-h-[55vh] overflow-y-auto">
            {rows.map(({ label, value }) => (
              <div key={label} className="flex items-start justify-between gap-4 py-2.5 border-b border-slate-50 last:border-0">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex-shrink-0 w-28">{label}</span>
                <span className="text-sm text-slate-800 text-right break-words max-w-[200px]">{value}</span>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 bg-slate-50/50 border-t border-slate-100 flex justify-end">
            <button onClick={onClose} className="btn-primary text-sm">Close</button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}


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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null); // clicked participant detail
  const searchRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const debounceRef = useRef(null);

  const { isAdmin, isSubAdmin } = useAuth();
  // Secondary line under the user's name: prioritise department, then airline.
  const airlineSubLabel = admin?.department_name || admin?.airlineName || 'Airline User';
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

  useEffect(() => {
    function handleClickOutside(event) {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close search dropdown on navigation
  useEffect(() => {
    setSearchOpen(false);
    setSearchQuery('');
  }, [location.pathname]);

  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await getParticipants({ search: query.trim() });
        setSearchResults(res.data.slice(0, 8));
        setSearchOpen(true);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      const base = isAdmin ? '/admin/participants' : '/airline/submissions';
      navigate(`${base}?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
    }
  };

  const handleResultClick = (record) => {
    setDetailRecord(record);   // open detail modal — no navigation
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
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

        {/* Search */}
        {location.pathname !== '/airline/enrollment/new' && location.pathname !== '/admin/participants/add' && (
        <div className="relative flex-1 min-w-0" ref={searchRef}>
          <form onSubmit={handleSearchSubmit}>
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search participants…"
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
              className="w-full pl-9 pr-7 py-1.5 bg-slate-50 border border-slate-200/90 rounded-xl text-xs sm:text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition-all truncate"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setSearchOpen(false); setSearchResults([]); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-slate-200/60 transition-colors"
              >
                <HiOutlineX className="w-3.5 h-3.5 text-slate-400" />
              </button>
            )}
          </form>

          {/* Search results dropdown */}
          {searchOpen && (
            <div className="absolute top-full left-0 mt-2 w-[calc(100vw-2rem)] sm:w-80 md:w-96 bg-white rounded-2xl border border-slate-200/80 shadow-2xl z-50 overflow-hidden animate-fade-in">
              {searching ? (
                <div className="p-4 flex items-center gap-2 text-slate-400">
                  <div className="w-4 h-4 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
                  <span className="text-sm">Searching...</span>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="p-4 text-sm text-slate-400 text-center">
                  No results found for "{searchQuery}"
                </div>
              ) : (
                <>
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {searchResults.map((record) => (
                    <button
                      key={record.id}
                      onClick={() => handleResultClick(record)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left border-b border-slate-50 last:border-0"
                    >
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-bold text-slate-700">
                          {record.participant_name.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{record.participant_name}</p>
                        <p className="text-[11px] text-slate-400">{record.company} &middot; {record.training_type}</p>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
        )}
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
                <span className="absolute top-1 right-1 w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center shadow-xs">
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
                  <span className="px-1.5 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded-full">{unreadCount}</span>
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
              <Avatar className="w-9 h-9">
                {!isAdmin && admin?.logo_url && <AvatarImage src={admin.logo_url} alt={admin.airlineName} />}
                <AvatarFallback className="bg-[#0B132B] text-white font-bold text-xs">
                  {!isAdmin && admin?.airlineName ? admin.airlineName.charAt(0).toUpperCase() : initials}
                </AvatarFallback>
              </Avatar>
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
      <ParticipantDetailModal record={detailRecord} onClose={() => setDetailRecord(null)} />
    </header>
  );
}
