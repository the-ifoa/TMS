import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useState } from 'react';
import {
  HiOutlineDocumentText,
  HiOutlineUsers,
  HiOutlineShieldCheck,
  HiOutlineLightningBolt,
  HiOutlineArrowRight,
  HiOutlineAcademicCap,
  HiOutlineGlobe,
  HiOutlineMenu,
  HiOutlineX,
  HiOutlineLogout,
  HiOutlineChevronDown,
  HiOutlineUserCircle,
  HiOutlineCog,
  HiOutlineBell,
} from 'react-icons/hi';
import { useAuth } from '../context/AuthContext';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import logoImg from '../assets/logo.png';

/* ── Wave Animation Text Component ── */
function WaveText({ text, className = '', colorClass = '', baseDelay = 0, letterStagger = 0.035 }) {
  const words = text.split(' ');
  return (
    <span className={`inline-flex flex-wrap justify-center ${className}`}>
      {words.map((word, wordIndex) => {
        const charOffset = words.slice(0, wordIndex).reduce((sum, w) => sum + w.length, 0);
        return (
          <span key={wordIndex} className="inline-flex overflow-hidden pt-1 pb-3 sm:pb-5 -mb-3 sm:-mb-5 mr-[0.22em] last:mr-0">
            {word.split('').map((char, charIndex) => {
              const overallIndex = charOffset + charIndex;
              const delay = baseDelay + overallIndex * letterStagger;
              return (
                <motion.span
                  key={charIndex}
                  initial={{ y: '110%', opacity: 0, scale: 0.85 }}
                  animate={{ y: '0%', opacity: 1, scale: 1 }}
                  transition={{
                    duration: 0.55,
                    delay: delay,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className={`inline-block origin-bottom ${colorClass}`}
                >
                  {char}
                </motion.span>
              );
            })}
          </span>
        );
      })}
    </span>
  );
}

/* ── Animation Variants ── */
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 1, 0.5, 1] } },
};

const scrollFadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 1, 0.5, 1] },
  },
};

const containerStagger = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemReveal = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.25, 1, 0.5, 1] },
  },
};

/* ── Data Configs ── */
const features = [
  { icon: HiOutlineUsers, title: 'Participant Management', desc: 'Add, edit and manage training participant records with full CRUD operations.' },
  { icon: HiOutlineDocumentText, title: 'Certificate Generation', desc: 'Generate professional PDF certificates from official IFOA-approved templates instantly.' },
  { icon: HiOutlineAcademicCap, title: 'Training Modules', desc: 'Track completed training modules for recurrent dispatcher certification.' },
  { icon: HiOutlineLightningBolt, title: 'Instant Processing', desc: 'Generate certificates in seconds with automatic data population and smart templates.' },
  { icon: HiOutlineShieldCheck, title: 'Regulation Compliant', desc: 'Certificates comply with ICAO Doc 10106, Doc 9868, and international aviation training standards.' },
  { icon: HiOutlineGlobe, title: 'Multi-Type Training', desc: 'Supports FDI, FDR, FDA, FTL, NDG, HF, GD and TCD training types out-of-the-box.' },
];

const stats = [
  { value: '8', label: 'Training Types', sub: 'Fully supported' },
  { value: '12', label: 'Modules', sub: 'Per training type' },
  { value: 'ICAO', label: 'Reg. Compliant', sub: 'Doc 10106 & 9868' },
  { value: 'PDF', label: 'Export', sub: 'One-click generation' },
];

