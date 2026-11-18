// Parents P4: the HTML blocks the approved parent emails take as variables
// (CHILD_SECTIONS of parent-weekly-summary, CHILD_CODES of parent-invite).
// The markup is exactly the one the owner approved on 18 Nov 2026 (the
// previews in backend/src/email/parents/*.json samples). Every value is
// HTML-escaped here; Arabic keeps Latin tokens (CEFR level, codes) left-to-right.
export type Lang = 'en' | 'ar';

export function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const F = { en: 'Arial, Helvetica, sans-serif', ar: 'Tahoma, Arial, Helvetica, sans-serif' };
const al = (lang: Lang) => (lang === 'ar' ? 'text-align:right;' : '');
const ltr = (t: string) => `<span dir="ltr" style="unicode-bidi:embed;">${t}</span>`;

function row(lang: Lang, label: string, value: string) {
  return lang === 'ar'
    ? `<tr><td align="right" style="font-family:${F.ar};font-size:15px;line-height:24px;padding-top:8px;padding-bottom:8px;border-bottom:1px solid #eeeeee;color:#666666;text-align:right;">${label}</td><td align="left" style="font-family:${F.ar};font-size:15px;line-height:24px;padding-top:8px;padding-bottom:8px;border-bottom:1px solid #eeeeee;color:#111111;font-weight:bold;text-align:left;">${value}</td></tr>`
    : `<tr><td style="font-family:${F.en};font-size:15px;line-height:22px;padding-top:8px;padding-bottom:8px;border-bottom:1px solid #eeeeee;color:#666666;">${label}</td><td align="right" style="font-family:${F.en};font-size:15px;line-height:22px;padding-top:8px;padding-bottom:8px;border-bottom:1px solid #eeeeee;color:#111111;font-weight:bold;">${value}</td></tr>`;
}
const h2 = (lang: Lang, t: string) => `<h2 style="font-family:${F[lang]};font-size:19px;line-height:${lang === 'ar' ? 30 : 26}px;color:#111111;margin-top:24px;margin-bottom:4px;font-weight:bold;${al(lang)}">${t}</h2>`;
const sub = (lang: Lang, t: string) => `<p style="font-family:${F[lang]};font-size:14px;line-height:${lang === 'ar' ? 22 : 20}px;color:#666666;margin-top:0;margin-bottom:8px;${al(lang)}">${t}</p>`;
const p = (lang: Lang, t: string) => `<p style="font-family:${F[lang]};font-size:16px;line-height:${lang === 'ar' ? 26 : 24}px;color:#222222;margin-top:0;margin-bottom:16px;${al(lang)}">${t}</p>`;

export const STATUS_WORDS: Record<Lang, Record<'on_track' | 'needs_nudge' | 'check_this', string>> = {
  en: { on_track: 'on track', needs_nudge: 'needs a nudge', check_this: 'check this' },
  ar: { on_track: 'يسير على المسار الصحيح', needs_nudge: 'يحتاج إلى تشجيع', check_this: 'يحتاج إلى متابعة' },
};

export interface ChildWeek {
  firstName: string;
  school: string;
  status: 'on_track' | 'needs_nudge' | 'check_this';
  minutesDone: number;
  goalMinutes: number;
  lessonsDone: number;
  skillsMastered: number;
  level: string;
  tip: string;
}

/** One child's section of the weekly summary (approved markup). */
export function childSection(lang: Lang, c: ChildWeek): string {
  const L = lang === 'ar'
    ? { min: 'دقائق التدريب', of: 'من', lessons: 'دروس مكتملة', skills: 'مهارات جديدة متقنة', level: 'المستوى', tip: 'جرّبوا في البيت:' }
    : { min: 'Minutes practised', of: 'of', lessons: 'Lessons done', skills: 'New skills mastered', level: 'Level', tip: 'Try this at home:' };
  const e = escapeHtml;
  const level = lang === 'ar' ? ltr(e(c.level)) : e(c.level);
  const table = `<table${lang === 'ar' ? ' dir="rtl"' : ''} width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">${row(lang, L.min, `${c.minutesDone} ${L.of} ${c.goalMinutes}`)}${row(lang, L.lessons, String(c.lessonsDone))}${row(lang, L.skills, String(c.skillsMastered))}${row(lang, L.level, level)}</table>`;
  return `${h2(lang, e(c.firstName))}${sub(lang, `${e(c.school)} · <strong>${e(STATUS_WORDS[lang][c.status])}</strong>`)}${table}${p(lang, `<strong>${L.tip}</strong> ${e(c.tip)}`)}`;
}

/** One row per child of the invite email: first name, school, code (approved markup). Codes in the body only. */
export function codeTable(lang: Lang, kids: { firstName: string; school: string; code: string }[]): string {
  const e = escapeHtml;
  const rows = kids.map((c) => {
    const nameCell = `<td style="font-family:${F[lang]};font-size:16px;line-height:24px;padding-top:10px;padding-bottom:10px;border-bottom:1px solid #eeeeee;color:#222222;${lang === 'ar' ? 'text-align:right;' : ''}"${lang === 'ar' ? ' align="right"' : ''}>${e(c.firstName)}<br><span style="font-size:13px;color:#666666;">${e(c.school)}</span></td>`;
    const codeCell = `<td dir="ltr" style="font-family:'Courier New', Courier, monospace;font-size:20px;line-height:28px;padding-top:10px;padding-bottom:10px;border-bottom:1px solid #eeeeee;color:#111111;font-weight:bold;letter-spacing:2px;text-align:${lang === 'ar' ? 'left' : 'right'};" align="${lang === 'ar' ? 'left' : 'right'}">${e(c.code)}</td>`;
    return `<tr>${nameCell}${codeCell}</tr>`;
  });
  return `<table${lang === 'ar' ? ' dir="rtl"' : ''} width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">${rows.join('')}</table>`;
}

/** "Omar", "Omar and Laila", "Omar, Laila and Nour" / Arabic "عمر وليلى". */
export function namesList(lang: Lang, names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (lang === 'ar') return `${names.slice(0, -1).join('، ')} و${names[names.length - 1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "9–15 November 2026" (Western digits in both languages, D12). */
export function weekLabel(lang: Lang, startDay: string, endDay: string): string {
  const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-ca-gregory-nu-latn' : 'en-GB', { timeZone: 'UTC', ...o }).format(new Date(`${d}T12:00:00Z`));
  const sameMonth = startDay.slice(0, 7) === endDay.slice(0, 7);
  const start = sameMonth ? fmt(startDay, { day: 'numeric' }) : fmt(startDay, { day: 'numeric', month: 'long' });
  return `${start}–${fmt(endDay, { day: 'numeric', month: 'long', year: 'numeric' })}`;
}
