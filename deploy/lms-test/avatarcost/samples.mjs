// Owner (22 Nov 2026): "give me more drawings". 12 fake lesson moments, each drawn by the avatar's visual step the old way (check: false)
// and with the new drawing rules + check (check: true), rendered side by side. No Anam minutes (only the drawing step on lms-test).
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const H = { Authorization: `Bearer ${process.env.LMSTEST_MAINTENANCE_TOKEN}`, 'Content-Type': 'application/json' };
const M = [
  { id: 'en-prep', title: 'English (child): "The ball is on the box."', question: 'The ball is on the box.', answer: 'Yes! "on" means the ball is touching the top of the box. Now tell me: where is the cat? It is under the table.' },
  { id: 'en-past', title: 'English (teen): past tense', question: 'Yesterday I go to the park.', answer: 'Good try! For yesterday we use the past: go becomes went. Say it again: Yesterday I ___ to the park.' },
  { id: 'en-daily', title: 'English (adult): my daily routine', question: 'I get up at seven and I go to work at eight.', answer: 'Great sentence with two times. Now add what you do after work.' },
  { id: 'en-family', title: 'English (child): my family', question: 'I have a brother and a sister.', answer: 'Nice! Now say how old your brother is: My brother is ___ years old.' },
  { id: 'ma-frac', title: 'Maths (9-12): adding fractions', question: 'how do i add 2/8 and 3/8?', answer: 'The bottom numbers are the same, so keep 8 and add the tops: 2 + 3 = 5. So 2/8 + 3/8 = 5/8.' },
  { id: 'ma-nline', title: 'Maths (child): number line', question: 'what is 7 take away 3?', answer: 'Start at 7 on the number line and jump back 3: 6, 5, 4. So 7 - 3 = 4.' },
  { id: 'ma-tri', title: 'Maths (teen): area of a triangle', question: 'whats the area of a triangle with base 6 and height 4?', answer: 'Area = half of base times height: 1/2 x 6 x 4 = 12 square units.' },
  { id: 'sc-water', title: 'Science (9-12): the water cycle', question: 'how do clouds form?', answer: 'The Sun heats water, it evaporates into water vapour, the vapour rises and cools, and it condenses into tiny drops that make clouds. Then it rains.' },
  { id: 'sc-plant', title: 'Science (child): what plants need', question: 'what do plants need to grow?', answer: 'Plants need sunlight, water from the soil, and air (carbon dioxide). They make their own food in the leaves.' },
  { id: 'sc-circuit', title: 'Science (teen): a simple circuit', question: 'why wont my bulb light if theres a gap in the wires?', answer: 'A circuit must be a complete loop: battery, wire, bulb, wire, back to the battery. A gap breaks the loop, so no current flows.' },
  { id: 'ar-jumla', title: 'Arabic grammar (teen): nominal sentence', question: 'يعني إيه جملة اسمية؟', answer: 'الجملة الاسمية تبدأ باسم، ولها ركنان: المبتدأ والخبر. مثال: «الطالبُ مجتهدٌ»: الطالبُ مبتدأ، ومجتهدٌ خبر.' },
  { id: 'ar-math', title: 'Maths in Arabic (child): the perimeter', question: 'إزاي أحسب محيط المستطيل؟', answer: 'نجمع أطوال الأضلاع الأربعة. مستطيل طوله ٧ سم وعرضه ٣ سم: ٧ + ٣ + ٧ + ٣ = ٢٠ سم.' },
];
const AR = [
  { id: 'ar-fail', title: 'Arabic grammar (teen): الفاعل', question: 'مين الفاعل في جملة نجح الطالبُ؟', answer: 'الفاعل هو من قام بالفعل. في «نجحَ الطالبُ»: نجحَ فعل، والطالبُ فاعل مرفوع بالضمة.' },
  { id: 'ar-mafool', title: 'Arabic grammar (teen): المفعول به', question: 'إزاي أعرف المفعول به؟', answer: 'بعد الفعل والفاعل اسأل: ماذا؟ في «قرأ الولدُ القصةَ»: ماذا قرأ الولد؟ القصةَ، وهي مفعول به منصوب.' },
  { id: 'ar-kana', title: 'Arabic grammar (adult): كان وأخواتها', question: 'كان بتعمل إيه في الجملة؟', answer: 'كان تدخل على الجملة الاسمية: ترفع المبتدأ ويسمى اسمها، وتنصب الخبر ويسمى خبرها. «الجوُّ جميلٌ» ← «كانَ الجوُّ جميلًا».' },
  { id: 'ar-jar', title: 'Arabic grammar (child): حروف الجر', question: 'ما هي حروف الجر؟', answer: 'من حروف الجر: من، إلى، عن، على، في. الاسم بعدها يكون مجرورًا بالكسرة: ذهبتُ إلى المدرسةِ.' },
  { id: 'ar-taa', title: 'Arabic spelling (child): التاء المربوطة', question: 'أكتب مدرسة ولا مدرسه؟', answer: 'نكتبها «مدرسة» بالتاء المربوطة (ة) لأنها اسم مؤنث، وننطقها هاءً عند الوقف. ومثلها: شجرة، سيارة.' },
  { id: 'ar-frac', title: 'Maths in Arabic (child): الكسور', question: 'يعني إيه نص وربع؟', answer: 'النصف: نقسم الشيء جزأين متساويين ونأخذ جزءًا: ١/٢. الربع: نقسمه أربعة أجزاء متساوية ونأخذ جزءًا: ١/٤.' },
  { id: 'ar-area', title: 'Maths in Arabic (teen): مساحة المستطيل', question: 'ما هو قانون مساحة المستطيل؟', answer: 'مساحة المستطيل = الطول × العرض. مستطيل طوله ٦ سم وعرضه ٤ سم: المساحة = ٦ × ٤ = ٢٤ سم².' },
  { id: 'ar-photo', title: 'Science in Arabic (9-12): البناء الضوئي', question: 'إيه هي عملية البناء الضوئي؟', answer: 'النبات يصنع غذاءه في الأوراق: يأخذ ثاني أكسيد الكربون من الهواء والماء من التربة، وبضوء الشمس يصنع السكر ويطلق الأكسجين.' },
  { id: 'ar-states', title: 'Science in Arabic (child): حالات المادة', question: 'ما حالات المادة الثلاث؟', answer: 'للمادة ثلاث حالات: صلبة مثل الثلج، وسائلة مثل الماء، وغازية مثل بخار الماء.' },
  { id: 'ar-magnet', title: 'Science in Arabic (teen): المغناطيس', question: 'إزاي المغناطيس بيشد الحديد؟ وإيه هما قطبينه؟', answer: 'للمغناطيس قطبان: شمالي وجنوبي. الأقطاب المختلفة تتجاذب، والأقطاب المتشابهة تتنافر. ويجذب المغناطيس الحديد والنيكل.' },
];
const ask = (m, check) => fetch('https://lms-test.enara.app/api/maintenance/visual-sample', { method: 'POST', headers: H, body: JSON.stringify({ question: m.question, answer: m.answer, check }), signal: AbortSignal.timeout(170_000) }).then((r) => r.json()).catch((e) => ({ error: String(e) }));
mkdirSync('samples', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1320, height: 800 }, deviceScaleFactor: 2 });
// Each drawing is rendered on its own page (as the screen panel shows it), then the two pictures are put side by side.
const shot = async (html) => { const q = await browser.newPage({ viewport: { width: 620, height: 560 }, deviceScaleFactor: 2 }); await q.setContent(html || '<p style="font-family:system-ui;color:#888;padding:20px">(no visual)</p>', { waitUntil: 'load' }); await q.waitForTimeout(400); const b = await q.screenshot({ fullPage: true }); await q.close(); return `data:image/png;base64,${b.toString('base64')}`; };
const cell = (label, color, img, ms) => `<div class="c"><div class="h" style="color:${color}">${label} <span style="color:#667;font-weight:400;font-size:15px">· drawn in ${(ms / 1000).toFixed(1)} s</span></div><img src="${img}" style="width:600px"></div>`;
const index = [];
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
for (const m of (process.env.SET === 'arabic' ? AR : M).filter((x) => !ONLY.length || ONLY.includes(x.id))) {
  const [oldV, newV] = [await ask(m, false), await ask(m, true)];
  writeFileSync(`samples/${m.id}-old.html`, oldV.html || ''); writeFileSync(`samples/${m.id}-new.html`, newV.html || '');
  index.push({ id: m.id, oldMs: oldV.ms, newMs: newV.ms, old: Boolean(oldV.html), new: Boolean(newV.html), err: oldV.error || newV.error || null });
  console.log(m.id, oldV.ms, newV.ms, oldV.error || '', newV.error || '');
  await page.setContent(`<html><body style="font-family:system-ui;margin:20px;background:#f6f7fa"><style>.c{display:inline-block;vertical-align:top;width:620px;margin-right:16px;background:#fff;border:1px solid #cfd6e4;border-radius:10px;padding:10px}.h{font-weight:700;font-size:18px;margin:2px 4px 8px}</style><h2 style="margin:0 0 4px;color:#08172b">${m.title}</h2><div style="color:#445;margin-bottom:12px" dir="auto">Learner: ${m.question}</div>${cell('Before (old drawing)', '#b42318', await shot(oldV.html), oldV.ms ?? 0)}${cell('After (new rules + check)', '#067647', await shot(newV.html), newV.ms ?? 0)}</body></html>`);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `samples/${m.id}.png`, fullPage: true });
}
await browser.close();
writeFileSync('samples/index.json', JSON.stringify(index, null, 1));
