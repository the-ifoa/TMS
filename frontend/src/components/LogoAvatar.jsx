import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Airline/company logo avatar with a hover-zoom preview. The preview is
// rendered via a portal straight onto <body> with fixed positioning computed
// from the trigger's bounding rect — NOT a CSS-absolute child — because every
// card this sits in (Airlines.jsx, DgrForms.jsx, AttendanceSheets.jsx) has
// `overflow-hidden` on the row's own container (for its rounded corners /
// collapsible content), which silently clips any ordinary absolutely-
// positioned popup regardless of z-index. Escaping to <body> sidesteps that
// entirely.
export default function LogoAvatar({ logoUrl, name, initials, size = 'w-10 h-10 sm:w-11 sm:h-11', textSize = 'text-xs sm:text-sm' }) {
  const triggerRef = useRef(null);
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState(null);

  const handleEnter = () => {
    if (!logoUrl || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({ top: rect.top - 8, left: rect.left + rect.width / 2 });
    setHover(true);
  };
  const handleLeave = () => setHover(false);

  return (
    <div
      ref={triggerRef}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      className="relative flex-shrink-0"
    >
      <div className={`${size} rounded-xl bg-transparent font-bold flex items-center justify-center overflow-hidden transition-transform duration-200 ${hover && logoUrl ? 'scale-105' : ''}`}>
        {logoUrl
          ? <img src={logoUrl} alt={name} className="w-full h-full object-contain" />
          : <div className="w-full h-full bg-slate-100 text-slate-700 flex items-center justify-center rounded-xl"><span className={`font-bold ${textSize}`}>{initials}</span></div>}
      </div>

      {logoUrl && hover && pos && createPortal(
        <div
          className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-full animate-in fade-in zoom-in-95 duration-150"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-3 w-28 h-28 flex items-center justify-center">
            <img src={logoUrl} alt={name} className="w-full h-full object-contain" />
          </div>
          <div className="flex justify-center -mt-1.5">
            <div className="w-3 h-3 bg-white rotate-45 shadow-sm" />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
