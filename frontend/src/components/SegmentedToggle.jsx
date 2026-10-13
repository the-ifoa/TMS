import { Highlight, HighlightItem } from '@/components/animate-ui/primitives/effects/highlight';

// Pill switch between a few views. The dark background glides from the old
// option to the new one (Animate UI Highlight).
// options: [{ key, label, count? }]
export default function SegmentedToggle({ options, value, onChange, className = '' }) {
  return (
    <div className={`inline-flex p-0.5 bg-slate-100 border border-slate-200/80 rounded-lg ${className}`}>
      <Highlight controlledItems value={value} onValueChange={(v) => v && v !== value && onChange(v)}
        className="inset-0 rounded-md bg-slate-900 shadow-2xs"
        transition={{ type: 'spring', stiffness: 420, damping: 36 }}>
        {options.map((o) => (
          <HighlightItem key={o.key} value={o.key}>
            <button type="button"
              className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11px] font-semibold transition-colors duration-200 ${
                value === o.key ? 'text-white' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {o.label}
              {o.count !== undefined && o.count !== null && (
                <span className={`transition-colors duration-200 ${value === o.key ? 'text-white/70' : 'text-slate-400'}`}>{o.count}</span>
              )}
            </button>
          </HighlightItem>
        ))}
      </Highlight>
    </div>
  );
}
