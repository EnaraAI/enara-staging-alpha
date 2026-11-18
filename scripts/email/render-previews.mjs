#!/usr/bin/env node
// Renders every code-sent email template (backend/src/email/lms/*, backend/src/email/parents/*:
// <alias>-<lang>.html + .json) to PNG previews, using the FAKE sample values in each <alias>-<lang>.json.
// Any not-yet-approved drafts in backend/src/email/drafts/<group>/ (bilingual <alias>.json format) are
// rendered too. It never sends email and never calls Resend or any network service: pages are loaded
// with setContent / file:// and the hosted logo URLs are swapped for inline data: URIs.
//
//   node scripts/email/render-previews.mjs --out /path/to/email_previews [--only <alias-substring>]
//
// Output: <out>/<group>/<alias>-<lang>.png (640 px wide, full page, deviceScaleFactor 2),
//         <out>/sheets/sheet-NN-<group>.png (contact sheets, 6 previews each), <out>/INDEX.md.
// Arabic: Tahoma is not installed in most Linux sandboxes; a private fontconfig maps Tahoma to an
// installed Arabic-capable family (default "DejaVu Sans", override with PREVIEW_ARABIC_FONT).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EMAIL = path.join(REPO, 'backend', 'src', 'email');
const DRAFTS = path.join(EMAIL, 'drafts');

const args = process.argv.slice(2);
const argVal = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const OUT = path.resolve(argVal('--out', path.join(os.tmpdir(), 'enara-email-previews')));
const ONLY = argVal('--only', null);
const ARABIC_FONT = process.env.PREVIEW_ARABIC_FONT || 'DejaVu Sans';

// Live templates: one <alias>-<lang>.json per language (subject, variables with fallback_value and
// sample, plus catalogue metadata). Grouped back into one entry per alias.
function loadLive() {
  const byAlias = new Map();
  for (const folder of ['lms', 'parents']) {
    const dir = path.join(EMAIL, folder);
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const lang = j.language;
      let t = byAlias.get(j.alias);
      if (!t) {
        t = { alias: j.alias, number: j.number, group: j.group, dir, status: j.status, recipient: j.recipient, trigger: j.trigger, delivery: j.delivery, frequency: j.frequency, languages: [], subject: {}, samples: {}, fallbacks: {}, variants: {} };
        byAlias.set(j.alias, t);
      }
      t.languages.push(lang);
      t.subject[lang] = j.subject;
      t.samples[lang] = Object.fromEntries(j.variables.map((v) => [v.key, v.sample ?? '']));
      t.fallbacks[lang] = Object.fromEntries(j.variables.filter((v) => v.fallback_value != null).map((v) => [v.key, String(v.fallback_value)]));
      for (const v of j.preview_variants || []) {
        (t.variants[v.id] ||= { id: v.id, label: v.label, samples: {} }).samples[lang] = v.samples;
      }
    }
  }
  return [...byAlias.values()].map((t) => {
    t.languages.sort((a, b) => (a === 'en' ? -1 : b === 'en' ? 1 : a.localeCompare(b)));
    t.preview_variants = Object.values(t.variants);
    return t;
  });
}

// Drafts awaiting approval (none at the moment): drafts/<group>/<alias>.json, bilingual format.
function loadDrafts() {
  const list = [];
  for (const group of ['lms', 'parents']) {
    const dir = path.join(DRAFTS, group);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const samples = {}; const fallbacks = {};
      for (const lang of j.languages) {
        samples[lang] = Object.fromEntries(j.variables.map((v) => [v.key, v.sample?.[lang] ?? '']));
        fallbacks[lang] = Object.fromEntries(j.variables.filter((v) => v.fallback_value).map((v) => [v.key, v.fallback_value[lang]]));
      }
      list.push({ ...j, status: 'draft', dir, samples, fallbacks });
    }
  }
  return list;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
function fill(text, vars, fallbacks) {
  const val = (k) => { const v = vars[k]; return v === undefined || v === null || v === '' ? fallbacks[k] : v; };
  let out = text.replace(/\{\{\{\s*([A-Z0-9_]+)\s*\}\}\}/g, (m, k) => (val(k) ?? m));
  out = out.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (m, k) => (val(k) == null ? m : esc(val(k))));
  return out;
}

