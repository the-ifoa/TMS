import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineX, HiOutlineInboxIn, HiOutlinePaperAirplane, HiOutlineOfficeBuilding, HiOutlineStar,
} from 'react-icons/hi';
import { getFeedbackDashboard } from '../api';
import { useHistoryState } from '@/hooks/use-history-state';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { MONTHS, initials, fmtDate } from '../components/dashboard/helpers';
import { ChartCard, Empty, StatTile, AreaChart, Donut, BarList, StackedBar, Legend } from '../components/dashboard/Charts';
import {
  SCALE_FILL, BandChip, RatingRow, RATING_ROW, fmtAvg, bandOf, scaleLabel, sectionTitle,
} from '../components/feedback/RatingUi';
import { Heatmap } from '../components/feedback/FeedbackCharts';

// ─── Training feedback dashboard (IFOA admin) ─────────────────────────────────
// Same layout and chart kit as the admin dashboard: a dark hero band with the
// headline numbers, then two columns of cards — rating over time, by airline,
// airline × section, every question; how answers split, each section, by
// training and the latest comments. Filters (airline, exam, dates) narrow everything.

const SECTION_SHORT = { overall_rating: 'Quality', content: 'Content', instructor: 'Instructor', overall: 'Overall' };
const shortName = (s) => SECTION_SHORT[s.key] || sectionTitle(s.title);
const one = (v) => (v == null ? 0 : Math.round(v * 10) / 10);

// Filter controls styled for the dark hero band.
const DARK_CONTROL = 'h-9 text-xs bg-white/10 border-white/15 text-white rounded-lg hover:bg-white/15 focus:ring-white/20';

