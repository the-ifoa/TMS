import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlinePlus, HiOutlineTrash, HiOutlineKey, HiOutlineX, HiOutlineUsers,
  HiOutlineShieldCheck, HiOutlineAdjustments,
} from 'react-icons/hi';
import { getSecondaryLogins, getSecondaryLoginPowers, addSecondaryLogin, updateSecondaryLogin, deleteSecondaryLogin } from '../api';
import { useConfirm } from '@/hooks/use-confirm';
import InfoButton from './InfoButton';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

// Profile section: extra email + password pairs that sign in to this same airline
// account. Shown only when an IFOA admin has enabled it for the airline; only the
// main credential can manage them (a session opened with an extra login can't).
// Each login is either full access (same powers as the main credential) or
// limited to the powers ticked for it.
const input = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900';
const fmt = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never');

const EMPTY_FORM = { label: '', email: '', password: '', full_access: true, permissions: [] };

// Powers grouped for display: [[group, [power, …]], …]
const grouped = (powers) => Object.entries(powers.reduce((acc, p) => {
  (acc[p.group] = acc[p.group] || []).push(p);
  return acc;
}, {}));

// Full access vs. a ticked list of powers. `value` = { full_access, permissions }.
function AccessEditor({ value, onChange, powers }) {
  const toggle = (key) => onChange({
    ...value,
    permissions: value.permissions.includes(key) ? value.permissions.filter((k) => k !== key) : [...value.permissions, key],
  });
  const option = (full, title, text) => (
    <button type="button" onClick={() => onChange({ ...value, full_access: full })}
      className={`flex-1 text-left px-3 py-2.5 rounded-xl border transition-colors ${
        value.full_access === full ? 'border-slate-900 bg-white ring-1 ring-slate-900' : 'border-slate-200 bg-white hover:border-slate-300'
      }`}>
      <p className="text-xs font-bold text-slate-900">{title}</p>
      <p className="text-[11px] font-medium text-slate-500 mt-0.5">{text}</p>
    </button>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        {option(true, 'Full access', 'Everything the main login can do, now and in future.')}
        {option(false, 'Limited access', 'Only the powers you tick below.')}
      </div>
      {!value.full_access && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 p-3 rounded-xl bg-white border border-slate-200">
          {grouped(powers).map(([group, items]) => (
            <div key={group}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{group}</p>
              <div className="space-y-1.5">
                {items.map((p) => (
                  <label key={p.key} className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={value.permissions.includes(p.key)} onChange={() => toggle(p.key)}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400" />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-slate-800">{p.label}</span>
                      <span className="block text-[11px] font-medium text-slate-400">{p.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          {value.permissions.length === 0 && (
            <p className="sm:col-span-2 text-[11px] font-medium text-amber-700">
              Nothing ticked. This login will only see the Dashboard, Exam Results and Profile.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function SecondaryLoginsCard({ viaSecondary = false, signedInAs = '' }) {
  const [logins, setLogins] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [powers, setPowers] = useState([]);
  const [showInfo, setShowInfo] = useState(false);
  const [accessFor, setAccessFor] = useState(null); // id of the login whose powers are being edited
  const [access, setAccess] = useState({ full_access: true, permissions: [] });
  const [saving, setSaving] = useState(false);
  const [pwFor, setPwFor] = useState(null);       // id of the login whose password is being changed
  const [newPw, setNewPw] = useState('');
  const { confirm, ConfirmDialog } = useConfirm();

  const load = () => getSecondaryLogins().then((r) => setLogins(r.data)).catch(() => setLogins([]));
  useEffect(() => {
    if (viaSecondary) { setLogins([]); return; }
    load();
    getSecondaryLoginPowers().then((r) => setPowers(r.data)).catch(() => setPowers([]));
  }, [viaSecondary]);

  const add = async () => {
    if (!form.email.trim() || !form.password) { toast.error('Enter an email and a password.'); return; }
    setSaving(true);
    try {
      await addSecondaryLogin(form);
      toast.success('Login added. They can sign in with that email and password.');
      setForm(EMPTY_FORM); setAdding(false); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not add the login.'); }
    finally { setSaving(false); }
  };

  const changePw = async (id) => {
    if (newPw.length < 6) { toast.error('Password must be at least 6 characters.'); return; }
    try {
      await updateSecondaryLogin(id, { password: newPw });
      toast.success('Password changed.'); setPwFor(null); setNewPw('');
    } catch (err) { toast.error(err.response?.data?.error || 'Could not change the password.'); }
  };

  const saveAccess = async (id) => {
    try {
      await updateSecondaryLogin(id, access);
      toast.success('Access updated. It applies the next time they open a page.'); setAccessFor(null); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not update access.'); }
  };

  const remove = async (l) => {
    if (!(await confirm(`Remove the login ${l.email}? It will stop working immediately.`, { title: 'Remove login', confirmLabel: 'Remove' }))) return;
    try { await deleteSecondaryLogin(l.id); toast.success('Login removed.'); load(); }
    catch (err) { toast.error(err.response?.data?.error || 'Could not remove the login.'); }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center">
            <HiOutlineUsers className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
              Additional logins
              <InfoButton onClick={() => setShowInfo(true)} active={showInfo} title="How additional logins work" />
            </h3>
            <p className="text-xs font-medium text-slate-400">More email + password pairs that open this same account</p>
          </div>
        </div>
        {!viaSecondary && !adding && (
          <button onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors">
            <HiOutlinePlus className="w-3.5 h-3.5" /> Add login
          </button>
        )}
      </div>

      {/* "How it works" popup — same layout as the one on the Departments page */}
      <Dialog open={showInfo} onOpenChange={setShowInfo}>
        <DialogContent className="max-w-2xl rounded-2xl" hideClose>
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-200/80">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-900 text-white">
                <HiOutlineUsers className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base font-bold text-slate-900 leading-tight tracking-tight">How additional logins work</DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">More people on the same account, each with their own sign-in</DialogDescription>
              </div>
            </div>
            <button type="button" onClick={() => setShowInfo(false)} title="Close"
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
              <HiOutlineX className="w-5 h-5" />
            </button>
          </div>

          <div className="px-6 py-5 space-y-6 overflow-y-auto">
            <p className="text-sm text-slate-600 leading-relaxed">
              Each additional login is another email and password that opens <strong>this same account</strong>, with the same participants, exams and results. It is not a separate department.
            </p>

            <section>
              <h3 className="text-xs font-semibold text-slate-900 mb-2.5">Access levels</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { name: 'Full access', tag: 'Everything', text: 'The person can do everything you can, including anything switched on for your airline later.' },
                  { name: 'Limited access', tag: 'Only what you tick', text: 'The person can use only the powers you tick. Everything else is hidden from their menu and blocked.' },
                ].map((r) => (
                  <div key={r.name} className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-center flex-shrink-0">
                          <HiOutlineShieldCheck className="w-4 h-4" />
                        </span>
                        <span className="text-sm font-semibold text-slate-900 truncate">{r.name}</span>
                      </span>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600 flex-shrink-0">{r.tag}</span>
                    </div>
                    <p className="mt-2.5 text-[13px] text-slate-600 leading-relaxed">{r.text}</p>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-xs font-semibold text-slate-900 mb-2.5">Good to know</h3>
              <ul className="rounded-xl border border-slate-200/80 divide-y divide-slate-100">
                {[
                  ['Always available', 'Every login sees the Dashboard, Exam Results and Profile.'],
                  ['Only the main login manages logins', 'No additional login can add, change or remove logins.'],
                  ['Changes apply straight away', 'Changing access takes effect immediately; removing a login signs that person out.'],
                  ['One login per person', 'Give each person only what their job needs, so you can remove one without affecting the others.'],
                ].map(([title, text]) => (
                  <li key={title} className="px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">{title}</p>
                    <p className="mt-0.5 text-[13px] text-slate-600 leading-relaxed">{text}</p>
                  </li>
                ))}
              </ul>
            </section>

            {powers.length > 0 && (
              <section>
                <h3 className="text-xs font-semibold text-slate-900 mb-2.5">What each power allows</h3>
                <div className="space-y-3">
                  {grouped(powers).map(([group, items]) => (
                    <div key={group} className="rounded-xl border border-slate-200/80 overflow-hidden">
                      <p className="px-4 py-2 bg-slate-50/80 border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{group}</p>
                      <dl className="divide-y divide-slate-100">
                        {items.map((p) => (
                          <div key={p.key} className="px-4 py-2.5 sm:grid sm:grid-cols-[minmax(0,13rem)_1fr] sm:gap-4">
                            <dt className="text-[13px] font-semibold text-slate-900">{p.label}</dt>
                            <dd className="text-[13px] text-slate-600">{p.hint}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <div className="px-6 py-3.5 border-t border-slate-200/80 flex items-center justify-end">
            <button type="button" onClick={() => setShowInfo(false)}
              className="px-5 py-2 rounded-lg text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors">
              Got it
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {viaSecondary && (
        <p className="mt-4 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200/80 rounded-xl px-3.5 py-2.5">
          You are signed in with an additional login{signedInAs ? ` (${signedInAs})` : ''}. Sign in with the main account's email and password to add, change or remove logins.
        </p>
      )}

      {!viaSecondary && adding && (
        <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className="block text-xs font-semibold text-slate-700 mb-1">Name / label <span className="text-slate-400 font-medium">(optional)</span></label>
              <input className={input} placeholder="e.g. Ops desk" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} /></div>
            <div><label className="block text-xs font-semibold text-slate-700 mb-1">Email *</label>
              <input type="email" className={input} placeholder="name@company.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
            <div><label className="block text-xs font-semibold text-slate-700 mb-1">Password * <span className="text-slate-400 font-medium">(min 6)</span></label>
              <input type="password" autoComplete="new-password" className={input} value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && add()} /></div>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-700 mb-1.5">What can this login do?</p>
            <AccessEditor value={form} onChange={setForm} powers={powers} />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setAdding(false); setForm(EMPTY_FORM); }}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
            <button onClick={add} disabled={saving}
              className="px-5 py-2 text-xs font-bold text-white bg-slate-900 rounded-xl hover:bg-slate-800 disabled:opacity-50">{saving ? 'Adding…' : 'Add login'}</button>
          </div>
        </div>
      )}

      {logins && logins.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100 border border-slate-200/80 rounded-xl overflow-hidden">
          {logins.map((l) => (
            <li key={l.id} className="px-4 py-3 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{l.label || l.email}</p>
                  {l.label && <p className="text-xs font-medium text-slate-500 truncate">{l.email}</p>}
                  <p className="text-[11px] font-medium text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-px rounded-md border text-[10px] font-bold ${
                      l.full_access ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      <HiOutlineShieldCheck className="w-3 h-3" />
                      {l.full_access ? 'Full access' : `Limited · ${l.permissions.length} power${l.permissions.length === 1 ? '' : 's'}`}
                    </span>
                    Last sign-in: {fmt(l.last_login)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => {
                    setAccessFor(accessFor === l.id ? null : l.id); setPwFor(null);
                    setAccess({ full_access: l.full_access, permissions: l.permissions });
                  }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
                    <HiOutlineAdjustments className="w-3.5 h-3.5" /> Access
                  </button>
                  <button onClick={() => { setPwFor(pwFor === l.id ? null : l.id); setNewPw(''); setAccessFor(null); }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">
                    <HiOutlineKey className="w-3.5 h-3.5" /> Password
                  </button>
                  <button onClick={() => remove(l)} title="Remove login"
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50"><HiOutlineTrash className="w-4 h-4" /></button>
                </div>
              </div>
              {accessFor === l.id && (
                <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <AccessEditor value={access} onChange={setAccess} powers={powers} />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setAccessFor(null)}
                      className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
                    <button onClick={() => saveAccess(l.id)}
                      className="px-5 py-2 text-xs font-bold text-white bg-slate-900 rounded-xl hover:bg-slate-800">Save access</button>
                  </div>
                </div>
              )}
              {pwFor === l.id && (
                <div className="mt-3 flex items-center gap-2">
                  <input type="password" autoComplete="new-password" placeholder="New password (min 6)" className={input} value={newPw}
                    onChange={(e) => setNewPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && changePw(l.id)} />
                  <button onClick={() => changePw(l.id)} className="px-4 py-2 text-xs font-bold text-white bg-slate-900 rounded-xl hover:bg-slate-800 whitespace-nowrap">Save</button>
                  <button onClick={() => setPwFor(null)} className="p-2 text-slate-400 hover:text-slate-700"><HiOutlineX className="w-4 h-4" /></button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {logins && logins.length === 0 && !adding && !viaSecondary && (
        <p className="mt-4 text-sm font-medium text-slate-400">No additional logins yet.</p>
      )}
      {ConfirmDialog}
    </div>
  );
}
