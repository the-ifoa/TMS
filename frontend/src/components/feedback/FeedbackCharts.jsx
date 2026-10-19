import { SCALE_FILL, bandOf, fmtAvg, scaleLabel } from './RatingUi';

// ─── Airline × section heatmap for the training-feedback dashboard ────────────
// Each cell is filled with its rating band (the diverging 1–5 scale from
// RatingUi) and always prints its score, so colour is never the only cue.

// Ink on a filled cell: white on the two deep ends, dark on the pale middle.
const inkOn = (band) => (band === 1 || band === 5 ? '#ffffff' : '#0f172a');

// Rows × sections, each cell filled with its rating band and the score printed in it.
export function Heatmap({ rows, columns, scale, onSelect, selectedKey }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] table-fixed border-separate" style={{ borderSpacing: 4 }}>
        <thead>
          <tr>
            <th className="w-44 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 pb-1">Airline</th>
            {columns.map((c) => (
              <th key={c.key} className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 pb-1" title={c.title}>{c.short}</th>
            ))}
            <th className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 pb-1">All</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} onClick={() => onSelect?.(r.key)} className="cursor-pointer group">
              <td className={`px-2 py-1 rounded-lg text-[13px] font-semibold text-slate-900 max-w-[12rem] truncate ${selectedKey === r.key ? 'bg-blue-50' : 'group-hover:bg-slate-50'}`}>{r.label}</td>
              {[...columns.map((c) => ({ key: c.key, title: c.title, v: r.values[c.key] })), { key: '__all', title: 'All sections', v: r.total }].map(({ key, title, v }) => {
                const band = v == null ? null : bandOf(v);
                return (
                  <td key={key} className="p-0">
                    {/* Native title: a custom tooltip would be clipped by the scroll box. */}
                    <span title={`${r.label} · ${title}: ${v == null ? 'No ratings' : `${fmtAvg(v)} / 5 · ${scaleLabel(scale, band)}`}`}
                      className={`flex h-10 items-center justify-center rounded-lg text-[13px] tabular-nums transition-transform hover:scale-[1.04] ${key === '__all' ? 'font-black' : 'font-bold'}`}
                      style={v == null ? { background: '#f8fafc', color: '#cbd5e1' } : { background: SCALE_FILL[band], color: inkOn(band) }}>
                      {fmtAvg(v)}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