export default function FeedbackDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [airline, setAirline] = useHistoryState('fbAirline', '');
  const [examId, setExamId] = useHistoryState('fbExam', '');
  const [from, setFrom] = useHistoryState('fbFrom', '');
  const [to, setTo] = useHistoryState('fbTo', '');
  const [questionOrder, setQuestionOrder] = useState('lowest'); // lowest | form

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (airline) params.airline = airline;
    if (examId) params.exam_id = examId;
    if (from) params.from = from;
    if (to) params.to = to;
    getFeedbackDashboard(params)
      .then((res) => setData(res.data))
      .catch((err) => toast.error(err.response?.data?.error || 'Failed to load feedback.'))
      .finally(() => setLoading(false));
  }, [airline, examId, from, to]);

  const scale = data?.form.scale || [];
  const sections = data?.form.sections || [];
  const totals = data?.totals;
  const filtersOn = airline || examId || from || to;
  const resetFilters = () => { setAirline(''); setExamId(''); setFrom(''); setTo(''); };
  const has = (totals?.submitted || 0) > 0;

  const ratedAirlines = (data?.airlines || []).filter((a) => a.responses > 0);
  const ratedExams = (data?.exams || []).filter((e) => e.responses > 0);

  // ── Rating over time: average per month, as the dashboard's area chart ──
  const trend = useMemo(() => (data?.trend || []).map((m, i, arr) => {
    const [y, mo] = m.month.split('-').map(Number);
    return {
      key: m.month, label: MONTHS[mo - 1], value: one(m.average), current: i === arr.length - 1,
      note: `${MONTHS[mo - 1]} ${y} · ${m.responses} response${m.responses === 1 ? '' : 's'}`,
    };
  }), [data]);

  // ── How answers split: 1–5 as donut segments ──
  const answerSegments = scale.map((sc, i) => ({ key: String(sc.value), label: sc.label, value: totals?.distribution[i] || 0, color: SCALE_FILL[sc.value] }));
  const answerTotal = answerSegments.reduce((t, s) => t + s.value, 0);

  const questions = useMemo(() => {
    const list = (data?.statements || []).filter((s) => s.count > 0);
    return questionOrder === 'lowest' ? [...list].sort((a, b) => a.average - b.average) : list;
  }, [data, questionOrder]);

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const best = ratedAirlines[0];

  return (
    <div className={`p-4 sm:p-6 space-y-5 transition-opacity ${loading && data ? 'opacity-70' : ''}`}>
      {/* Hero band: title + filters + the four headline numbers */}
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-5 sm:p-7 shadow-[0_20px_40px_-24px_rgba(15,23,42,0.55)]">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium text-slate-400">{today}</p>
            <h1 className="mt-1 text-2xl sm:text-[1.75rem] font-bold text-white tracking-tight">Training feedback</h1>
            <p className="text-sm text-slate-300 mt-1">What participants said about every IFOA training, by airline, exam and question</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={airline || 'all'} onValueChange={(v) => setAirline(v === 'all' ? '' : v)}>
              <SelectTrigger className={`w-44 ${DARK_CONTROL}`}><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">All airlines</SelectItem>
                {(data?.options.airlines || []).map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={examId || 'all'} onValueChange={(v) => setExamId(v === 'all' ? '' : v)}>
              <SelectTrigger className={`w-48 ${DARK_CONTROL}`}><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">All exams</SelectItem>
                {(data?.options.exams || []).map((e) => <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>)}
              </SelectContent>
            </Select>
            <label className={`inline-flex items-center gap-1.5 px-2.5 border ${DARK_CONTROL}`}>
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From date"
                className="date-on-dark bg-transparent outline-none text-xs" />
              <span className="text-slate-500">→</span>
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To date"
                className="date-on-dark bg-transparent outline-none text-xs" />
            </label>
            {filtersOn && (
              <button type="button" onClick={resetFilters}
                className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-white text-slate-900 text-xs font-semibold hover:bg-slate-100">
                <HiOutlineX className="w-3.5 h-3.5" /> Reset
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <StatTile dark icon={HiOutlineStar} label="Overall rating" value={totals ? fmtAvg(totals.average) : '—'} suffix={totals?.average != null ? ' / 5' : ''}
            ring={totals?.average != null ? (totals.average / 5) * 100 : null}
            sub={totals?.average != null ? scaleLabel(scale, bandOf(totals.average)) : 'No ratings yet'} />
          <StatTile dark icon={HiOutlineInboxIn} label="Responses" value={totals?.submitted ?? '—'}
            spark={(data?.trend || []).length > 1 ? data.trend.map((m) => m.responses) : null}
            sub={totals ? `of ${totals.sent} form${totals.sent === 1 ? '' : 's'} sent` : ''} />
          <StatTile dark icon={HiOutlinePaperAirplane} label="Response rate" value={totals?.rate ?? '—'} suffix={totals?.rate != null ? '%' : ''}
            ring={totals?.rate ?? null}
            sub={totals ? `${totals.submitted} of ${totals.sent} completed the survey` : ''} />
          <StatTile dark icon={HiOutlineOfficeBuilding} label="Airlines" value={totals?.airlines ?? '—'}
            sub={best ? `Top rated: ${best.name} (${fmtAvg(best.average)})` : 'No airline feedback yet'} />
        </div>
      </div>

      {data && !has ? (
        <ChartCard title="No feedback yet" subtitle={filtersOn ? 'Nothing matches these filters.' : 'Responses appear here once participants submit the form.'}>
          <Empty>
            {filtersOn ? 'Try a wider date range or another airline.' : 'Send the feedback form from an IFOA exam card (Exam System → Feedback).'}
          </Empty>
        </ChartCard>
      ) : data && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* ── Left column ── */}
          <div className="lg:col-span-3 flex flex-col gap-5 min-w-0">
            <ChartCard title="Rating over time" subtitle="Average rating out of 5 in each month that had responses">
              {trend.length ? <AreaChart data={trend} unit="/ 5" caption="Average rating by month" /> : <Empty>No responses in this period.</Empty>}
            </ChartCard>

            <ChartCard title="Average rating by airline" subtitle="Highest rated first, out of 5">
              {ratedAirlines.length ? (
                <BarList track max={5} format={(v) => fmtAvg(v)} caption="Average rating by airline" valueHead="Average rating"
                  rows={ratedAirlines.slice(0, 8).map((a) => ({
                    key: a.name, label: a.name, value: a.average,
                    hint: `${a.responses} response${a.responses === 1 ? '' : 's'} · ${scaleLabel(scale, bandOf(a.average))}`,
                  }))} />
              ) : <Empty>No airline feedback yet.</Empty>}
            </ChartCard>

            <ChartCard title="Airline strengths by section" subtitle="Each airline's average for every part of the form. Darker blue is better, red is weaker. Click an airline to filter.">
              <Heatmap
                scale={scale}
                selectedKey={airline}
                onSelect={(name) => setAirline(airline === name ? '' : name)}
                columns={sections.map((s) => ({ key: s.key, short: shortName(s), title: sectionTitle(s.title) }))}
                rows={ratedAirlines.map((a) => ({ key: a.name, label: a.name, values: a.sections, total: a.average }))}
              />
            </ChartCard>

            <ChartCard className="flex-1" title="Every question"
              subtitle={questionOrder === 'lowest' ? 'Lowest rated first: where the training can improve' : 'In the order they appear on the form'}
              action={(
                <div className="inline-flex p-0.5 rounded-lg bg-slate-100 border border-slate-200/70 flex-shrink-0">
                  {[['lowest', 'Lowest first'], ['form', 'Form order']].map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setQuestionOrder(k)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${questionOrder === k ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-700'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              )}>
              <div className="-mx-5 sm:-mx-6 -mb-5 sm:-mb-6">
                <div className={`hidden ${RATING_ROW} px-4 py-2 bg-slate-50 border-y border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400`}>
                  <span>Statement</span><span>Answers</span><span className="text-right">Avg</span><span>Rating</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {questions.map((q) => (
                    <RatingRow key={q.key} text={q.text} average={q.average} distribution={q.distribution} scale={scale} />
                  ))}
                </div>
              </div>
            </ChartCard>
          </div>

          {/* ── Right column ── */}
          <div className="lg:col-span-2 flex flex-col gap-5 min-w-0">
            <ChartCard title="How participants answered" subtitle="Every rating given, from Poor to Excellent">
              <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-5 sm:gap-6">
                <Donut segments={answerSegments} centerValue={totals.submitted} centerLabel={totals.submitted === 1 ? 'response' : 'responses'} caption="Ratings given" />
                <ul className="w-full flex-1 space-y-2.5">
                  {[...answerSegments].reverse().map((s) => (
                    <li key={s.key} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 min-w-0 text-sm text-slate-700">
                        <span className="w-3 h-3 rounded-[4px] flex-shrink-0" style={{ background: s.color }} />
                        <span className="truncate">{s.label}</span>
                      </span>
                      <span className="text-sm font-semibold text-slate-900">
                        {s.value}
                        <span className="ml-1.5 font-normal text-slate-400">{pct(s.value, answerTotal)}%</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-4 pt-3.5 border-t border-slate-100">
                <p className="text-[13px] font-semibold text-slate-900 mb-2">Average by section</p>
                <ul className="space-y-2">
                  {data.sections.map((s) => (
                    <li key={s.key} className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="min-w-0 truncate font-medium text-slate-800">{sectionTitle(s.title)}</span>
                      <span className="inline-flex items-center gap-2 flex-shrink-0">
                        <span className="font-semibold text-slate-900 tabular-nums">{fmtAvg(s.average)}</span>
                        <BandChip avg={s.average} scale={scale} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </ChartCard>

            <ChartCard title="Answers by section" subtitle="How the ratings split in each part of the form">
              <div className="space-y-4">
                {data.sections.map((s) => (
                  <div key={s.key}>
                    <p className="text-[13px] font-medium text-slate-800 mb-1.5 truncate">{sectionTitle(s.title)}</p>
                    <StackedBar legend={false} height={14}
                      segments={scale.map((sc, i) => ({ key: String(sc.value), label: sc.label, value: s.distribution[i], color: SCALE_FILL[sc.value] }))} />
                  </div>
                ))}
                <div className="pt-1">
                  <Legend items={scale.map((sc) => ({ label: sc.label, color: SCALE_FILL[sc.value] }))} />
                </div>
              </div>
            </ChartCard>

            <ChartCard title="Average rating by training" subtitle="Each exam's feedback, out of 5">
              {ratedExams.length ? (
                <BarList track max={5} format={(v) => fmtAvg(v)} caption="Average rating by training" valueHead="Average rating"
                  rows={ratedExams.slice(0, 6).map((e) => ({
                    key: e.exam_id, label: e.title, value: e.average,
                    hint: `${e.responses} of ${e.sent} replied`,
                  }))} />
              ) : <Empty>No training feedback yet.</Empty>}
            </ChartCard>

            <ChartCard className="flex-1" title="Latest comments" subtitle="What participants wrote, newest first">
              {data.comments.length ? (
                <ul className="flex-1 flex flex-col gap-1 -mx-2">
                  {data.comments.slice(0, 6).map((c) => (
                    <li key={c.id} className="flex items-start gap-3 px-2 py-2 rounded-xl hover:bg-slate-50 transition-colors">
                      <span className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center flex-shrink-0">{initials(c.participant_name)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900 truncate">{c.participant_name || 'Participant'}</p>
                          {c.average != null && <BandChip avg={c.average} scale={scale} className="flex-shrink-0" />}
                        </div>
                        <p className="text-xs text-slate-500 truncate">{[c.airline, fmtDate(c.submitted_at)].filter(Boolean).join(' · ')}</p>
                        <p className="mt-1 text-[13px] text-slate-700 leading-snug line-clamp-3" title={c.comments}>{c.comments}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <Empty>No written comments yet.</Empty>}
            </ChartCard>
          </div>
        </div>
      )}
    </div>
  );
}
