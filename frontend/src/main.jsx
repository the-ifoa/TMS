import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { initClientLogger } from './lib/clientLogger';
import './index.css';

initClientLogger();

// Pages load as separate chunks. After a deploy the old chunk files are gone, so a
// tab opened before the deploy fails to load the next page — reload once to pick
// up the new build (the session flag stops a reload loop if the server is down).
window.addEventListener('vite:preloadError', (event) => {
  if (sessionStorage.getItem('chunk-reload')) return;
  sessionStorage.setItem('chunk-reload', '1');
  event.preventDefault();
  window.location.reload();
});
window.addEventListener('load', () => setTimeout(() => sessionStorage.removeItem('chunk-reload'), 10000));

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary fullScreen>
          <App />
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
