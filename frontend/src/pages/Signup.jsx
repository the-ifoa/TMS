import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HiOutlineUser,
  HiOutlineMail,
  HiOutlineLockClosed,
  HiOutlineArrowRight,
  HiOutlineOfficeBuilding,
  HiOutlineEye,
  HiOutlineEyeOff,
  HiOutlinePhotograph,
  HiOutlineX,
  HiOutlineShieldCheck,
  HiOutlineRefresh,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import { airlineSignup, airlineVerifyOtp, airlineResendOtp, uploadAirlineLogo } from '../api';
import { useAuth } from '../context/AuthContext';
import logoImg from '../assets/logo.png';

// ─── OTP input: 6 individual boxes ───────────────────────────────────────────
function OtpInput({ value, onChange, disabled }) {
  const refs = useRef([]);
  const digits = value.split('').concat(Array(6).fill('')).slice(0, 6);

  const handleKey = (i, e) => {
    if (e.key === 'Backspace') {
      if (digits[i]) {
        const next = digits.map((d, idx) => idx === i ? '' : d).join('');
        onChange(next);
      } else if (i > 0) {
        refs.current[i - 1]?.focus();
        const next = digits.map((d, idx) => idx === i - 1 ? '' : d).join('');
        onChange(next);
      }
      return;
    }
    if (e.key === 'ArrowLeft' && i > 0) { refs.current[i - 1]?.focus(); return; }
    if (e.key === 'ArrowRight' && i < 5) { refs.current[i + 1]?.focus(); return; }
  };

  const handleChange = (i, e) => {
    const char = e.target.value.replace(/\D/g, '').slice(-1);
    if (!char) return;
    const next = digits.map((d, idx) => idx === i ? char : d).join('');
    onChange(next);
    if (i < 5) refs.current[i + 1]?.focus();
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) { onChange(pasted.padEnd(6, '').slice(0, 6)); refs.current[Math.min(pasted.length, 5)]?.focus(); }
    e.preventDefault();
  };

  return (
    <div className="flex gap-2 justify-center">
      {digits.map((d, i) => (
        <input key={i} ref={el => refs.current[i] = el}
          type="text" inputMode="numeric" maxLength={1} value={d}
          onChange={e => handleChange(i, e)}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
          className={`w-11 h-14 text-center text-xl font-bold border-2 rounded-xl transition-all focus:outline-none
            ${d ? 'border-accent-500 bg-accent-50 text-accent-700' : 'border-primary-200 bg-primary-50 text-primary-800'}
            focus:border-accent-500 focus:ring-2 focus:ring-accent-200 disabled:opacity-50`}
        />
      ))}
    </div>
  );
}

