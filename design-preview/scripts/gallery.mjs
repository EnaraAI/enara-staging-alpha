// Builds GALLERY.md from shots/index.json and the screen registry titles (read from the built index page is not needed:
// titles come from the screen files' registrations via a light regex).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const idx = JSON.parse(readFileSync(new URL('../shots/index.json', import.meta.url)));
const reg = {};
for (const area of ['shared', 'student', 'kids', 'parent', 'teacher', 'school', 'platform']) {
  const dir = new URL(`../src/screens/${area}/`, import.meta.url);
  for (const f of readdirSync(dir).filter((x) => /\.tsx?$/.test(x))) {
    const s = readFileSync(new URL(f, dir), 'utf8');
    for (const m of s.matchAll(/id:\s*'([\w-]+)'[^\n]*?title:\s*\{\s*en:\s*'([^']+)'/g)) reg[m[1]] = { area, title: m[2] };
    for (const m of s.matchAll(/id:\s*'([\w-]+)',[\s\S]{0,200}?title:\s*\{\s*en:\s*'([^']+)'/g)) reg[m[1]] ??= { area, title: m[2] };
  }
}
const AREAS = [['shared', 'Shared'], ['student', 'Student (teens and adults) · Learners & Parents theme'], ['kids', 'Kids (under 9) · Kids theme'], ['parent', 'Parent · Learners & Parents theme'], ['teacher', 'Teacher · School admin theme'], ['school', 'School admin · School admin theme'], ['platform', 'Platform admin · School admin theme']];
const ids = [...new Set(idx.map((x) => x.id))];
let md = `# ENARA design preview: gallery\n\n_Static screens with sample data, built from branch \`claude/design-preview\` (folder \`design-preview/\`). Each screen: phone 390 px and desktop 1280 px, English and Arabic (right to left). Screenshots at 2×. See [NOTE.md](NOTE.md) for what changed, the tokens and the migration estimate._\n\n`;
md += `**Contents:** ${AREAS.map(([a, n]) => `[${n.split(' · ')[0]}](#${n.split(' · ')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')})`).join(' · ')} · [Dark mode](#dark-mode)\n\n`;
for (const [a, name] of AREAS) {
  const list = ids.filter((id) => (reg[id]?.area ?? '') === a);
  if (!list.length) continue;
  md += `## ${name.split(' · ')[0]}\n\n_${name.split(' · ')[1] ?? 'Learners & Parents theme'}_\n\n`;
  for (const id of list) {
    const f = (v, l) => `shots/${id}--${v}--${l}.jpg`;
    md += `### ${reg[id]?.title ?? id}\n\n| Phone · English | Phone · العربية |\n|---|---|\n| <img src="${f('phone', 'en')}" width="300"> | <img src="${f('phone', 'ar')}" width="300"> |\n\n`;
    md += `| Desktop · English | Desktop · العربية |\n|---|---|\n| <img src="${f('desktop', 'en')}" width="480"> | <img src="${f('desktop', 'ar')}" width="480"> |\n\n`;
  }
}
md += `## Dark mode\n\n_One screen per theme; every theme has a full dark token set._\n\n`;
for (const id of ['student-home', 'kids-home', 'school-dashboard']) {
  md += `### ${reg[id]?.title ?? id} (dark)\n\n| Phone · English | Phone · العربية | Desktop · English |\n|---|---|---|\n| <img src="shots/${id}--phone--en--dark.jpg" width="240"> | <img src="shots/${id}--phone--ar--dark.jpg" width="240"> | <img src="shots/${id}--desktop--en--dark.jpg" width="420"> |\n\n`;
}
writeFileSync(new URL('../GALLERY.md', import.meta.url), md);
console.log('screens', ids.length, 'missing titles', ids.filter((i) => !reg[i]));
