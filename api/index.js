// Vercel function entry for ENARA staging: the backend Express app (compiled
// by `npm run build` in backend/) answers /api, /uploads, /ready and /health.
// The staging guard runs on the first request; uploads are stored only in R2.
module.exports = require('../backend/dist/vercel.js');
