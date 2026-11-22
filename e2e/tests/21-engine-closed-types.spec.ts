import { test, expect, type Frame, type Page } from '@playwright/test';
import { enaraApi, enaraFrame, frameSession, login } from '../lib/enara';
import { moodleCli, moodleProvision, moodleSession } from '../lib/moodle';
import { activityByName, activityUrl, addThroughPicker } from '../lib/picker';
import { readState, saveState, shot } from '../lib/state';

// Scenario 21 (assessment engine P1b, docs/tutor/ASSESSMENT_ENGINE_PLAN.md §10; ENARA_ENGINE_V2 assessTypesV1 on, as on lms-test):
//   1. School A's admin writes two quizzes with every closed type (choice incl. multi-answer, true/false, fill in the blanks, matching,
//      number with unit, ordering, drop-down): one in English, one in Arabic. 10 points each.
//   2. The Moodle teacher adds both through the ENARA picker.
//   3. The Moodle student answers each inside Moodle: English all right (a number given in metres for a key in centimetres still
//      counts) → 100; Arabic in the Arabic screen language, with true/false wrong and the number without its unit (half) and the
//      blank typed with tashkeel (still right) → 80.
//   4. The Moodle gradebook shows 100 and 80.
const RUN = Date.now();
const TITLE_EN = `E2E closed types (en) ${RUN}`;
const TITLE_AR = `E2E closed types (ar) ${RUN}`;
const E = (id: string, text: string, points: number, engine: Record<string, unknown>) => ({ id, type: 'engine', text, points, engine });

const EN = [
  E('q1', 'Which numbers are even?', 1, { type: 'mcq', language: 'en', options: [{ id: 'a', text: 'two' }, { id: 'b', text: 'three' }, { id: 'c', text: 'four' }, { id: 'd', text: 'nine' }], answer_key: { correct: ['a', 'c'], multi: true } }),
  E('q2', 'The Sun is a star.', 1, { type: 'true_false', language: 'en', answer_key: { value: true } }),
  E('q3', 'She {{blank_1}} to school and {{blank_2}} lunch at noon.', 2, { type: 'fill_blank', language: 'en', answer_key: { blanks: { blank_1: ['goes'], blank_2: ['has', 'eats'] } } }),
  E('q4', 'Match each country with its capital.', 2, { type: 'matching', language: 'en', options: { left: [{ id: 'l1', text: 'Egypt' }, { id: 'l2', text: 'France' }, { id: 'l3', text: 'Japan' }], right: [{ id: 'r1', text: 'Cairo' }, { id: 'r2', text: 'Paris' }, { id: 'r3', text: 'Tokyo' }] }, answer_key: { pairs: [['l1', 'r1'], ['l2', 'r2'], ['l3', 'r3']] } }),
  E('q5', 'A ribbon is 120 cm long. How long is it?', 2, { type: 'numeric', language: 'en', answer_key: { value: 120, unit: 'cm' } }),
  E('q6', 'Put the numbers from smallest to largest.', 1, { type: 'ordering', language: 'en', options: [{ id: 'a', text: '3' }, { id: 'b', text: '7' }, { id: 'c', text: '12' }, { id: 'd', text: '20' }], answer_key: { order: ['a', 'b', 'c', 'd'] } }),
  E('q7', 'Ahmed {{drop_1}} a student.', 1, { type: 'dropdown', language: 'en', options: { drop_1: ['is', 'are'] }, answer_key: { choices: { drop_1: 'is' } } }),
];
const AR = [
  E('q1', 'ما عاصمة مصر؟', 1, { type: 'mcq', language: 'ar', options: [{ id: 'a', text: 'القاهرة' }, { id: 'b', text: 'الإسكندرية' }, { id: 'c', text: 'أسوان' }], answer_key: { correct: ['a'], multi: false } }),
  E('q2', 'الشمس نجم.', 1, { type: 'true_false', language: 'ar', answer_key: { value: true } }),
  E('q3', 'ذهب الطالب إلى {{blank_1}} ثم عاد إلى {{blank_2}}.', 2, { type: 'fill_blank', language: 'ar', answer_key: { blanks: { blank_1: ['المدرسة'], blank_2: ['البيت'] } } }),
  E('q4', 'صِل كل دولة بعاصمتها.', 2, { type: 'matching', language: 'ar', options: { left: [{ id: 'l1', text: 'مصر' }, { id: 'l2', text: 'فرنسا' }, { id: 'l3', text: 'اليابان' }], right: [{ id: 'r1', text: 'القاهرة' }, { id: 'r2', text: 'باريس' }, { id: 'r3', text: 'طوكيو' }] }, answer_key: { pairs: [['l1', 'r1'], ['l2', 'r2'], ['l3', 'r3']] } }),
  E('q5', 'طول الشريط ١٫٢ م. كم طوله بالسنتيمتر؟', 2, { type: 'numeric', language: 'ar', answer_key: { value: 120, unit: 'سم' } }),
  E('q6', 'رتّب الأعداد من الأصغر إلى الأكبر.', 1, { type: 'ordering', language: 'ar', options: [{ id: 'a', text: '٣' }, { id: 'b', text: '٧' }, { id: 'c', text: '١٢' }, { id: 'd', text: '٢٠' }], answer_key: { order: ['a', 'b', 'c', 'd'] } }),
  E('q7', 'الطالبة {{drop_1}} الدرس.', 1, { type: 'dropdown', language: 'ar', options: { drop_1: ['كتب', 'كتبت'] }, answer_key: { choices: { drop_1: 'كتبت' } } }),
];