// ─── Countdown timer ─────────────────────────────────────────────────────────
function useCountdown(seconds) {
  const [remaining, setRemaining] = useState(seconds);
  const reset = (s = seconds) => setRemaining(s);
  useEffect(() => {
    if (remaining <= 0) return;
    const t = setTimeout(() => setRemaining(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining]);
  return { remaining, reset, expired: remaining <= 0 };
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Signup() {
  const [step, setStep]     = useState('form'); // 'form' | 'otp'
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingAirline, setPendingAirline] = useState('');

  const [form, setForm] = useState({
    name: '', airlineName: '', email: '', password: '', confirmPassword: '',
  });
  const [loading, setLoading]           = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [logoFile, setLogoFile]         = useState(null);
  const [logoPreview, setLogoPreview]   = useState(null);
  const [uploading, setUploading]       = useState(false);
  const [savedLogoUrl, setSavedLogoUrl] = useState(null); // after upload

  const [otp, setOtp]           = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const { remaining, reset: resetTimer, expired } = useCountdown(600); // 10 min

  const fileInputRef = useRef(null);
  const navigate     = useNavigate();
  const { loginAdmin } = useAuth();

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Logo must be under 2 MB'); return; }
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const removeLogo = () => {
    setLogoFile(null); setLogoPreview(null); setSavedLogoUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Step 1: submit form → upload logo → send OTP
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) { toast.error('Please fill in all fields'); return; }
    if (!form.airlineName) { toast.error('Please enter your airline name'); return; }
    if (form.password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    if (form.password !== form.confirmPassword) { toast.error('Passwords do not match'); return; }

    try {
      setLoading(true);

      // Upload logo first if provided
      let logo_url = savedLogoUrl;
      if (logoFile && !logo_url) {
        setUploading(true);
        toast.loading('Uploading logo…', { id: 'logo-upload' });
        try {
          const uploadRes = await uploadAirlineLogo(logoFile);
          logo_url = uploadRes.data.logo_url;
          setSavedLogoUrl(logo_url);
          toast.success('Logo uploaded!', { id: 'logo-upload' });
        } catch {
          toast.error('Logo upload failed — continuing without logo', { id: 'logo-upload' });
        }
        setUploading(false);
      }

      // OTP VERIFICATION DISABLED — signup now returns token directly
      const res = await airlineSignup({ name: form.name, airlineName: form.airlineName, email: form.email, password: form.password, logo_url });
      loginAdmin(res.data.token, { ...res.data.admin, role: 'airline' });
      toast.success(`Welcome to IFOA, ${form.airlineName}!`);
      navigate('/airline');

      // // OTP step (disabled)
      // setPendingEmail(form.email);
      // setPendingAirline(form.airlineName);
      // resetTimer(600);
      // setOtp('');
      // setStep('otp');
      // toast.success(`Verification code sent to ${form.email}`, { duration: 4000 });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  // Step 2: verify OTP → log in
  const handleVerify = async (e) => {
    e?.preventDefault();
    if (otp.replace(/\D/g, '').length < 6) { toast.error('Enter all 6 digits'); return; }
    try {
      setVerifying(true);
      const res = await airlineVerifyOtp(pendingEmail, otp);
      loginAdmin(res.data.token, { ...res.data.admin, role: 'airline' });
      toast.success(`Welcome to IFOA, ${pendingAirline}!`);
      navigate('/airline');
    } catch (err) {
      const msg = err.response?.data?.error || 'Verification failed';
      toast.error(msg);
      // Clear OTP boxes on wrong code so user can retype easily
      if (err.response?.status === 400) setOtp('');
    } finally {
      setVerifying(false);
    }
  };

  // Auto-submit when all 6 digits are entered
  useEffect(() => {
    if (step === 'otp' && otp.replace(/\D/g, '').length === 6 && !verifying) {
      handleVerify();
    }
  }, [otp, step]);

  const handleResend = async () => {
    if (!expired && remaining > 540) { // Allow resend after 1 min
      toast.error(`Please wait ${fmt(remaining - 540)} before resending`); return;
    }
    try {
      setResending(true);
      await airlineResendOtp(pendingEmail);
      resetTimer(600);
      setOtp('');
      toast.success('New verification code sent!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to resend code');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-8">
      <AnimatePresence mode="wait">

        {/* ── STEP 1: Registration Form ── */}
        {step === 'form' && (
          <motion.div key="form"
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.35 }} className="w-full max-w-md">

            <div className="text-center mb-8">
              <Link to="/" className="inline-flex items-center gap-3">
                <img src={logoImg} alt="IFOA Logo" className="h-12 w-auto object-contain" />
              </Link>
            </div>

            <div className="bg-white rounded-2xl border border-primary-100 shadow-xl shadow-primary-800/5 p-5 sm:p-8">
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-primary-800">Register Airline</h1>
                <p className="text-sm text-primary-400 mt-1">Create your airline account to access the IFOA portal</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Contact Name */}
                <div>
                  <label className="block text-sm font-medium text-primary-700 mb-1.5">Contact Name</label>
                  <div className="relative">
                    <HiOutlineUser className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-400" />
                    <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                      placeholder="Your full name"
                      className="w-full pl-10 pr-4 py-2.5 bg-primary-50 border border-primary-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent transition-all" />
                  </div>
                </div>

                {/* Airline Name */}
                <div>
                  <label className="block text-sm font-medium text-primary-700 mb-1.5">Airline Name</label>
                  <div className="relative">
                    <HiOutlineOfficeBuilding className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-400" />
                    <input type="text" value={form.airlineName} onChange={e => setForm({ ...form, airlineName: e.target.value })}
                      placeholder="e.g. Emirates Airlines"
                      className="w-full pl-10 pr-4 py-2.5 bg-primary-50 border border-primary-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent transition-all" />
                  </div>
                </div>

                {/* Company Logo */}
                <div>
                  <label className="block text-sm font-medium text-primary-700 mb-1.5">
                    Company Logo <span className="text-primary-400 font-normal">(optional)</span>
                  </label>
                  {logoPreview ? (
                    <div className="flex items-center gap-4 p-3 bg-primary-50 border border-primary-200 rounded-xl">
                      <img src={logoPreview} alt="Logo preview"
                        className="w-14 h-14 object-contain rounded-lg border border-primary-200 bg-white" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-primary-800 truncate">{logoFile?.name}</p>
                        <p className="text-xs text-primary-400 mt-0.5">{(logoFile?.size / 1024).toFixed(0)} KB</p>
                      </div>
                      <button type="button" onClick={removeLogo}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-primary-400 hover:text-red-500 transition-colors flex-shrink-0">
                        <HiOutlineX className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      className="w-full flex flex-col items-center gap-2 py-5 border-2 border-dashed border-primary-200 rounded-xl hover:border-accent-400 hover:bg-accent-50/30 transition-all group">
                      <div className="w-10 h-10 rounded-xl bg-primary-100 group-hover:bg-accent-100 flex items-center justify-center transition-colors">
                        <HiOutlinePhotograph className="w-5 h-5 text-primary-400 group-hover:text-accent-600 transition-colors" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium text-primary-600 group-hover:text-accent-700">Click to upload logo</p>
                        <p className="text-xs text-primary-400 mt-0.5">PNG, JPG, SVG · max 2 MB</p>
                      </div>
                    </button>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-primary-700 mb-1.5">Email</label>
                  <div className="relative">
                    <HiOutlineMail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-400" />
                    <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                      placeholder="ops@yourairline.com"
                      className="w-full pl-10 pr-4 py-2.5 bg-primary-50 border border-primary-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent transition-all" />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-primary-700 mb-1.5">Password</label>
                  <div className="relative">
                    <HiOutlineLockClosed className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-400" />
                    <input type={showPassword ? 'text' : 'password'} value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      placeholder="Min. 6 characters"
                      className="w-full pl-10 pr-10 py-2.5 bg-primary-50 border border-primary-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent transition-all" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-400 hover:text-primary-600">
                      {showPassword ? <HiOutlineEyeOff className="w-5 h-5" /> : <HiOutlineEye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-sm font-medium text-primary-700 mb-1.5">Confirm Password</label>
                  <div className="relative">
                    <HiOutlineLockClosed className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-primary-400" />
                    <input type={showConfirm ? 'text' : 'password'} value={form.confirmPassword}
                      onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
                      placeholder="Repeat your password"
                      className="w-full pl-10 pr-10 py-2.5 bg-primary-50 border border-primary-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 focus:border-transparent transition-all" />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-400 hover:text-primary-600">
                      {showConfirm ? <HiOutlineEyeOff className="w-5 h-5" /> : <HiOutlineEye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={loading || uploading}
                  className="w-full py-3 bg-[#0000ff] text-white rounded-xl text-sm font-semibold shadow-lg shadow-blue-500/25 hover:bg-blue-700 hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <> Create Account <HiOutlineArrowRight className="w-4 h-4" /> </>
                  )}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-primary-400">
                Already have an account?{' '}
                <Link to="/login" className="text-[#0000ff] font-semibold hover:text-blue-700 transition-colors">Sign in</Link>
              </p>
            </div>
          </motion.div>
        )}

        {/* ── STEP 2: OTP Verification ── */}
        {step === 'otp' && (
          <motion.div key="otp"
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.35 }} className="w-full max-w-md">

            <div className="text-center mb-8">
              <Link to="/" className="inline-flex items-center gap-3">
                <img src={logoImg} alt="IFOA Logo" className="h-12 w-auto object-contain" />
              </Link>
            </div>

            <div className="bg-white rounded-2xl border border-primary-100 shadow-xl shadow-primary-800/5 p-5 sm:p-8">
              {/* Header */}
              <div className="flex flex-col items-center mb-6 text-center">
                <div className="w-14 h-14 bg-accent-100 rounded-2xl flex items-center justify-center mb-4">
                  <HiOutlineShieldCheck className="w-7 h-7 text-[#0000ff]" />
                </div>
                <h1 className="text-2xl font-bold text-primary-800">Verify Your Email</h1>
                <p className="text-sm text-primary-400 mt-1.5 max-w-xs">
                  We sent a 6-digit code to <span className="font-semibold text-primary-700">{pendingEmail}</span>
                </p>
              </div>

              {/* Expiry countdown */}
              <div className={`flex items-center justify-center gap-2 mb-6 px-4 py-2.5 rounded-xl text-sm font-semibold ${
                expired ? 'bg-red-50 text-red-600 border border-red-200' : remaining < 60 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
              }`}>
                <span className="font-mono text-lg">{fmt(remaining)}</span>
                <span className="text-xs font-medium opacity-70">{expired ? '— Code expired' : 'remaining'}</span>
              </div>

              <form onSubmit={handleVerify} className="space-y-5">
                <OtpInput value={otp} onChange={setOtp} disabled={verifying || expired} />

                <button type="submit" disabled={verifying || expired || otp.replace(/\D/g,'').length < 6}
                  className="w-full py-3 bg-[#0000ff] text-white rounded-xl text-sm font-semibold shadow-lg shadow-blue-500/25 hover:bg-blue-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  {verifying ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <> Verify &amp; Create Account <HiOutlineShieldCheck className="w-4 h-4" /> </>
                  )}
                </button>
              </form>

              {/* Resend */}
              <div className="mt-5 text-center">
                <p className="text-sm text-primary-400 mb-2">Didn't receive the code?</p>
                <button onClick={handleResend} disabled={resending || (!expired && remaining > 540)}
                  className="flex items-center gap-1.5 mx-auto text-sm font-semibold text-[#0000ff] hover:text-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  {resending
                    ? <div className="w-4 h-4 border-2 border-accent-300 border-t-accent-600 rounded-full animate-spin" />
                    : <HiOutlineRefresh className="w-4 h-4" />}
                  {resending ? 'Sending…' : 'Resend Code'}
                </button>
                {!expired && remaining > 540 && (
                  <p className="text-xs text-primary-400 mt-1">You can resend in {fmt(remaining - 540)}</p>
                )}
              </div>

              {/* Back to form */}
              <button onClick={() => { setStep('form'); setOtp(''); }}
                className="mt-4 w-full text-center text-sm text-primary-400 hover:text-primary-600 transition-colors">
                ← Back to registration
              </button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