export default function LandingPage() {
  const { admin, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const initials = admin?.name
    ? admin.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'AD';
  const profileLabel = isAdmin ? (admin?.name || 'Admin') : (admin?.airlineName || admin?.name || 'Airline');
  const profileSublabel = isAdmin ? 'Administrator' : 'Airline User';
  const dashboardPath = isAdmin ? '/admin' : '/airline';

  function handleLogout() {
    logout();
    navigate('/');
    setMobileMenuOpen(false);
  }

  return (
    <div className="min-h-screen bg-white overflow-x-hidden font-sans text-slate-800">

      {/* ══════════════ NAVBAR ══════════════ */}
      <motion.nav
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-2xs"
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 flex-shrink-0">
            <img src={logoImg} alt="IFOA Logo" className="h-9 w-auto object-contain" />
          </Link>

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center gap-3">
            {admin ? (
              <div className="flex items-center gap-3">
                {/* Profile Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2.5 text-left rounded-full hover:opacity-90 transition-all outline-none focus:outline-none cursor-pointer">
                      <Avatar className="w-9 h-9">
                        {!isAdmin && admin?.logo_url && <AvatarImage src={admin.logo_url} alt={admin.airlineName} />}
                        <AvatarFallback className="bg-[#0B132B] text-white font-bold text-xs">
                          {!isAdmin && admin?.airlineName ? admin.airlineName.charAt(0).toUpperCase() : initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="hidden md:block leading-tight">
                        <p className="text-sm font-bold text-slate-900">{profileLabel}</p>
                        <p className="text-xs text-slate-500 font-normal">{profileSublabel}</p>
                      </div>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64 p-0 rounded-2xl bg-white shadow-xl border border-slate-100 overflow-hidden">
                    {/* User Info Header */}
                    <div className="px-5 py-4 space-y-0.5">
                      <p className="text-base font-extrabold text-slate-900 leading-tight">
                        {admin?.name || 'User'}
                      </p>
                      {!isAdmin && admin?.airlineName && (
                        <p className="text-xs font-semibold text-slate-700">
                          {admin.airlineName}
                        </p>
                      )}
                      {isAdmin && (
                        <p className="text-xs font-semibold text-slate-700">
                          Administrator
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
                      onClick={() => navigate(dashboardPath)}
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
            ) : (
              <>
                <Link to="/login"
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors rounded-lg hover:bg-slate-100/60">
                  Sign In
                </Link>
                <Link to="/signup"
                  className="group inline-flex items-center gap-2 px-4.5 py-2 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 transition-all shadow-2xs">
                  Get Started <HiOutlineArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </>
            )}
          </div>

          {/* Mobile burger */}
          <button
            className="sm:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
            onClick={() => setMobileMenuOpen(o => !o)}
          >
            {mobileMenuOpen
              ? <HiOutlineX className="w-5 h-5 text-slate-700" />
              : <HiOutlineMenu className="w-5 h-5 text-slate-700" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="sm:hidden bg-white border-t border-slate-200/80 px-4 py-4 space-y-2 shadow-lg">
            {admin ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5 w-full py-2 px-3 bg-slate-100 rounded-xl">
                  <Avatar className="w-8 h-8">
                    {!isAdmin && admin?.logo_url && <AvatarImage src={admin.logo_url} alt={admin.airlineName} />}
                    <AvatarFallback className="text-xs bg-slate-200 text-slate-900 font-bold">
                      {!isAdmin && admin?.airlineName ? admin.airlineName.charAt(0).toUpperCase() : initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-left leading-tight">
                    <p className="text-xs font-bold text-slate-900">{profileLabel}</p>
                    <p className="text-[10px] text-slate-500">{profileSublabel}</p>
                  </div>
                </div>
                <Link to={dashboardPath} onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 w-full py-2.5 px-3 bg-slate-900 text-white rounded-xl text-sm font-semibold">
                  <HiOutlineArrowRight className="w-4 h-4" /> Dashboard
                </Link>
                <button onClick={handleLogout}
                  className="w-full flex items-center gap-2 py-2.5 px-3 border border-red-200 text-red-600 rounded-xl text-sm font-semibold hover:bg-red-50 transition-colors">
                  <HiOutlineLogout className="w-4 h-4" />
                  Logout
                </button>
              </div>
            ) : (
              <>
                <Link to="/login" onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center w-full py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors">
                  Sign In
                </Link>
                <Link to="/signup" onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold">
                  Get Started <HiOutlineArrowRight className="w-4 h-4" />
                </Link>
              </>
            )}
          </div>
        )}
      </motion.nav>

      {/* ── Hero ── */}
      <section className="relative min-h-[85vh] pt-20 pb-16 px-4 sm:px-6 flex flex-col items-center justify-center">
        <div className="max-w-7xl mx-auto relative w-full flex flex-col items-center justify-center text-center">
          <div className="text-center max-w-4xl mx-auto flex flex-col items-center justify-center">

            {/* Heading — Letter-by-letter fluid wave animation */}
            <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-[5.25rem] font-extrabold leading-[1.06] tracking-tight">
              <WaveText
                text="Training"
                className="block"
                colorClass="text-slate-900"
                baseDelay={0.08}
                letterStagger={0.035}
              />
              <WaveText
                text="Management System"
                className="flex flex-wrap justify-center gap-x-3 sm:gap-x-5 mt-1 sm:mt-2"
                colorClass="text-[#0000ff]"
                baseDelay={0.38}
                letterStagger={0.03}
              />
            </h1>

            {/* Sub-heading */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.72, ease: [0.215, 0.61, 0.355, 1] }}
              className="mt-6 text-base sm:text-lg md:text-xl text-slate-600 font-medium max-w-2xl mx-auto leading-relaxed tracking-tight text-center"
            >
              <span className="block">A centralised platform to plan, manage, and track all aviation training activities.</span>
              <span className="block mt-1.5 text-slate-500 font-normal">Keep your team compliant, organised, and audit-ready at every stage.</span>
            </motion.p>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.9, ease: [0.215, 0.61, 0.355, 1] }}
              className="mt-9"
            >
              {admin ? (
                <Link to="/admin"
                  className="group inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-slate-900 text-white rounded-xl text-sm font-semibold shadow-md hover:bg-slate-800 transition-all duration-200">
                  Open Dashboard
                  <HiOutlineArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              ) : (
                <Link to="/signup"
                  className="group inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-slate-900 text-white rounded-xl text-sm font-semibold shadow-md hover:bg-slate-800 transition-all duration-200">
                  Get Started
                  <HiOutlineArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              )}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="border-y border-slate-200/80 bg-white py-10 px-4 sm:px-6 overflow-hidden">
        <motion.div
          variants={containerStagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="max-w-3xl mx-auto grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-200/80"
        >
          {stats.map((s) => (
            <motion.div key={s.label} variants={itemReveal} className="flex flex-col items-center py-5 px-4 text-center">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">{s.value}</span>
              <span className="text-xs font-bold text-slate-700 mt-1.5">{s.label}</span>
              <span className="text-[11px] font-medium text-slate-400 mt-0.5">{s.sub}</span>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ══════════════ FEATURES SECTION ══════════════ */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 overflow-hidden">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <motion.div
            variants={scrollFadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            className="text-center mb-14 sm:mb-18"
          >
            <span className="inline-block px-3.5 py-1 rounded-full text-xs font-bold tracking-wider uppercase mb-3 bg-slate-200/70 text-slate-700">
              Features
            </span>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">
              Everything you need
            </h2>
            <p className="mt-3 text-slate-600 max-w-xl mx-auto text-sm sm:text-base leading-relaxed">
              A complete solution for managing flight dispatcher training records and generating professional certificates.
            </p>
          </motion.div>

          {/* Grid with Black Icons */}
          <motion.div
            variants={containerStagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.15 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {features.map((f) => (
              <motion.div key={f.title}
                variants={itemReveal}
                whileHover={{ y: -4 }}
                transition={{ duration: 0.2 }}
                className="group p-7 rounded-2xl bg-white border border-slate-200/90 shadow-2xs hover:shadow-xl hover:border-slate-300 flex flex-col justify-between"
              >
                <div>
                  {/* Black Icon Container */}
                  <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200/80 flex items-center justify-center mb-5 text-slate-900 shadow-2xs group-hover:bg-slate-900 group-hover:text-white group-hover:border-slate-900 transition-colors duration-200">
                    <f.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-2 tracking-tight">{f.title}</h3>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-normal">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══════════════ CTA BANNER ══════════════ */}
      <section className="py-16 px-4 sm:px-6 overflow-hidden">
        <div className="max-w-4xl mx-auto">
          <motion.div
            variants={scrollFadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            className="rounded-3xl bg-slate-900 p-8 sm:p-14 text-center text-white relative overflow-hidden shadow-2xl"
          >
            <div className="relative z-10 max-w-xl mx-auto">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-3 tracking-tight">Ready to get started?</h2>
              <p className="text-slate-300 text-sm sm:text-base mb-7 leading-relaxed">
                Access the admin panel to manage participants and generate regulation-compliant training certificates.
              </p>
              <Link to={admin ? '/admin' : '/signup'}
                className="group inline-flex items-center gap-2 px-7 py-3.5 bg-white text-slate-900 rounded-xl text-sm font-bold shadow-md hover:bg-slate-100 transition-all duration-200">
                {admin ? 'Open Dashboard' : 'Get Started'}
                <HiOutlineArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ══════════════ FOOTER ══════════════ */}
      <footer className="border-t border-slate-200/80 bg-white py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="IFOA Logo" className="h-7 w-auto object-contain" />
            <div>
              <p className="text-sm font-bold text-slate-900 leading-none">IFOA Training Management System</p>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} International Flight Operations Academy. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