async function createQuiz(title: string, subject: string, questions: unknown[]) {
  const r = await enaraApi.post('/api/assessments', await login('admin.a'), {
    title, subject, assessmentKind: 'quiz', difficulty: 'Easy', duration: 15, status: 'active', lifecycle: 'published', maxAttempts: 2, answerReveal: 'after-submit', instructions: 'E2E closed types.', questions,
  });
  return (r.assessment ?? r).id as string;
}

const q = (f: Frame, id: string) => f.getByTestId(`eq-${id}`);

/** Puts an ordering item in the key order with the up/down buttons (the server sends it shuffled). */
async function orderItems(f: Frame, id: string, want: string[]) {
  for (let target = 0; target < want.length; target++) {
    for (let guard = 0; guard < 10; guard++) {
      const now = await q(f, id).locator('[data-order-item]').evaluateAll((els) => els.map((e) => e.getAttribute('data-order-item')));
      const at = now.indexOf(want[target]);
      if (at === target) break;
      await q(f, id).locator(`[data-order-item="${want[target]}"]`).getByRole('button').first().click(); // move up
    }
  }
}

async function start(page: Page, cmid: number, title: string): Promise<Frame> {
  await page.goto(activityUrl(cmid));
  const f = await enaraFrame(page);
  expect((await frameSession(f)).role).toBe('student');
  await expect(f.getByRole('heading', { name: title })).toBeVisible();
  await f.getByRole('button', { name: /^(Start|Start another attempt|Continue)$/ }).click();
  await expect(q(f, 'q1')).toBeVisible({ timeout: 30_000 });
  return f;
}

async function submit(f: Frame) {
  await expect(f.getByText('7 of 7 answered')).toBeVisible();
  await f.getByRole('button', { name: 'Submit', exact: true }).first().click();
  const dialog = f.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(f.getByRole('button', { name: /Start another attempt/ })).toBeVisible({ timeout: 60_000 });
}

const grade = (cmid: number) => moodleCli('grade', { course: 'ENARATEST', cmid, user: 'student.test' });

