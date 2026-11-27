// INDEX.md for the expressive-avatar screenshots: which file is which moment, what the learner said, which cue ENARA sent,
// whether the video tutor confirmed it, and what the tutor said (from its own audio, so a spoken cue word would show).
// Usage: node index.mjs <out_dir>   (reads results.json, spoken.json; writes shots/INDEX.md and shots/results-<run>.json)
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2];
const results = JSON.parse(readFileSync(join(out, 'results.json'), 'utf8'));
const spoken = existsSync(join(out, 'spoken.json')) ? JSON.parse(readFileSync(join(out, 'spoken.json'), 'utf8')) : {};
const CUE_WORDS = /^\W*(happy|warm|supportive|curious|concerned|angry|sad|distressed|laughter)\b/i;
const run = process.env.GITHUB_RUN_ID || 'local';
writeFileSync(join(out, 'shots', `results-${run}.json`), JSON.stringify({ results, spoken }, null, 1));
const prev = existsSync(join(out, 'shots', 'INDEX.md')) ? readFileSync(join(out, 'shots', 'INDEX.md'), 'utf8') : '';
const lines = [];
for (const r of results) {
  if (!r.turns?.length && !r.errors?.length) continue;
  const st = r.start?.expressive_test;
  lines.push(`### ${r.who} (${r.email?.split('@')[0] ?? '?'}), switch ${r.expressive}`);
  lines.push(`Call: speech=${r.start?.speech ?? '?'}${st ? `, style band=${st.band ?? '-'}, Cara 4.1 Express=${st.cara4}, slower voice=${st.speed}, voice=${st.voice ? `${st.voice.provider} ${st.voice.model}` : '-'}` : ''}.${r.errors?.length ? ` Problems: ${r.errors.join('; ')}` : ''}`);
  lines.push('');
  lines.push('| Moment | File | Learner said | Cue sent | Anam applied | Tutor said (heard from its audio) |');
  lines.push('|---|---|---|---|---|---|');
  lines.push(`| idle | \`${r.who}--idle--${r.expressive}.png\` | | | | |`);
  for (const t of r.turns ?? []) {
    const heard = spoken[`${r.who}--${t.moment}--${r.expressive}`] ?? '';
    const flag = CUE_WORDS.test(heard) ? ' **(starts with a cue word)**' : '';
    const files = [`${r.who}--${t.moment}--${r.expressive}.png`, ...(/stuck/.test(t.moment) ? [`${r.who}--${t.moment}-then--${r.expressive}.png`] : []), ...(/drawing$/.test(t.moment) ? [`${r.who}--${t.moment}-panel--${r.expressive}.png`] : [])];
    const applied = [t.cueApplied?.split('@')[0], t.secondCueApplied ? 'supportive' : null].filter(Boolean).join(', ');
    lines.push(`| ${t.moment} | ${files.map((f) => `\`${f}\``).join('<br>')} | ${t.said} | ${t.cues?.join(', ') || '-'} | ${applied || '-'} | ${(heard || (t.reply ?? '')).replace(/\|/g, '/').slice(0, 160)}${flag} |`);
  }
  lines.push('');
}
const head = '# Expressive avatar: screenshots (lms-test)\n\nEach PNG is the avatar\'s own video frame about 1 s after the cue (switch off: the same moment of the reply). Names: `<who>--<moment>--<on|off>.png`. "on"/"off" is liveExpressive for that call (a CI-only per-call test override). Learners speak with synthetic voices (Piper). Newest run first.\n';
const body = prev.startsWith('# Expressive avatar') ? prev.slice(prev.indexOf('\n## ') >= 0 ? prev.indexOf('\n## ') : prev.length) : '';
const files = readdirSync(join(out, 'shots')).filter((f) => f.endsWith('.png')).sort();
writeFileSync(join(out, 'shots', 'INDEX.md'), `${head}\n## Run ${run} (${new Date().toISOString().slice(0, 16)} UTC)\n\n${lines.join('\n')}\nFiles in this run: ${files.length}\n${body}`);
console.log(`INDEX.md: ${results.length} calls, ${files.length} PNGs`);
