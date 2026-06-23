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
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-3">
            <img src={logoImg} alt="IFOA Logo" className="h-12 w-auto object-contain" />
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-primary-100 shadow-xl shadow-primary-800/5 p-5 sm:p-8">

          {/* ── Forgot Password view ── */}
          {showForgot ? (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-primary-800">Reset Password</h1>
                <p className="text-sm text-primary-400 mt-1">Enter your email and we'll send a reset link</p>
              </div>

              {forgotSent ? (
                <div className="text-center space-y-4">
                  <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                    <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-sm text-primary-600 font-medium">Check your inbox!</p>
                  <p className="text-xs text-primary-400">
                    If <strong>{forgotEmail}</strong> is registered, a reset link has been sent. Check your spam folder too.
                  </p>
                  <button
                    onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail(''); }}
                    className="text-sm text-[#0000ff] font-semibold hover:text-blue-700"
                  >
                    ← Back to sign in
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgot} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-primary-700 mb-1.5">Email Address</label>
                    <div className="relative">
                      <HiOutlineMail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-400" />
                      <input
                        type="email" value={forgotEmail}
                        onChange={e => setForgotEmail(e.target.value)}
                        placeholder="ops@yourairline.com"
                        className="w-full pl-10 pr-4 py-2.5 bg-primary-50 border border-primary-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>
                  <button
                    type="submit" disabled={forgotSending}
                    className="w-full py-3 bg-[#0000ff] text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {forgotSending
                      ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : 'Send Reset Link'}
                  </button>
                  <button
                    type="button" onClick={() => setShowForgot(false)}
                    className="w-full text-sm text-primary-400 hover:text-primary-600 transition-colors"
                  >
                    ← Back to sign in
                  </button>
                </form>
              )}
            </>
          ) : (
            /* ── Login view ── */
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-primary-800">Airline Portal</h1>
                <p className="text-sm text-primary-400 mt-1">Sign in to your airline account</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-primary-700 mb-1.5">Email</label>
                  <div className="relative">
                    <HiOutlineMail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-400" />
                    <input
                      type="email" value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                      placeholder="ops@yourairline.com"
                      className="w-full pl-10 pr-4 py-2.5 bg-primary-50 border border-primary-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-primary-700">Password</label>
                    <button
                      type="button" onClick={() => setShowForgot(true)}
                      className="text-xs text-[#0000ff] font-medium hover:text-blue-700 transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <HiOutlineLockClosed className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-400" />
                    <input
                      type={showPassword ? 'text' : 'password'} value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      placeholder="Enter your password"
                      className="w-full pl-10 pr-10 py-2.5 bg-primary-50 border border-primary-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent transition-all"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-400 hover:text-primary-600 transition-colors">
                      {showPassword ? <HiOutlineEyeOff className="w-5 h-5" /> : <HiOutlineEye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full py-3 bg-[#0000ff] text-white rounded-xl text-sm font-semibold shadow-lg shadow-blue-500/25 hover:bg-blue-700 hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading
                    ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <>Sign In <HiOutlineArrowRight className="w-4 h-4" /></>}
                </button>
              </form>

              <div className="mt-6 space-y-3">
                <p className="text-center text-sm text-primary-400">
                  New airline?{' '}
                  <Link to="/signup" className="text-[#0000ff] font-semibold hover:text-blue-700 transition-colors">
                    Register your airline
                  </Link>
                </p>
                <p className="text-xs text-center text-primary-400 bg-primary-50 rounded-xl p-3">
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
