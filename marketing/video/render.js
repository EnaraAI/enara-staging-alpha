// Renders the ENARA school film: frames from film.html (deterministic render(t)) piped into ffmpeg, plus SRT subtitles.
// usage: node render.js plan  <h|v>                -> prints the plan (timeline + subtitles) as JSON
//        node render.js still <h|v> <t> <out.png>   -> one frame
//        node render.js video <h|v> <out.mp4>       -> silent video at 30 fps
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const DIR = __dirname, FPS = 30, LEAD = 0.35, TAIL = 0.65;
const cfg = JSON.parse(fs.readFileSync(path.join(DIR, 'narration.json'), 'utf8'));
const durFile = path.join(DIR, 'audio', 'durations.json');
const dur = fs.existsSync(durFile) ? JSON.parse(fs.readFileSync(durFile, 'utf8')) : Object.fromEntries(cfg.scenes.map((s) => [s.id, s.text.split(' ').length / 2.5]));

function chunks(text) { // Arabic subtitle chunks: by sentence / clause, <= ~60 characters each
  const parts = text.split(/(?<=[.:؛!؟])\s+/).flatMap((p) => { if (p.length <= 70) return [p]; const w = p.split(' '); const out = []; let cur = ''; for (const x of w) { if ((cur + ' ' + x).trim().length > 62) { out.push(cur.trim()); cur = x; } else cur += ' ' + x; } if (cur.trim()) out.push(cur.trim()); return out; });
  return parts.filter(Boolean);
}
function plan(mode) {
  const ids = mode === 'v' ? cfg.vertical : cfg.scenes.map((s) => s.id);
  let t = 0; const timeline = [], subs = [], subsEn = [], audio = [];
  for (const id of ids) {
    const s = cfg.scenes.find((x) => x.id === id); const d = dur[id] + LEAD + TAIL;
    timeline.push({ id, start: t, dur: d }); audio.push({ id, at: t + LEAD });
    const a0 = t + LEAD, a1 = t + LEAD + dur[id];
    const place = (list, parts) => { const total = parts.reduce((n, p) => n + p.length, 0); let c = a0; for (const p of parts) { const e = c + (a1 - a0) * (p.length / total); list.push({ start: +c.toFixed(3), end: +Math.min(e + 0.25, a1 + 0.3).toFixed(3), text: p }); c = e; } };
    place(subs, chunks(s.ar)); place(subsEn, s.text.split(/(?<=[.:!?])\s+/));
    t += d;
  }
  const tidy = (l) => l.map((x, i) => ({ ...x, end: i + 1 < l.length ? Math.min(x.end, l[i + 1].start - 0.05) : x.end }));
  return { timeline, subs: tidy(subs), subsEn: tidy(subsEn), audio, total: +t.toFixed(3) };
}
const srtTime = (x) => { const ms = Math.round(x * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
const srt = (list0) => { const list = list0.map((x, i) => ({ ...x, end: i + 1 < list0.length ? Math.min(x.end, list0[i + 1].start - 0.05) : x.end })); return list.map((x, i) => `${i + 1}\n${srtTime(x.start)} --> ${srtTime(x.end)}\n${x.text}\n`).join('\n'); };

async function page(mode, p) {
  const b = await chromium.launch(); const [w, h] = mode === 'v' ? [1080, 1920] : [1920, 1080];
  const pg = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await pg.goto('file://' + path.join(DIR, 'film.html') + (mode === 'v' ? '#v' : ''));
  await pg.evaluate((pl) => window.setup(pl), p); await pg.evaluate(() => document.fonts.ready);
  return { b, pg };
}
(async () => {
  const [cmd, mode = 'h', a, b2] = process.argv.slice(2);
  const p = plan(mode);
  if (cmd === 'plan') { console.log(JSON.stringify(p, null, 1)); return; }
  if (cmd === 'srt') { fs.writeFileSync(a + '.ar.srt', srt(p.subs)); fs.writeFileSync(a + '.en.srt', srt(p.subsEn)); return; }
  const { b, pg } = await page(mode, p);
  if (cmd === 'still') { await pg.evaluate((t) => window.render(t), Number(a)); await pg.screenshot({ path: b2 }); await b.close(); return; }
  if (cmd === 'video') {
    const n = Math.ceil(p.total * FPS); const [w, h] = mode === 'v' ? [1080, 1920] : [1920, 1080];
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-s', `${w}x${h}`, a], { stdio: ['pipe', 'inherit', 'inherit'] });
    for (let i = 0; i < n; i++) { await pg.evaluate((t) => window.render(t), i / FPS); const buf = await pg.screenshot({ type: 'jpeg', quality: 92 }); if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r)); if (i % 300 === 0) console.log(`frame ${i}/${n}`); }
    ff.stdin.end(); await new Promise((r) => ff.on('close', r)); await b.close(); console.log('done', a, p.total, 's');
  }
})();
