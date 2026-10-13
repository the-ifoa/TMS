import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HiOutlinePlusCircle, HiOutlineLockClosed, HiOutlineUsers, HiOutlineDocumentText, HiOutlineAcademicCap,
  HiOutlineBadgeCheck, HiOutlineArrowRight, HiOutlineShieldCheck, HiOutlineClock, HiOutlineExclamation,
} from 'react-icons/hi';
import { getParticipants, getTeamPerformance, getAirlineExamResults } from '../api';
import { useAuth } from '../context/AuthContext';
import { certExpiry, timeLeftLabel, fmtExpiry } from '../utils/certValidity';
import { COURSE_COLORS, COURSE_FALLBACK, MONTHS, initials, fmtDate, tally } from '../components/dashboard/helpers';
import {
  VIZ, ChartCard, Empty, StatTile, AreaChart, Donut, BarList, StackedBar, Legend,
} from '../components/dashboard/Charts';

// Main-airline dashboard: the account's own data, drawn rather than listed —
// enrollments over time, training mix, certificate validity, exam progress and
// exam accuracy. Every chart falls back to a short empty note when it has no data.
export default function AirlineDashboard() {
  const { admin, can } = useAuth();
  const [people, setPeople] = useState([]);
  const [perf, setPerf] = useState(null);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const quiet = (p, set, pick = (r) => r.data) => p.then((r) => set(pick(r))).catch(() => {});
    Promise.all([
      can('participants.view') ? quiet(getParticipants(), setPeople, (r) => r.data || []) : null,
      quiet(getTeamPerformance(), setPerf),
      quiet(getAirlineExamResults(), setInvites, (r) => r.data || []),
    ]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Enrollments: six months around today, by training start month ──────────
  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 3 + i, 1);
      const value = people.filter((p) => {
        if (!p.training_date) return false;
        const t = new Date(p.training_date);
        return t.getFullYear() === d.getFullYear() && t.getMonth() === d.getMonth();
      }).length;
      return {
        key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS[d.getMonth()], value,
        note: `${MONTHS[d.getMonth()]} ${d.getFullYear()}${i === 3 ? ' · this month' : ''}`, current: i === 3,
      };
    });
  }, [people]);
  const thisMonth = months[3]?.value || 0;

  const byType = useMemo(() => tally(people, (p) => p.training_type, 8)
    .map((r) => ({ ...r, color: COURSE_COLORS[r.label] || COURSE_FALLBACK })), [people]);
  const byDept = useMemo(() => tally(people, (p) => (p.department || '').trim(), 6), [people]);

  // ── IFOA certificates: issued vs pending, and how the issued ones stand ────
  const certs = useMemo(() => {
    const out = { valid: 0, expiring: 0, expired: 0, pending: 0, soon: [] };
    people.forEach((p) => {
      const e = certExpiry(p);
      if (!p.cert_released) { out.pending += 1; return; }
      if (!e || e.unlimited || e.status === 'valid') { out.valid += 1; return; }
      if (e.status === 'expired') out.expired += 1; else out.expiring += 1;
      out.soon.push({ id: p.id || p._id, name: p.participant_name, type: p.training_type, ...e });
    });
    out.soon.sort((a, b) => a.daysLeft - b.daysLeft);
    out.issued = out.valid + out.expiring + out.expired;
    return out;
  }, [people]);

  // ── Exams: one row per exam, each student counted once (latest / completed) ─
  const exams = useMemo(() => {
    const map = new Map();
    invites.forEach((r) => {
      if (!map.has(r.exam_id)) map.set(r.exam_id, { key: r.exam_id, title: r.exam_title_snapshot, byStudent: new Map() });
      const b = map.get(r.exam_id);
      const pid = String(r.participant_id || r.id);
      const prev = b.byStudent.get(pid);
      if (!prev || r.status === 'completed' || prev.status !== 'completed') b.byStudent.set(pid, r);
    });
    return [...map.values()].map((b) => {
      const s = [...b.byStudent.values()];
      const done = s.filter((x) => x.status === 'completed').length;
      const started = s.filter((x) => x.status === 'opened' || x.status === 'in_progress').length;
      return { key: b.key, title: b.title, total: s.length, done, started, waiting: s.length - done - started };
    }).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [invites]);

  const overall = perf?.overall;
  const sections = (perf?.section_breakdown || []).filter((s) => s.accuracy != null).slice(0, 7)
    .map((s) => ({ key: s.section || '__none', label: s.section || 'General', value: s.accuracy, hint: `${s.correct}/${s.total} correct`, correct: s.correct, total: s.total }));
  const weakest = sections[0];
  const strongest = sections.length > 1 ? sections[sections.length - 1] : null;
  const recent = useMemo(
    () => [...people].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 5),
    [people],
  );

  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const LINK = 'text-[13px] font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap inline-flex items-center gap-1';
  const certCells = [
    { key: 'valid', label: 'Valid', value: certs.valid, color: VIZ.good, icon: HiOutlineShieldCheck },
    { key: 'expiring', label: 'Expiring in 90 days', value: certs.expiring, color: VIZ.warning, icon: HiOutlineClock },
    { key: 'expired', label: 'Expired', value: certs.expired, color: VIZ.critical, icon: HiOutlineExclamation },
    { key: 'pending', label: 'Not issued yet', value: certs.pending, color: VIZ.neutral, icon: HiOutlineDocumentText },
  ];

  return (
    <div className={`p-4 sm:p-6 space-y-5 transition-opacity ${loading ? 'opacity-60' : ''}`}>
      {/* Hero band: greeting + the four headline numbers */}
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-5 sm:p-7 shadow-[0_20px_40px_-24px_rgba(15,23,42,0.55)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium text-slate-400">{today}</p>
            <h1 className="mt-1 text-2xl sm:text-[1.75rem] font-bold text-white tracking-tight">Welcome, {admin?.airlineName || admin?.name || 'Airline'}</h1>
            <p className="text-sm text-slate-300 mt-1">Your training, certificates and exam results at a glance</p>
          </div>
          {can('participants.create') && (
            <Link to="/airline/enrollment/new"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-900 rounded-xl transition-colors font-semibold text-sm shadow-sm">
              <HiOutlinePlusCircle className="w-5 h-5" /> New Enrollment
            </Link>
          )}
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <StatTile dark icon={HiOutlineUsers} label="Participants" value={people.length}
            spark={months.slice(0, 4).map((m) => m.value)}
            sub={thisMonth ? `${thisMonth} start training this month` : 'No training starting this month'} />
          <StatTile dark icon={HiOutlineBadgeCheck} label="IFOA certificates issued" value={certs.issued}
            ring={pct(certs.issued, people.length)}
            sub={people.length ? `${pct(certs.issued, people.length)}% of ${people.length} participants` : 'No participants yet'} />
          <StatTile dark icon={HiOutlineAcademicCap} label="Average exam score" value={overall?.avg_percentage ?? '—'} suffix={overall?.avg_percentage != null ? '%' : ''}
            ring={overall?.avg_percentage ?? null}
            sub={overall?.attempts ? `Across ${overall.attempts} finished attempt${overall.attempts === 1 ? '' : 's'}` : 'No finished exams yet'} />
          <StatTile dark icon={HiOutlineShieldCheck} label="Exam pass rate" value={overall?.pass_rate ?? '—'} suffix={overall?.pass_rate != null ? '%' : ''}
            ring={overall?.pass_rate ?? null}
            sub={overall?.participants ? `${overall.participants} candidate${overall.participants === 1 ? '' : 's'} examined` : 'No candidates examined yet'} />
        </div>
      </div>

      {/* Two columns of equal height: cards stack freely, and the last card in
          each column grows so both columns end on the same line. */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3 flex flex-col gap-5 min-w-0">
          <ChartCard title="Training starts by month"
            subtitle="Participants by the month their training begins"
            action={<Link to="/airline/submissions" className={LINK}>Submissions <HiOutlineArrowRight className="w-4 h-4" /></Link>}>
            {people.length ? <AreaChart data={months} unit="participants" caption="Training starts by month" /> : <Empty>No enrollments yet.</Empty>}
          </ChartCard>

          <ChartCard title="Exam progress" subtitle="How far your students are through each exam"
            action={<Link to="/airline/exams" className={LINK}>Exam results <HiOutlineArrowRight className="w-4 h-4" /></Link>}>
            {exams.length ? (
              <>
                <div className="space-y-3">
                  {exams.map((e) => {
                    const share = pct(e.done, e.total);
                    return (
                      <div key={e.key} className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3.5">
                        <div className="flex items-center justify-between gap-4 mb-2.5">
                          <p className="text-sm font-semibold text-slate-900 truncate" title={e.title}>{e.title}</p>
                          <p className="flex items-baseline gap-1.5 flex-shrink-0">
                            <span className="text-lg font-bold text-slate-900 leading-none">{share}%</span>
                            <span className="text-xs text-slate-500">complete</span>
                          </p>
                        </div>
                        <StackedBar legend={false} height={10} caption={`${e.title} progress`} segments={[
                          { key: 'done', label: 'Completed', value: e.done, color: VIZ.series },
                          { key: 'started', label: 'In progress', value: e.started, color: VIZ.seriesSoft },
                          { key: 'waiting', label: 'Not started', value: e.waiting, color: VIZ.neutral },
                        ]} />
                        <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate-600">
                          <span><span className="font-semibold text-slate-900">{e.done}</span> completed</span>
                          <span><span className="font-semibold text-slate-900">{e.started}</span> in progress</span>
                          <span><span className="font-semibold text-slate-900">{e.waiting}</span> not started</span>
                        </p>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4">
                  <Legend items={[{ label: 'Completed', color: VIZ.series }, { label: 'In progress', color: VIZ.seriesSoft }, { label: 'Not started', color: VIZ.neutral }]} />
                </div>
              </>
            ) : <Empty>No exams have been sent to your students yet.</Empty>}
          </ChartCard>

          <ChartCard className="flex-1" title="Exam accuracy by section" subtitle="Share of questions answered correctly, weakest section first">
            {sections.length ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                  {[['Needs the most work', weakest], ['Strongest section', strongest]].filter(([, x]) => x).map(([title, x]) => (
                    <div key={title} className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                      <p className="text-xs font-medium text-slate-500">{title}</p>
                      <p className="mt-1 flex items-baseline justify-between gap-3">
                        <span className="text-sm font-semibold text-slate-900 truncate">{x.label}</span>
                        <span className="text-xl font-bold text-slate-900 leading-none flex-shrink-0">{x.value}%</span>
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{x.correct} of {x.total} answers correct</p>
                    </div>
                  ))}
                </div>
                <BarList track rows={sections} max={100} format={(v) => `${v}%`} caption="Exam accuracy by section" valueHead="Accuracy" />
              </>
            ) : <Empty>Accuracy appears once an exam attempt is finished.</Empty>}
          </ChartCard>
        </div>

        <div className="lg:col-span-2 flex flex-col gap-5 min-w-0">
          <ChartCard title="IFOA certificate status" subtitle="Where every participant's certificate stands today">
            {people.length ? (
              <>
                <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-5 sm:gap-6">
                  <Donut segments={certCells} centerValue={people.length} centerLabel="participants" caption="IFOA certificate status" />
                  <ul className="w-full flex-1 space-y-2.5">
                    {certCells.map((c) => (
                      <li key={c.key} className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 min-w-0 text-sm text-slate-700">
                          <span className="w-3 h-3 rounded-[4px] flex-shrink-0" style={{ background: c.color }} />
                          <c.icon className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          <span className="truncate">{c.label}</span>
                        </span>
                        <span className="text-sm font-semibold text-slate-900">
                          {c.value}
                          <span className="ml-1.5 font-normal text-slate-400">{pct(c.value, people.length)}%</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-4 pt-3.5 border-t border-slate-100">
                  {certs.soon.length ? (
                    <>
                      <p className="text-[13px] font-semibold text-slate-900 mb-2">Needs attention first</p>
                      <ul className="space-y-2">
                        {certs.soon.slice(0, 3).map((c) => (
                          <li key={c.id} className="flex items-center justify-between gap-3 text-[13px]">
                            <span className="min-w-0 truncate font-medium text-slate-800 capitalize">
                              {c.name} <span className="font-normal text-slate-400 normal-case">· {c.type}</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-slate-600" title={`Valid until ${fmtExpiry(c.expiresOn)}`}>
                              <span className="w-2 h-2 rounded-full" style={{ background: c.status === 'expired' ? VIZ.critical : VIZ.warning }} />
                              {timeLeftLabel(c.daysLeft)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="flex items-center gap-2 text-[13px] text-slate-600">
                      <HiOutlineShieldCheck className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      Nothing expires in the next 90 days.
                    </p>
                  )}
                </div>
              </>
            ) : <Empty>No participants yet.</Empty>}
          </ChartCard>

          <ChartCard title="Training mix" subtitle="Participants per course type and department">
            {people.length ? (
              <div className="space-y-5">
                <div>
                  <p className="text-[13px] font-semibold text-slate-900 mb-3">By course</p>
                  <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-5 sm:gap-6">
                    <Donut size={148} segments={byType} centerValue={byType.length} centerLabel={byType.length === 1 ? 'course' : 'courses'} caption="Participants per course type" />
                    <ul className="w-full flex-1 space-y-2.5">
                      {byType.map((c) => (
                        <li key={c.key} className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-2 min-w-0 text-sm text-slate-700">
                            <span className="w-3 h-3 rounded-[4px] flex-shrink-0" style={{ background: c.color }} />
                            <span className="truncate">{c.label}</span>
                          </span>
                          <span className="text-sm font-semibold text-slate-900">
                            {c.value}
                            <span className="ml-1.5 font-normal text-slate-400">{pct(c.value, people.length)}%</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="pt-5 border-t border-slate-100">
                  <p className="text-[13px] font-semibold text-slate-900 mb-3">By department</p>
                  <BarList rows={byDept} caption="Participants by department" valueHead="Participants" />
                </div>
              </div>
            ) : <Empty>No enrollments yet.</Empty>}
          </ChartCard>

          <ChartCard className="flex-1" title="Recent submissions" subtitle="The latest enrollments you filed"
            action={<Link to="/airline/participants" className={LINK}>All <HiOutlineArrowRight className="w-4 h-4" /></Link>}>
            {recent.length ? (
              <ul className="flex-1 flex flex-col justify-between gap-1 -mx-2">
                {recent.map((p) => (
                  <li key={p.id || p._id} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-50 transition-colors">
                    <span className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center flex-shrink-0">{initials(p.participant_name)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 truncate capitalize">{p.participant_name}</p>
                      <p className="text-[13px] text-slate-500 truncate">{p.department || 'No department'}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {p.training_type && (
                        <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-800">
                          <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: COURSE_COLORS[p.training_type] || COURSE_FALLBACK }} />
                          {p.training_type}
                        </p>
                      )}
                      <p className="text-xs text-slate-500">{fmtDate(p.training_date)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <Empty>No submissions yet. Start by adding a participant.</Empty>}
          </ChartCard>
        </div>
      </div>

      <p className="flex items-center gap-2 text-xs text-slate-500">
        <HiOutlineLockClosed className="w-4 h-4 flex-shrink-0 text-slate-400" />
        Submissions are locked after filing. Only IFOA administrators can edit records or generate certificates.
      </p>
    </div>
  );
}
