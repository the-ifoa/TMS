import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HiOutlinePlusCircle, HiOutlineUsers, HiOutlineDocumentText, HiOutlineAcademicCap, HiOutlineArrowRight,
  HiOutlineShieldCheck, HiOutlineClock, HiOutlineExclamation, HiOutlineOfficeBuilding, HiOutlineBadgeCheck,
} from 'react-icons/hi';
import { getParticipantsByAirline, getTeamPerformance } from '../api';
import { useAuth } from '../context/AuthContext';
import { certExpiry } from '../utils/certValidity';
import { COURSE_COLORS, COURSE_FALLBACK, MONTHS, initials, fmtDate, tally } from '../components/dashboard/helpers';
import { VIZ, ChartCard, Empty, StatTile, AreaChart, Donut, BarList } from '../components/dashboard/Charts';

// IFOA admin dashboard — the whole operation at a glance: how much is coming
// in, from which airlines, how much certificate work is waiting, and how
// candidates are doing in exams. Each request fails quietly, so a sub-admin
// without a given power just sees that card empty.
export default function AdminDashboard() {
  const { admin, can } = useAuth();
  const [groups, setGroups] = useState([]);
  const [perf, setPerf] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const quiet = (p, set, pick = (r) => r.data) => p.then((r) => set(pick(r))).catch(() => {});
    Promise.all([
      quiet(getParticipantsByAirline(), setGroups, (r) => r.data || []),
      quiet(getTeamPerformance(), setPerf),
    ]).finally(() => setLoading(false));
  }, []);

  // Every participant, tagged with the airline it was filed under.
  const people = useMemo(
    () => groups.flatMap((g) => (g.participants || []).map((p) => ({ ...p, _airline: g.airline?.airlineName || 'Unassigned' }))),
    [groups],
  );
  const airlineCount = groups.filter((g) => g.airline && !g.airline.is_unassigned).length;

  // ── Submissions received: the last six months, by the day they were filed ──
  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const value = people.filter((p) => {
        if (!p.created_at) return false;
        const t = new Date(p.created_at);
        return t.getFullYear() === d.getFullYear() && t.getMonth() === d.getMonth();
      }).length;
      return {
        key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS[d.getMonth()], value,
        note: `${MONTHS[d.getMonth()]} ${d.getFullYear()}${i === 5 ? ' · this month' : ''}`, current: i === 5,
      };
    });
  }, [people]);
  const thisMonth = months[5]?.value || 0;

  // ── Certificates: what is issued, what is waiting, what is running out ─────
  const certs = useMemo(() => {
    const out = { valid: 0, expiring: 0, expired: 0, pending: 0 };
    people.forEach((p) => {
      if (!p.cert_released) { out.pending += 1; return; }
      const e = certExpiry(p);
      if (!e || e.unlimited || e.status === 'valid') out.valid += 1;
      else if (e.status === 'expired') out.expired += 1;
      else out.expiring += 1;
    });
    out.issued = out.valid + out.expiring + out.expired;
    return out;
  }, [people]);

  const byAirline = useMemo(
    () => groups.filter((g) => (g.participants || []).length)
      .map((g) => ({ key: String(g.airline?._id || g.airline?.airlineName), label: g.airline?.airlineName || 'Unassigned', value: g.participants.length }))
      .sort((a, b) => b.value - a.value).slice(0, 7),
    [groups],
  );
  // Airlines with certificates still to issue — the admin's to-do list.
  const waiting = useMemo(
    () => groups.map((g) => ({
      key: String(g.airline?._id || g.airline?.airlineName),
      label: g.airline?.airlineName || 'Unassigned',
      value: (g.participants || []).filter((p) => !p.cert_released).length,
    })).filter((r) => r.value > 0).sort((a, b) => b.value - a.value).slice(0, 5),
    [groups],
  );
  const byType = useMemo(() => tally(people, (p) => p.training_type, 8)
    .map((r) => ({ ...r, color: COURSE_COLORS[r.label] || COURSE_FALLBACK })), [people]);
  const recent = useMemo(
    () => [...people].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 6),
    [people],
  );

  const overall = perf?.overall;
  const examRows = (perf?.exams || []).filter((e) => e.avg_percentage != null).slice(0, 6)
    .map((e) => ({ key: e.exam_id, label: e.title || 'Exam', value: e.avg_percentage, hint: `${e.attempts} attempt${e.attempts === 1 ? '' : 's'} · ${e.pass_rate ?? 0}% passed` }));

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
            <h1 className="mt-1 text-2xl sm:text-[1.75rem] font-bold text-white tracking-tight">Welcome back{admin?.name ? `, ${admin.name}` : ''}</h1>
            <p className="text-sm text-slate-300 mt-1">Submissions, certificates and exam results across every airline</p>
          </div>
          {can('participants.create') && (
            <Link to="/admin/participants/add"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-900 rounded-xl transition-colors font-semibold text-sm shadow-sm">
              <HiOutlinePlusCircle className="w-5 h-5" /> New Record
            </Link>
          )}
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <StatTile dark icon={HiOutlineOfficeBuilding} label="Airlines" value={airlineCount}
            sub={byAirline[0] ? `Largest: ${byAirline[0].label} (${byAirline[0].value})` : 'No airlines with submissions yet'} />
          <StatTile dark icon={HiOutlineUsers} label="Participants" value={people.length}
            spark={months.map((m) => m.value)}
            sub={thisMonth ? `${thisMonth} submitted this month` : 'No submissions this month'} />
          <StatTile dark icon={HiOutlineBadgeCheck} label="Certificates to issue" value={certs.pending}
            ring={pct(certs.issued, people.length)}
            sub={people.length ? `${certs.issued} of ${people.length} issued (${pct(certs.issued, people.length)}%)` : 'No participants yet'} />
          <StatTile dark icon={HiOutlineAcademicCap} label="Exam pass rate" value={overall?.pass_rate ?? '—'} suffix={overall?.pass_rate != null ? '%' : ''}
            ring={overall?.pass_rate ?? null}
            sub={overall?.attempts ? `${overall.attempts} attempts · average ${overall.avg_percentage ?? '—'}%` : 'No finished exams yet'} />
        </div>
      </div>

      {/* Two columns of equal height; the last card in each grows to line up the bottoms */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3 flex flex-col gap-5 min-w-0">
          <ChartCard title="Submissions received" subtitle="New participant records filed in each of the last six months"
            action={<Link to="/admin/participants" className={LINK}>Participants <HiOutlineArrowRight className="w-4 h-4" /></Link>}>
            {people.length ? <AreaChart data={months} unit="submissions" caption="Submissions received by month" /> : <Empty>No submissions yet.</Empty>}
          </ChartCard>

          <ChartCard title="Participants by airline" subtitle="The airlines with the most enrolled participants"
            action={<Link to="/admin/airlines" className={LINK}>Airlines <HiOutlineArrowRight className="w-4 h-4" /></Link>}>
            {byAirline.length
              ? <BarList rows={byAirline} caption="Participants by airline" valueHead="Participants" />
              : <Empty>No airline submissions yet.</Empty>}
          </ChartCard>

          <ChartCard title="Training mix" subtitle="Participants per course type">
            {byType.length ? (
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
            ) : <Empty>No submissions yet.</Empty>}
          </ChartCard>

          <ChartCard className="flex-1" title="Average exam score by exam" subtitle="Mean score of finished attempts, lowest first"
            action={<Link to="/admin/exams" className={LINK}>Exam system <HiOutlineArrowRight className="w-4 h-4" /></Link>}>
            {examRows.length
              ? <BarList track rows={examRows} max={100} format={(v) => `${v}%`} caption="Average exam score by exam" valueHead="Average score" />
              : <Empty>Scores appear once an exam attempt is finished.</Empty>}
          </ChartCard>
        </div>

        <div className="lg:col-span-2 flex flex-col gap-5 min-w-0">
          <ChartCard title="Certificate status" subtitle="Where every participant's IFOA certificate stands today">
            {people.length ? (
              <>
                <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-5 sm:gap-6">
                  <Donut segments={certCells} centerValue={people.length} centerLabel="participants" caption="Certificate status" />
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
                  {waiting.length ? (
                    <>
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <p className="text-[13px] font-semibold text-slate-900">Waiting for a certificate</p>
                        <Link to="/admin/airlines?pendingCerts=1" className={LINK}>Open <HiOutlineArrowRight className="w-4 h-4" /></Link>
                      </div>
                      <ul className="space-y-2">
                        {waiting.map((w) => (
                          <li key={w.key} className="flex items-center justify-between gap-3 text-[13px]">
                            <span className="min-w-0 truncate font-medium text-slate-800">{w.label}</span>
                            <span className="whitespace-nowrap text-slate-600"><span className="font-semibold text-slate-900">{w.value}</span> to issue</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="flex items-center gap-2 text-[13px] text-slate-600">
                      <HiOutlineShieldCheck className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      Every participant has a certificate issued.
                    </p>
                  )}
                </div>
              </>
            ) : <Empty>No participants yet.</Empty>}
          </ChartCard>

          <ChartCard className="flex-1" title="Recent records" subtitle="The latest submissions across all airlines"
            action={<Link to="/admin/airlines" className={LINK}>All <HiOutlineArrowRight className="w-4 h-4" /></Link>}>
            {recent.length ? (
              <ul className="flex-1 flex flex-col justify-between gap-1 -mx-2">
                {recent.map((p) => (
                  <li key={p.id || p._id} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-50 transition-colors">
                    <span className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center flex-shrink-0">{initials(p.participant_name)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 truncate capitalize">{p.participant_name}</p>
                      <p className="text-[13px] text-slate-500 truncate">{p._airline}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {p.training_type && (
                        <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-800">
                          <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: COURSE_COLORS[p.training_type] || COURSE_FALLBACK }} />
                          {p.training_type}
                        </p>
                      )}
                      <p className="text-xs text-slate-500">{fmtDate(p.created_at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <Empty>No records yet. Add your first participant.</Empty>}
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
