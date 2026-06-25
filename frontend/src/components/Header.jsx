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
  HiOutlineOfficeBuilding,
  HiOutlineCalendar,
  HiOutlineLocationMarker,
  HiOutlineClock,
} from 'react-icons/hi';
import { getParticipants, getNotifications } from '../api';
import { useAuth } from '../context/AuthContext';

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
          <div className="flex items-center gap-4 px-5 py-4 border-b border-primary-100">
            <div className="w-12 h-12 rounded-full bg-primary-200 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-primary-600">{ini(record.participant_name)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-primary-800 truncate">{record.participant_name}</h2>
              <p className="text-xs text-primary-400 mt-0.5">{record.company} · {record.department}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-primary-100 text-primary-400 flex-shrink-0">
              <HiOutlineX className="w-5 h-5" />
            </button>
          </div>
          {/* Details */}
          <div className="px-5 py-4 space-y-0 max-h-[55vh] overflow-y-auto">
            {rows.map(({ label, value }) => (
              <div key={label} className="flex items-start justify-between gap-4 py-2.5 border-b border-primary-50 last:border-0">
                <span className="text-xs font-semibold text-primary-400 uppercase tracking-wide flex-shrink-0 w-28">{label}</span>
                <span className="text-sm text-primary-800 text-right break-words max-w-[200px]">{value}</span>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 bg-primary-50/50 border-t border-primary-100 flex justify-end">
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
  airline:      { icon: HiOutlineOfficeBuilding, color: 'text-violet-500',  bg: 'bg-violet-50'  },
  pending:      { icon: HiOutlineClock,          color: 'text-orange-500',  bg: 'bg-orange-50'  },
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
  const profileRef = useRef(null);
  const notifRef = useRef(null);
  const searchRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const debounceRef = useRef(null);

  const { isAdmin } = useAuth();
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

  // Also refresh when bell is opened
  const handleNotifToggle = () => {
    setNotifOpen(o => !o);
    setProfileOpen(false);
    if (!notifOpen) fetchNotifications();
  };

  const handleLogout = () => {
    setProfileOpen(false);
    logout();
    navigate('/login');
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setNotifOpen(false);
      }
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
    <header className="h-16 bg-white border-b border-primary-200 flex items-center justify-between px-4 sm:px-6 shadow-sm flex-shrink-0">
      {/* Left side */}
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only (desktop uses sidebar's own collapse arrow) */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="lg:hidden p-2 rounded-lg hover:bg-primary-100 transition-colors flex-shrink-0"
        >
          <HiOutlineMenu className="w-5 h-5 text-primary-600" />
        </button>
        {/* Search — hidden on new enrollment page, visible everywhere else */}
        {location.pathname !== '/airline/enrollment/new' && location.pathname !== '/admin/participants/add' && (
        <div className="relative" ref={searchRef}>
          <form onSubmit={handleSearchSubmit}>
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
            <input
              type="text"
              placeholder="Search participants..."
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
              className="pl-10 pr-4 py-2 w-32 sm:w-44 md:w-64 bg-primary-50 border border-primary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setSearchOpen(false); setSearchResults([]); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-primary-200 transition-colors"
              >
                <HiOutlineX className="w-3.5 h-3.5 text-primary-400" />
              </button>
            )}
          </form>

          {/* Search results dropdown */}
          {searchOpen && (
            <div className="absolute top-full left-0 mt-2 w-[calc(100vw-2rem)] sm:w-80 md:w-96 bg-white rounded-xl border border-primary-200 shadow-xl z-50 overflow-hidden animate-fade-in">
              {searching ? (
                <div className="p-4 flex items-center gap-2 text-primary-400">
                  <div className="w-4 h-4 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
                  <span className="text-sm">Searching...</span>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="p-4 text-sm text-primary-400 text-center">
                  No results found for "{searchQuery}"
                </div>
              ) : (
                <>
                  <div className="px-3 py-2 bg-primary-50 border-b border-primary-100">
                    <p className="text-[10px] font-semibold text-primary-400 uppercase tracking-wider">
                      {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {searchResults.map((record) => (
                    <button
                      key={record.id}
                      onClick={() => handleResultClick(record)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-primary-50 transition-colors text-left border-b border-primary-50 last:border-0"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary-200 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-semibold text-primary-600">
                          {record.participant_name.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-primary-800 truncate">{record.participant_name}</p>
                        <p className="text-[11px] text-primary-400">{record.company} &middot; {record.training_type}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        record.training_type === 'Recurrent'
                          ? 'bg-violet-100 text-violet-700'
                          : record.training_type === 'Human Factors'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {record.training_type}
                      </span>
                    </button>
                  ))}
                  <div className="px-4 py-2 bg-primary-50 text-[10px] text-primary-400 text-center">
                    Click a result to view full details
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        )} {/* end search hide conditional */}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Home link — hidden on xs */}
        <button
          onClick={() => navigate('/')}
          className="hidden sm:flex p-2 rounded-lg hover:bg-primary-100 transition-colors"
          title="Back to Home"
        >
          <HiOutlineHome className="w-5 h-5 text-primary-500" />
        </button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={handleNotifToggle}
            className="relative p-2 rounded-lg hover:bg-primary-100 transition-colors"
          >
            <HiOutlineBell className={`w-5 h-5 text-primary-500 ${bellRinging ? 'bell-ring' : ''}`} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-[9px] font-bold text-white">{unreadCount > 9 ? '9+' : unreadCount}</span>
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="fixed inset-x-2 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 md:w-96 bg-white rounded-2xl border border-primary-100 shadow-2xl z-50 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-primary-100 bg-primary-50/50">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-primary-800">Notifications</p>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 bg-blue-500 text-white text-[10px] font-bold rounded-full">{unreadCount}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button onClick={markAllRead}
                      className="text-[11px] font-medium text-accent-600 hover:text-accent-700 transition-colors">
                      Mark all read
                    </button>
                  )}
                  <button onClick={() => { fetchNotifications(); }}
                    className="p-1 rounded hover:bg-primary-100 transition-colors" title="Refresh">
                    <svg className={`w-3.5 h-3.5 text-primary-400 ${notifLoading ? 'animate-spin' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Body */}
              {notifLoading && visibleNotifs.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-10 text-primary-400">
                  <div className="w-4 h-4 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
                  <span className="text-sm">Loading…</span>
                </div>
              ) : visibleNotifs.length === 0 ? (
                <div className="py-10 text-center">
                  <HiOutlineBell className="w-8 h-8 text-primary-200 mx-auto mb-2" />
                  <p className="text-sm text-primary-400">All caught up!</p>
                  <p className="text-xs text-primary-300 mt-0.5">No new notifications</p>
                </div>
              ) : (
                <div className="max-h-[420px] overflow-y-auto divide-y divide-primary-50">
                  {visibleNotifs.map((notif) => {
                    const cfg = NOTIF_CONFIG[notif.type] || NOTIF_CONFIG.participant;
                    const Icon = cfg.icon;
                    const isRead = readIds.has(notif.id);
                    const handleNotifClick = () => {
                      dismissNotif(notif.id);
                      setNotifOpen(false);
                      if (notif.link) navigate(notif.link);
                    };
                    return (
                      <div key={notif.id}
                        onClick={notif.link ? handleNotifClick : undefined}
                        role={notif.link ? 'button' : undefined}
                        tabIndex={notif.link ? 0 : undefined}
                        onKeyDown={notif.link ? (e) => e.key === 'Enter' && handleNotifClick() : undefined}
                        className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                          isRead ? 'bg-white' : 'bg-blue-50/30'
                        } ${notif.link ? 'cursor-pointer hover:bg-primary-50' : ''}`}>
                        {/* Icon badge */}
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${cfg.bg}`}>
                          <Icon className={`w-4 h-4 ${cfg.color}`} />
                        </div>
                        {/* Text */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold text-primary-700 leading-tight">{notif.title}</p>
                          </div>
                          <p className="text-xs text-primary-600 mt-0.5 leading-snug">{notif.message}</p>
                          <p className="text-[10px] text-primary-400 mt-1">{timeAgo(notif.time)}</p>
                        </div>
                        {/* Dismiss */}
                        <button onClick={(e) => { e.stopPropagation(); dismissNotif(notif.id); }}
                          className="p-0.5 rounded hover:bg-primary-100 transition-colors flex-shrink-0 mt-0.5"
                          title="Dismiss">
                          <HiOutlineX className="w-3.5 h-3.5 text-primary-300 hover:text-primary-500" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Footer */}
              {visibleNotifs.length > 0 && (
                <div className="px-4 py-2.5 bg-primary-50/50 border-t border-primary-100 text-center">
                  <p className="text-[10px] text-primary-400">
                    {visibleNotifs.length} notification{visibleNotifs.length !== 1 ? 's' : ''}
                    {unreadCount > 0 ? ` · ${unreadCount} unread` : ' · all read'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Profile dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false); }}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-primary-100 transition-colors"
          >
            {/* Avatar — logo if uploaded, else blue gradient with letter/initials */}
            {!isAdmin && admin?.logo_url ? (
              <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex-shrink-0 overflow-hidden flex items-center justify-center shadow-sm">
                <img src={admin.logo_url} alt={admin.airlineName} className="w-full h-full object-contain p-0.5" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #0000ff 100%)' }}>
                <span className="text-white text-xs font-bold">
                  {!isAdmin && admin?.airlineName
                    ? admin.airlineName.charAt(0).toUpperCase()
                    : initials
                  }
                </span>
              </div>
            )}
            <div className="hidden md:block text-left">
              <p className="text-sm font-medium text-primary-800">
                {isAdmin ? (admin?.name || 'Admin') : (admin?.airlineName || admin?.name || 'Airline')}
              </p>
              <p className="text-[10px] text-primary-400">
                {isAdmin ? 'Administrator' : 'Airline User'}
              </p>
            </div>
          </button>

          {profileOpen && (
            <div className="fixed right-2 top-16 sm:absolute sm:right-0 sm:top-full sm:mt-2 w-52 bg-white rounded-xl border border-primary-200 shadow-lg py-2 z-50 animate-fade-in">
              <div className="px-4 py-3 border-b border-primary-100">
                <p className="text-sm font-semibold text-primary-800">{admin?.name || 'Admin'}</p>
                {!isAdmin && admin?.airlineName && (
                  <p className="text-[10px] font-semibold text-accent-600 mt-0.5">{admin.airlineName}</p>
                )}
                <p className="text-xs text-primary-400">{admin?.email || ''}</p>
              </div>
              <button
                onClick={() => { setProfileOpen(false); navigate(isAdmin ? '/admin/profile' : '/airline/profile'); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-primary-600 hover:bg-primary-50 transition-colors"
              >
                <HiOutlineUserCircle className="w-4 h-4" />
                My Profile
              </button>
              <button
                onClick={() => { setProfileOpen(false); navigate(isAdmin ? '/admin' : '/airline'); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-primary-600 hover:bg-primary-50 transition-colors"
              >
                <HiOutlineCog className="w-4 h-4" />
                Dashboard
              </button>
              <div className="border-t border-primary-100 mt-1 pt-1">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <HiOutlineLogout className="w-4 h-4" />
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Participant detail modal — opens when a search result is clicked */}
      <ParticipantDetailModal record={detailRecord} onClose={() => setDetailRecord(null)} />
    </header>
  );
}
