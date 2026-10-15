import { Component } from 'react';
import { HiOutlineExclamationCircle } from 'react-icons/hi';

// Catches render errors below it so one broken page shows a message instead of
// blanking the whole app. Layout keys it on the path, so navigating away resets it.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // console.error is forwarded to the backend by the client logger.
    console.error('[ErrorBoundary]', error?.message || error, info?.componentStack || '');
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={`${this.props.fullScreen ? 'min-h-screen bg-slate-50' : 'min-h-[60vh]'} flex items-center justify-center px-4`}>
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-6 text-center">
          <HiOutlineExclamationCircle className="w-10 h-10 mx-auto text-red-500" />
          <h2 className="mt-3 text-lg font-semibold text-slate-800">Something went wrong</h2>
          <p className="mt-1 text-sm text-slate-500">This page hit an unexpected error. Reloading usually fixes it.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary-800 text-white text-sm font-medium hover:bg-primary-900"
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
