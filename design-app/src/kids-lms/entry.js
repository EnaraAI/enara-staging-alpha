// The copied lms-test kids app (src/lms, kept identical by scripts/sync-lms-kids.mjs), as the design app uses it.
// Plain JS with entry.d.ts beside it: the design app's strict type check stops here. The copied files are type
// checked with lms-test's own compiler options instead (tsconfig.lms.json).
export { default as KidsApp } from '../lms/kids/KidsApp';
export { ToastContainer } from '../lms/components/ToastContainer';
export { ErrorBoundary } from '../lms/components/ErrorBoundary';
export { getSessionUser, isLmsSession, SESSION_EXPIRED_EVENT } from '../lms/services/apiService';
