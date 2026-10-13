import { HiOutlineInformationCircle } from 'react-icons/hi';

// The "how does this work?" button. A blue pill so the help it opens is easy
// to spot. `active` = the help is currently open.
export default function InfoButton({ onClick, active = false, label = 'How it works', title = 'How does this work?', className = '' }) {
  return (
    <button type="button" title={title} aria-label={title} aria-expanded={active} onClick={onClick}
      className={`inline-flex items-center gap-1 pl-1 pr-2 py-0.5 rounded-full border text-[11px] font-bold tracking-normal whitespace-nowrap cursor-pointer transition-colors ${
        active ? 'bg-blue-600 border-blue-600 text-white' : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
      } ${className}`}>
      <HiOutlineInformationCircle className="w-4 h-4" />
      {label}
    </button>
  );
}
