// Spinner shown while a lazily loaded page chunk downloads (and while auth loads).
export default function PageLoader({ fullScreen = false }) {
  return (
    <div className={`${fullScreen ? 'min-h-screen bg-slate-50' : 'min-h-[60vh]'} flex items-center justify-center`}>
      <div className="w-8 h-8 border-3 border-primary-300 border-t-primary-800 rounded-full animate-spin" />
    </div>
  );
}
