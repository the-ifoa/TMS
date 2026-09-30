import { HiOutlineClock, HiOutlineShieldCheck, HiOutlineExclamation } from 'react-icons/hi';
import { certExpiry, timeLeftLabel, fmtExpiry } from '../utils/certValidity';

const STYLES = {
  expired:   'bg-red-50 text-red-700 border-red-200',
  critical:  'bg-orange-50 text-orange-700 border-orange-200',
  warning:   'bg-amber-50 text-amber-700 border-amber-200',
  valid:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  unlimited: 'bg-slate-50 text-slate-600 border-slate-200',
};

const DATE_COLORS = {
  expired:  'text-red-600',
  critical: 'text-orange-600',
  warning:  'text-amber-600',
  valid:    'text-emerald-600',
};

// Time left on a certificate. Pass `participant` for its IFOA certificate, or a
// precomputed `expiry` (see utils/certValidity). Renders `fallback` when there
// is nothing to show.
export default function ValidityBadge({ participant, expiry, showDate = true, fallback = null, className = '' }) {
  const exp = expiry !== undefined ? expiry : certExpiry(participant);
  if (!exp) return fallback;
  if (exp.unlimited) {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${STYLES.unlimited} ${className}`}>
        <HiOutlineShieldCheck className="w-3 h-3" /> Unlimited
      </span>
    );
  }
  const Icon = exp.status === 'valid' ? HiOutlineShieldCheck : exp.status === 'expired' ? HiOutlineExclamation : HiOutlineClock;
  return (
    <span className={`inline-flex flex-col leading-tight ${className}`} title={`Valid until ${fmtExpiry(exp.expiresOn)}`}>
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap w-fit ${STYLES[exp.status]}`}>
        <Icon className="w-3 h-3" /> {timeLeftLabel(exp.daysLeft)}
      </span>
      {showDate && (
        <span className={`text-[10px] font-medium mt-0.5 whitespace-nowrap ${DATE_COLORS[exp.status]}`}>
          {exp.daysLeft < 0 ? 'Expired' : 'Until'} {fmtExpiry(exp.expiresOn)}
        </span>
      )}
    </span>
  );
}
