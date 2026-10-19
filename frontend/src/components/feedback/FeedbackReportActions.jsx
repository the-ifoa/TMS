import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineEye, HiOutlineDownload, HiOutlineMail, HiOutlineX, HiOutlineExternalLink, HiOutlinePaperAirplane,
} from 'react-icons/hi';
import { emailFeedbackReport } from '../../api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

// ─── Feedback report: view · download · email ─────────────────────────────────
// The PDF is built in the browser (utils/generateFeedbackPdf, loaded on demand
// so jsPDF stays out of the main bundle). "View" previews it without saving,
// "Email" sends that same file to the addresses the admin types.

const loadPdf = () => import('../../utils/generateFeedbackPdf');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// "a@x.com, b@y.com; c@z.com" → ['a@x.com', 'b@y.com', 'c@z.com']
const splitEmails = (text) => [...new Set(text.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean))];

function PreviewDialog({ url, filename, onClose, onDownload }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent hideClose className="max-w-4xl w-[94vw] h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl">
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200">
          <DialogTitle className="text-sm font-bold text-slate-900 truncate">{filename}</DialogTitle>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <a href={url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50">
              <HiOutlineExternalLink className="w-3.5 h-3.5" /> New tab
            </a>
            <button type="button" onClick={onDownload}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50">
              <HiOutlineDownload className="w-3.5 h-3.5" /> Download
            </button>
            <button type="button" onClick={onClose} aria-label="Close"
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <HiOutlineX className="w-5 h-5" />
            </button>
          </div>
        </div>
        <iframe title="Feedback report preview" src={url} className="flex-1 w-full bg-slate-100" />
      </DialogContent>
    </Dialog>
  );
}

function EmailDialog({ exam, buildBase64, onClose }) {
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const emails = splitEmails(to);
  const bad = emails.filter((e) => !EMAIL_RE.test(e));

  const send = async (e) => {
    e.preventDefault();
    if (!emails.length) { toast.error('Type at least one email address.'); return; }
    if (bad.length) { toast.error(`Check this address: ${bad[0]}`); return; }
    if (emails.length > 10) { toast.error('Send to at most 10 addresses at a time.'); return; }
    setSending(true);
    try {
      const pdf_base64 = await buildBase64();
      const res = await emailFeedbackReport(exam.id, { to: emails, message, pdf_base64 });
      toast.success(`Report emailed to ${res.data.sent.join(', ')}.`);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.details?.[0] || err.response?.data?.error || 'Could not send the report.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !sending && onClose()}>
      <DialogContent className="max-w-md w-[94vw] p-0 gap-0 overflow-hidden rounded-2xl">
        <form onSubmit={send}>
          <div className="px-6 pt-5 pb-4 border-b border-slate-100">
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
              <HiOutlineMail className="w-5 h-5 text-slate-400" /> Email feedback report
            </DialogTitle>
            <p className="mt-1 text-xs text-slate-500 line-clamp-2">The PDF report for &ldquo;{exam.title}&rdquo; is sent as an attachment.</p>
          </div>
          <div className="px-6 py-4 space-y-3.5">
            <label className="block">
              <span className="block text-xs font-bold text-slate-700 mb-1">To</span>
              <input autoFocus value={to} onChange={(e) => setTo(e.target.value)} placeholder="training@airline.com, ops@airline.com"
                className={`w-full h-9 px-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${bad.length ? 'border-rose-300 bg-rose-50/40' : 'border-slate-200'}`} />
              <span className="block mt-1 text-[11px] text-slate-400">
                {bad.length ? <span className="text-rose-600">Not a valid address: {bad.join(', ')}</span>
                  : emails.length ? `${emails.length} recipient${emails.length === 1 ? '' : 's'}`
                  : 'Separate several addresses with commas.'}
              </span>
            </label>
            {emails.length > 0 && !bad.length && (
              <div className="flex flex-wrap gap-1.5 -mt-1">
                {emails.map((em) => (
                  <span key={em} className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-[11px] font-semibold text-slate-700">{em}</span>
                ))}
              </div>
            )}
            <label className="block">
              <span className="block text-xs font-bold text-slate-700 mb-1">Message <span className="font-medium text-slate-400">(optional)</span></span>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={2000}
                placeholder="Dear team, please find the participant feedback for your recent training attached."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 resize-y" />
            </label>
          </div>
          <div className="px-6 py-3.5 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={sending} className="rounded-xl text-xs font-bold">Cancel</Button>
            <Button type="submit" disabled={sending || !emails.length || bad.length > 0}
              className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold h-9 flex items-center gap-1.5">
              <HiOutlinePaperAirplane className="w-4 h-4 rotate-45" /> {sending ? 'Sending…' : 'Send report'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function FeedbackReportActions({ exam, form, responses, sentCount }) {
  const opts = { examTitle: exam.title, form, responses, sentCount };
  const [preview, setPreview] = useState(null); // { url, filename }
  const [emailOpen, setEmailOpen] = useState(false);
  const [working, setWorking] = useState(false);

  // Free the preview's object URL when it closes.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  const run = async (fn) => {
    setWorking(true);
    try { await fn(await loadPdf()); } catch (err) {
      console.error('Feedback PDF failed:', err);
      toast.error('Could not create the PDF. Please try again.');
    } finally { setWorking(false); }
  };
  const view = () => run((m) => setPreview({ url: m.feedbackPdfUrl(opts), filename: m.feedbackPdfFilename(exam.title) }));
  const download = () => run((m) => m.downloadFeedbackPdf(opts));
  const buildBase64 = async () => (await loadPdf()).feedbackPdfBase64(opts);

  const BTN = 'rounded-lg text-xs font-bold h-7 px-2.5 flex items-center gap-1.5 bg-white';
  return (
    <>
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" disabled={working} onClick={view} className={BTN}>
          <HiOutlineEye className="w-3.5 h-3.5" /> View
        </Button>
        <Button variant="outline" size="sm" disabled={working} onClick={download} className={BTN}>
          <HiOutlineDownload className="w-3.5 h-3.5" /> Download
        </Button>
        <Button variant="outline" size="sm" disabled={working} onClick={() => setEmailOpen(true)} className={BTN}>
          <HiOutlineMail className="w-3.5 h-3.5" /> Email
        </Button>
      </div>
      {preview && <PreviewDialog url={preview.url} filename={preview.filename} onClose={() => setPreview(null)} onDownload={download} />}
      {emailOpen && <EmailDialog exam={exam} buildBase64={buildBase64} onClose={() => setEmailOpen(false)} />}
    </>
  );
}
