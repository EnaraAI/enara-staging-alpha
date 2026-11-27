
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastContainer } from './components/ToastContainer';
import { DemoBar } from './components/DemoBar';
// Last, so Tailwind comes after the other CSS (as the former in-browser compiler did).
import './tailwind.css';

// Pages load on demand (lms-speed-3). After a deploy, a tab opened earlier may ask for a page file that no
// longer exists: reload once to get the new version instead of showing an error.
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('enara_chunk_reload') || 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem('enara_chunk_reload', String(Date.now()));
  } catch { return; }
  event.preventDefault();
  window.location.reload();
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastContainer />
      <App />
      <DemoBar />
    </ErrorBoundary>
  </React.StrictMode>
);
