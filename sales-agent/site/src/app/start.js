// Load the state, draw every view, and keep it fresh.
function renderAll() { for (const r of renderers) r(); }
async function load() {
  try {
    const j = await api('/api/state');
    leads = Array.isArray(j.leads) ? j.leads : []; settings = j.settings || null; runs = Array.isArray(j.runs) ? j.runs : []; control = j.control || {};
    imports = Array.isArray(j.imports) ? j.imports : []; tasks = Array.isArray(j.tasks) ? j.tasks : []; dnc = Array.isArray(j.dnc) ? j.dnc : [];
    autonomy = j.autonomy || {}; targeting = j.targeting || null; inbox = j.inbox || null;
    loaded = true; renderAll();
  } catch (e) {
    if (e && e.code === 'signed_out') return;
    if (!loaded) list.innerHTML = '<div class="empty">The lead list can’t be reached right now. Check your connection and reload.</div>';
  }
}
showTab(location.hash.slice(1) || 'review');
renderAll(); load();
setInterval(() => { if (!document.hidden) load(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