const logo = (name) => `data:image/png;base64,${fs.readFileSync(path.join(EMAIL, 'assets', name)).toString('base64')}`;
const LOGO = { 'https://assets.enara.app/email/enara-logo.png': logo('enara-logo.png'), 'https://assets.enara.app/email/enara-logo-white.png': logo('enara-logo-white.png') };

function sortKey(n) {
  const s = String(n);
  if (s.startsWith('P')) return 3000 + Number(s.slice(1));
  if (s.startsWith('E')) return 2000 + Number(s.slice(1));
  const m = s.match(/^(\d+)([a-z]?)/);
  return Number(m[1]) * 10 + (m[2] ? m[2].charCodeAt(0) - 96 : 0);
}

function fontconfig() {
  const dir = path.join(OUT, '.fontconfig');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'fonts.conf');
  fs.writeFileSync(file, `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>\n  <alias binding="same"><family>Tahoma</family><prefer><family>${ARABIC_FONT}</family></prefer></alias>\n</fontconfig>\n`);
  return file;
}

async function main() {
  const templates = [...loadLive(), ...loadDrafts()].filter((t) => !ONLY || t.alias.includes(ONLY));
  templates.sort((a, b) => sortKey(a.number) - sortKey(b.number));
  const browser = await chromium.launch({ env: { ...process.env, FONTCONFIG_FILE: fontconfig() } });
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.route('**/*', (r) => (r.request().url().startsWith('data:') || r.request().url().startsWith('file:') ? r.continue() : r.abort()));
  const shots = []; const problems = [];
  for (const t of templates) {
    const runs = [{ suffix: '', label: '', samples: t.samples }];
    for (const v of t.preview_variants || []) {
      runs.push({ suffix: `--${v.id}`, label: v.label, samples: Object.fromEntries(t.languages.map((l) => [l, { ...t.samples[l], ...v.samples[l] }])) });
    }
    for (const run of runs) {
      for (const lang of t.languages) {
        const src = fs.readFileSync(path.join(t.dir, `${t.alias}-${lang}.html`), 'utf8');
        let html = fill(src, run.samples[lang], t.fallbacks[lang] || {});
        const subject = fill(t.subject[lang], run.samples[lang], t.fallbacks[lang] || {});
        const name = `${t.alias}${run.suffix}-${lang}`;
        if (/\{\{/.test(html) || /\{\{/.test(subject)) problems.push(`${name}: placeholder left`);
        if (lang === 'ar' && !/<html lang="ar" dir="rtl">/.test(src)) problems.push(`${name}: missing dir="rtl"`);
        for (const href of html.matchAll(/href="([^"]*)"/g)) {
          if (/ENR-[A-Z0-9]{4}-[A-Z0-9]{4}/i.test(href[1]) || /(token|secret|code|key)=/i.test(href[1])) problems.push(`${name}: suspicious link ${href[1]}`);
        }
        if (t.group === 'lms' && /CHILD_NAME|STUDENT_NAME|LEARNER/.test(src)) problems.push(`${name}: student-name variable in an LMS email`);
        for (const [url, data] of Object.entries(LOGO)) html = html.split(url).join(data);
        await page.setContent(html, { waitUntil: 'load' });
        if (lang === 'ar') {
          const bad = await page.evaluate(() => [...document.querySelectorAll('td[bgcolor="#ffffff"] p, td[bgcolor="#ffffff"] h1, td[bgcolor="#ffffff"] li')]
            .filter((el) => getComputedStyle(el).direction !== 'rtl' && !el.closest('[dir="ltr"]')).length);
          if (bad) problems.push(`${name}: ${bad} text blocks not right-to-left`);
        }
        const dir = path.join(OUT, t.group);
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `${name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        shots.push({ t, lang, file, name, label: `${t.alias}${run.label ? ` (${run.label})` : ''} · ${lang.toUpperCase()}`, subject });
      }
    }
  }

  // Contact sheets: 6 previews side by side, grouped (lms, then parents).
  const sheetsDir = path.join(OUT, 'sheets');
  fs.rmSync(sheetsDir, { recursive: true, force: true });
  fs.mkdirSync(sheetsDir, { recursive: true });
  const sheetPage = await browser.newPage({ viewport: { width: 6 * 420 + 40, height: 800 }, deviceScaleFactor: 1 });
  const sheets = [];
  const byGroup = {};
  for (const s of shots) {
    const g = s.t.group === 'lms' && s.t.languages.length === 1 ? 'ops' : s.t.group;
    (byGroup[g] ||= []).push(s);
  }
  let n = 0;
  for (const g of ['lms', 'ops', 'parents']) {
    const items = byGroup[g] || [];
    for (let i = 0; i < items.length; i += 6) {
      const chunk = items.slice(i, i + 6);
      n++;
      const cells = chunk.map((s) => `<div class="c"><div class="l">${esc(s.t.number)} · ${esc(s.label)}</div><img src="file://${s.file}"></div>`).join('');
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:20px;background:#d9d9d6;font-family:Arial,sans-serif}.g{display:flex;gap:20px;align-items:flex-start}.c{width:400px;background:#fff;padding:10px 0 0;border-radius:6px}.l{font-size:15px;font-weight:bold;color:#111;padding:0 10px 8px;word-break:break-all}img{width:400px;display:block}</style></head><body><div class="g">${cells}</div></body></html>`;
      const tmp = path.join(sheetsDir, `.sheet-${n}.html`);
      fs.writeFileSync(tmp, html);
      await sheetPage.goto(`file://${tmp}`, { waitUntil: 'load' });
      const file = path.join(sheetsDir, `sheet-${String(n).padStart(2, '0')}-${g}.png`);
      await sheetPage.screenshot({ path: file, fullPage: true });
      fs.rmSync(tmp);
      sheets.push({ file, labels: chunk.map((s) => s.label) });
    }
  }
  await browser.close();

  // INDEX.md
  const seen = new Map();
  for (const s of shots) { if (!seen.has(s.t)) seen.set(s.t, []); seen.get(s.t).push(s); }
  const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  let md = `# ENARA code-sent emails: previews\n\nRendered ${new Date().toISOString().slice(0, 10)} by \`scripts/email/render-previews.mjs\` with FAKE sample values (no email sent, no Resend call).\n` +
    `Templates: ${seen.size}. Images: ${shots.length}. Arabic font in previews: Tahoma mapped to "${ARABIC_FONT}" (Tahoma is not installed here).\n` +
    `Live: \`backend/src/email/lms\`, \`backend/src/email/parents\`; drafts (if any): \`backend/src/email/drafts/<group>\`.\n\n` +
    `| # | Template | Status | Recipient | Trigger | Delivery | Subject EN | Subject AR | Images |\n|---|---|---|---|---|---|---|---|---|\n`;
  for (const [t, ss] of seen) {
    md += `| ${cell(t.number)} | \`${t.alias}\`${t.languages.length === 1 ? ' (English only, D4)' : ''} | ${cell(t.status)} | ${cell(t.recipient)} | ${cell(t.trigger)} | ${cell(t.delivery)}: ${cell(t.frequency)} | ${cell(t.subject.en)} | ${cell(t.subject.ar || '(none: ops, English only)')} | ${ss.map((s) => `${s.name}: ${s.file}`).join('<br>')} |\n`;
  }
  md += `\n## Contact sheets\n\n${sheets.map((s) => `- ${s.file}: ${s.labels.join('; ')}`).join('\n')}\n`;
  md += `\n## Automatic checks\n\n${problems.length ? problems.map((p) => `- ${p}`).join('\n') : '- none failed (no leftover placeholders, every -ar has dir="rtl" and right-to-left text blocks, no codes/tokens in links, no student-name variables in LMS emails)'}\n`;
  fs.writeFileSync(path.join(OUT, 'INDEX.md'), md);
  console.log(`templates=${seen.size} images=${shots.length} sheets=${sheets.length} problems=${problems.length}`);
  for (const p of problems) console.log('PROBLEM', p);
  if (problems.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
