import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineMail, HiOutlinePaperAirplane } from 'react-icons/hi';
import { sendExpiryReminder } from '../api';
import { certExpiry } from '../utils/certValidity';
import ValidityBadge from './ValidityBadge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';

// Admin → airline email: "these candidates' IFOA certificates are expiring".
// `participants` is the selection (null = closed). Candidates without a
// released, time-limited certificate are listed as skipped and not sent.
export default function ExpiryReminderDialog({ participants, onClose }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => { if (participants) setMessage(''); }, [participants]);

  const list = participants || [];
  const eligible = list.filter((p) => certExpiry(p)?.expiresOn);
  const skipped = list.length - eligible.length;
  const airlineCount = new Set(eligible.map((p) => String(p.submitted_by || p.airline_name || p.company))).size;

  const send = async () => {
    setSending(true);
    try {
      const res = await sendExpiryReminder(eligible.map((p) => p.id || p._id), message);
      const { sent = [], failed = [], skipped: srvSkipped = [] } = res.data;
      if (sent.length) {
        toast.success(sent.length === 1
          ? `Reminder sent to ${sent[0].email}`
          : `Reminders sent to ${sent.length} airlines`);
      }
      failed.forEach((f) => toast.error(`Failed for ${f.airline}: ${f.error}`));
      srvSkipped.forEach((s) => toast(`${s.name}: ${s.reason}`, { icon: 'ℹ️' }));
      if (sent.length) onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send reminder');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={!!participants} onOpenChange={(o) => { if (!o && !sending) onClose(); }}>
      <DialogContent className="max-w-xl p-0 overflow-hidden">
        <DialogHeader className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0">
              <HiOutlineMail className="w-5 h-5" />
            </div>
            <div className="min-w-0 pr-6">
              <DialogTitle className="text-base font-bold text-slate-900 tracking-tight">Send Expiry Reminder</DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                {eligible.length
                  ? `Email ${airlineCount === 1 ? 'the airline' : `${airlineCount} airlines`} about ${eligible.length} certificate${eligible.length === 1 ? '' : 's'}.`
                  : 'None of the selected candidates have a released, time-limited certificate.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-4">
          <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
            {list.map((p) => {
              const ok = !!certExpiry(p)?.expiresOn;
              return (
                <div key={p.id || p._id} className={`flex items-center justify-between gap-3 px-3.5 py-2.5 ${ok ? '' : 'opacity-50'}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{p.participant_name}</p>
                    <p className="text-[11px] text-slate-400 truncate">{p.training_type}{(p.airline_name || p.company) ? ` · ${p.airline_name || p.company}` : ''}</p>
                  </div>
                  <ValidityBadge participant={p} showDate={false}
                    fallback={<span className="text-[11px] text-slate-400 whitespace-nowrap">Not issued — skipped</span>} />
                </div>
              );
            })}
          </div>
          {skipped > 0 && eligible.length > 0 && (
            <p className="text-[11px] text-slate-500">{skipped} candidate{skipped === 1 ? '' : 's'} will be skipped (no released or unlimited certificate).</p>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Note (optional)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="e.g. Please contact us to schedule recurrent training."
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5">
            <button type="button" onClick={onClose} disabled={sending}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs">
              Cancel
            </button>
            <button type="button" onClick={send} disabled={sending || eligible.length === 0}
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-2 disabled:opacity-50">
              <HiOutlinePaperAirplane className="w-4 h-4 rotate-90" />
              {sending ? 'Sending…' : 'Send Reminder'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
