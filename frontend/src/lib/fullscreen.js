// Cross-browser Fullscreen API helpers for the exam lockdown.
//
// Safari before 16.4 only has the prefixed webkitRequestFullscreen(), which
// returns undefined instead of a promise, so callers chaining .catch() on it
// crashed. requestFullscreen() here always returns a promise; for the legacy
// API it settles on the next (webkit)fullscreenchange / fullscreenerror.
// iPhone Safari has no element fullscreen at all → fullscreenSupported() is false.

export function fullscreenSupported() {
  const el = document.documentElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen);
}

export function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
}

export function requestFullscreen(el = document.documentElement) {
  const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  if (!fn) return Promise.reject(new Error('Fullscreen not supported'));
  let result;
  try {
    result = fn.call(el);
  } catch (err) {
    return Promise.reject(err);
  }
  if (result && typeof result.then === 'function') return result;
  return new Promise((resolve, reject) => {
    const done = (ok) => () => {
      clearTimeout(timer);
      document.removeEventListener('webkitfullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenerror', onError);
      if (ok && isFullscreen()) resolve(); else reject(new Error('Fullscreen request denied'));
    };
    const onChange = done(true);
    const onError = done(false);
    const timer = setTimeout(done(true), 1500);
    document.addEventListener('webkitfullscreenchange', onChange);
    document.addEventListener('webkitfullscreenerror', onError);
  });
}

export function exitFullscreen() {
  const fn = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
  if (!fn) return Promise.resolve();
  try {
    return Promise.resolve(fn.call(document));
  } catch (err) {
    return Promise.reject(err);
  }
}