test.describe.serial('21 · assessment engine: every closed type, English and Arabic, graded by code, to the Moodle gradebook', () => {
  test('the admin writes both quizzes; a broken item is refused in plain words', async () => {
    const admin = await login('admin.a');
    const bad = await enaraApi.post('/api/assessments', admin, { title: `E2E bad ${RUN}`, subject: 'Maths', status: 'active', lifecycle: 'published', questions: [E('q1', 'No blank here', 1, { type: 'fill_blank', language: 'en', answer_key: { blanks: { blank_1: ['x'] } } })] }, [400]);
    expect(JSON.stringify(bad)).toMatch(/blank/);
    saveState({ engine: { en: await createQuiz(TITLE_EN, 'English', EN), ar: await createQuiz(TITLE_AR, 'اللغة العربية', AR) } });
  });

  test('the Moodle teacher adds both through the picker', async ({ browser }) => {
    const s = readState();
    const { page, context } = await moodleSession(browser, 'teacher.test');
    await addThroughPicker(page, { course: moodleProvision().courses.ENARATEST, courseShort: 'ENARATEST', typeid: s.schoolA.typeid, picks: [{ title: TITLE_EN }, { title: TITLE_AR }] });
    saveState({ engine: { ...s.engine, cmidEn: activityByName('ENARATEST', TITLE_EN).cmid, cmidAr: activityByName('ENARATEST', TITLE_AR).cmid } });
    await context.close();
  });

  test('English: every type answered right (metres for a centimetres key still counts) → Moodle shows 100', async ({ browser }) => {
    const s = readState();
    const { page, context } = await moodleSession(browser, 'student.test');
    const f = await start(page, s.engine.cmidEn, TITLE_EN);
    await q(f, 'q1').getByLabel('two', { exact: true }).check();
    await q(f, 'q1').getByLabel('four', { exact: true }).check();
    await q(f, 'q2').getByRole('radio', { name: 'True' }).click();
    await q(f, 'q3').locator('[data-blank="blank_1"]').fill('Goes');
    await q(f, 'q3').locator('[data-blank="blank_2"]').fill('has');
    await q(f, 'q4').locator('[data-left="l1"]').selectOption({ label: 'Cairo' });
    await q(f, 'q4').locator('[data-left="l2"]').selectOption({ label: 'Paris' });
    await q(f, 'q4').locator('[data-left="l3"]').selectOption({ label: 'Tokyo' });
    await q(f, 'q5').getByRole('textbox').first().fill('1.2');
    await q(f, 'q5').getByRole('textbox').nth(1).fill('m');
    await orderItems(f, 'q6', ['a', 'b', 'c', 'd']);
    await q(f, 'q7').locator('[data-drop="drop_1"]').selectOption('is');
    await shot(page, '21-engine-english');
    await submit(f);
    await expect.poll(() => grade(s.engine.cmidEn).finalgrade, { timeout: 120_000, intervals: [1000, 2000, 3000] }).toBe(100);
    await context.close();
  });

  test('Arabic, in the Arabic screen language, right to left: true/false wrong, number without unit (half) → Moodle shows 80', async ({ browser }) => {
    const s = readState();
    const { page, context } = await moodleSession(browser, 'student.test');
    await page.setViewportSize({ width: 390, height: 844 });
    const f = await start(page, s.engine.cmidAr, TITLE_AR);
    const lang = f.getByTestId('ui-lang');
    if ((await lang.innerText()).trim() === 'ع') await lang.click();
    await expect(q(f, 'q2').getByRole('radio', { name: 'صح' })).toBeVisible();
    await expect(q(f, 'q4')).toHaveAttribute('dir', 'rtl');
    await q(f, 'q1').getByLabel('القاهرة', { exact: true }).check();
    await q(f, 'q2').getByRole('radio', { name: 'خطأ' }).click(); // wrong on purpose
    await q(f, 'q3').locator('[data-blank="blank_1"]').fill('المَدْرَسَة'); // tashkeel: still right
    await q(f, 'q3').locator('[data-blank="blank_2"]').fill('البيت');
    await q(f, 'q4').locator('[data-left="l1"]').selectOption({ label: 'القاهرة' });
    await q(f, 'q4').locator('[data-left="l2"]').selectOption({ label: 'باريس' });
    await q(f, 'q4').locator('[data-left="l3"]').selectOption({ label: 'طوكيو' });
    await q(f, 'q5').getByRole('textbox').first().fill('١٢٠'); // no unit: half
    await orderItems(f, 'q6', ['a', 'b', 'c', 'd']);
    await q(f, 'q7').locator('[data-drop="drop_1"]').selectOption('كتبت');
    const sideways = await f.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sideways).toBeLessThanOrEqual(1);
    await shot(page, '21-engine-arabic-phone');
    await submit(f);
    await expect.poll(() => grade(s.engine.cmidAr).finalgrade, { timeout: 120_000, intervals: [1000, 2000, 3000] }).toBe(80);
    await context.close();
  });
});
