import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  HiOutlineMail, HiOutlineLockClosed, HiOutlineArrowRight,
  HiOutlineEye, HiOutlineEyeOff,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import { airlineLogin, forgotPassword } from '../api';
import { useAuth } from '../context/AuthContext';
import logoImg from '../assets/logo.png';

export default function Login() {
  const [form, setForm]               = useState({ email: '', password: '' });
  const [loading, setLoading]         = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgot, setShowForgot]   = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotSent, setForgotSent]   = useState(false);
  const navigate = useNavigate();
  const { loginAdmin } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) { toast.error('Please fill in all fields'); return; }
    try {
      setLoading(true);
      const res = await airlineLogin({ email: form.email, password: form.password });
      loginAdmin(res.data.token, { ...res.data.admin, role: 'airline' });
      toast.success(`Welcome, ${res.data.admin.airlineName}!`);
      navigate('/airline');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    if (!forgotEmail) { toast.error('Please enter your email'); return; }
    try {
      setForgotSending(true);
      await forgotPassword(forgotEmail);
      setForgotSent(true);
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setForgotSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xl shadow-slate-900/5 p-6 sm:p-10 backdrop-blur-xl">
          {/* Header & Logo */}
          <div className="flex flex-col items-center text-center pb-6 border-b border-slate-100 mb-6">
            <Link to="/" className="inline-block mb-4 transition-transform hover:scale-105 duration-200">
              <img src={logoImg} alt="IFOA Logo" className="h-10 sm:h-12 w-auto object-contain mx-auto" />
            </Link>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Airline Portal</h1>
            <p className="text-sm text-slate-500 mt-1">Sign in to your airline account</p>
          </div>

          {/* ── Forgot Password view ── */}
          {showForgot ? (
            <>
              {forgotSent ? (
                <div className="text-center space-y-4 py-2">
                  <div className="w-14 h-14 bg-emerald-100/80 rounded-2xl flex items-center justify-center mx-auto text-emerald-600">
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-base font-bold text-slate-900">Check your inbox!</p>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">
                    If <strong className="text-slate-800">{forgotEmail}</strong> is registered, a reset link has been sent. Check your spam folder too.
                  </p>
                  <button
                    onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail(''); }}
                    className="text-xs text-[#0000ff] font-bold uppercase tracking-wider hover:underline"
                  >
                    ← Back to sign in
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgot} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">Email Address</label>
                    <div className="relative">
                      <HiOutlineMail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="email" value={forgotEmail}
                        onChange={e => setForgotEmail(e.target.value)}
                        placeholder="ops@yourairline.com"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0000ff]/20 focus:border-[#0000ff] transition-all"
                      />
                    </div>
                  </div>
                  <button
                    type="submit" disabled={forgotSending}
                    className="w-full py-3 bg-gradient-to-r from-[#000021] to-[#0000ff] text-white rounded-xl text-sm font-semibold shadow-lg shadow-blue-900/20 hover:shadow-xl hover:shadow-blue-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {forgotSending
                      ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : 'Send Reset Link'}
                  </button>
                  <button
                    type="button" onClick={() => setShowForgot(false)}
                    className="w-full text-xs text-slate-400 hover:text-slate-600 font-medium transition-colors"
                  >
                    ← Back to sign in
                  </button>
                </form>
              )}
            </>
          ) : (
            /* ── Login view ── */
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">Email Address</label>
                  <div className="relative">
                    <HiOutlineMail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email" value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      placeholder="ops@yourairline.com"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0000ff]/20 focus:border-[#0000ff] transition-all"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Password</label>
                    <button
                      type="button" onClick={() => setShowForgot(true)}
                      className="text-xs text-[#0000ff] font-semibold hover:underline transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <HiOutlineLockClosed className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'} value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      placeholder="Enter your password"
                      className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0000ff]/20 focus:border-[#0000ff] transition-all"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                      {showPassword ? <HiOutlineEyeOff className="w-4 h-4" /> : <HiOutlineEye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full mt-2 py-3 bg-gradient-to-r from-[#000021] to-[#0000ff] text-white rounded-xl text-sm font-semibold shadow-lg shadow-blue-900/20 hover:shadow-xl hover:shadow-blue-600/30 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading
                    ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <>Sign In <HiOutlineArrowRight className="w-4 h-4" /></>}
                </button>
              </form>

              <div className="mt-6 pt-4 border-t border-slate-100 space-y-3">
                <p className="text-center text-sm text-slate-500">
                  New airline?{' '}
                  <Link to="/signup" className="text-[#0000ff] font-semibold hover:underline transition-colors">
                    Register your airline
                  </Link>
                </p>
                <p className="text-xs text-center text-slate-500 bg-slate-50 border border-slate-100 rounded-xl p-3 leading-relaxed">
                  ℹ Once submitted, enrollment records are locked. Only admins can make changes or issue certificates.
                </p>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
