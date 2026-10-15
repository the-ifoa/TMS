

// ─── Permission Toggle Card ───────────────────────────────────────────────────
export function PermissionToggleCard({
  icon: Icon,
  iconColor = 'text-blue-600',
  iconBg = 'bg-blue-50 border-blue-100',
  title,
  description,
  checked,
  onChange,
  disabled = false,
}) {
  return (
    <div
      onClick={() => !disabled && onChange(!checked)}
      className={`group relative flex items-start gap-3.5 p-3.5 rounded-xl border transition-all duration-200 cursor-pointer select-none ${
        checked
          ? 'bg-blue-50/50 border-blue-200/90 ring-1 ring-blue-500/10 shadow-2xs'
          : 'bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/60'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border mt-0.5 transition-colors ${
        checked ? `${iconBg} ${iconColor}` : 'bg-slate-100 border-slate-200/80 text-slate-500 group-hover:text-slate-700'
      }`}>
        <Icon className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <p className={`text-xs font-bold leading-snug ${checked ? 'text-slate-900' : 'text-slate-700 group-hover:text-slate-900'}`}>
            {title}
          </p>
          {/* Custom animated toggle switch */}
          <div
            role="switch"
            aria-checked={checked}
            className={`w-9 h-5 flex items-center rounded-full p-0.5 flex-shrink-0 transition-colors duration-200 ease-in-out ${
              checked ? 'bg-blue-600 shadow-xs' : 'bg-slate-200'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-xs transform transition-transform duration-200 ease-in-out ${
                checked ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </div>
        </div>
        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}
