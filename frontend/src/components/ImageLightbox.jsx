import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineX, HiOutlineZoomIn, HiOutlineZoomOut } from 'react-icons/hi';

// Fullscreen click-to-zoom image viewer. Render conditionally from the parent
// (`{lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={...} />}`).
export default function ImageLightbox({ src, alt = '', onClose }) {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!src) return null;

  const zoomIn = () => setZoom((z) => Math.min(4, +(z + 0.5).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(2)));
  const onWheel = (e) => {
    e.preventDefault();
    const step = e.deltaY < 0 ? 0.1 : -0.1;
    setZoom((z) => Math.min(4, Math.max(1, +(z + step).toFixed(2))));
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[999999] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-8"
      onClick={onClose}
      onWheel={onWheel}
    >
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={zoomOut}
          disabled={zoom <= 1}
          className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Zoom out"
        >
          <HiOutlineZoomOut className="w-5 h-5" />
        </button>
        <span className="px-2.5 py-1 rounded-lg bg-white/10 text-white text-xs font-bold min-w-[3.5rem] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={zoomIn}
          disabled={zoom >= 4}
          className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Zoom in"
        >
          <HiOutlineZoomIn className="w-5 h-5" />
        </button>
        <button
          onClick={onClose}
          className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors ml-1"
          title="Close"
        >
          <HiOutlineX className="w-5 h-5" />
        </button>
      </div>

      <div className="w-full h-full overflow-auto flex items-center justify-center">
        <img
          src={src}
          alt={alt}
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          className="select-none rounded-lg transition-transform duration-150 ease-out cursor-zoom-in"
          style={
            zoom === 1
              ? { maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' }
              : { transform: `scale(${zoom})`, maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' }
          }
        />
      </div>
    </div>,
    document.body
  );
}
