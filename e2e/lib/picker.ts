import { expect, type Page } from '@playwright/test';
import { enaraFrameAt } from './enara';
import { MOODLE } from './env';
import { moodleCli } from './moodle';

export interface Pick { title: string; due?: string; /** e.g. 'Assignments' when an assessment has the same title */ type?: string }

/**
 * Teacher: Add an ENARA activity › Select content › pick items in the ENARA
 * picker (inside Moodle's dialog) › Add › Save and return to course.
 * Returns the picker frame's view of each item (badges) before adding.
 */
export async function addThroughPicker(page: Page, opts: { course: number; courseShort: string; typeid: number; picks: Pick[]; shot?: string }): Promise<{ badges: Record<string, string> }> {
  const before = new Set(moodleCli('activities', { course: opts.courseShort }).activities.map((a: any) => a.id));
  await page.goto(`${MOODLE}/course/modedit.php?add=lti&typeid=${opts.typeid}&course=${opts.course}&section=0&return=0`);
  await page.locator('#id_selectcontent').click();
  const picker = await enaraFrameAt(page, /^\/lms\/picker/);
  await expect(picker.getByRole('heading', { name: 'Add ENARA activities' })).toBeVisible({ timeout: 60_000 });
  const badges: Record<string, string> = {};
  for (const p of opts.picks) {
    let row = picker.locator('li').filter({ has: picker.getByText(p.title, { exact: true }) });
    if (p.type) row = row.filter({ hasText: `${p.type} ·` });
    row = row.first();
    await expect(row).toBeVisible();
    badges[p.title] = (await row.innerText()).replace(/\s+/g, ' ');
    await row.locator('input[name="enara-pick"]').check();
    if (p.due) await row.locator('input[type="datetime-local"]').fill(p.due);
  }
  if (opts.shot) await page.screenshot({ path: opts.shot, fullPage: true });
  const n = opts.picks.length;
  await picker.getByRole('button', { name: n === 1 ? 'Add 1 activity' : `Add ${n} activities` }).click();
  if (n > 1) {
    // Moodle lists the items and offers only "Save and return to course".
    await expect(page.locator('#id_submitbutton2')).toBeVisible({ timeout: 60_000 });
    await page.locator('#id_submitbutton2').click();
  } else {
    // One item: Moodle fills the form from it (name, custom parameters) and closes its dialog.
    await expect(page.locator('#id_name')).toHaveValue(opts.picks[0].title, { timeout: 60_000 });
    await page.locator('#id_submitbutton2').click();
  }
  await page.waitForURL(/course\/view\.php/, { timeout: 60_000 });
  await expect.poll(() => moodleCli('activities', { course: opts.courseShort }).activities.filter((a: any) => !before.has(a.id)).length, { timeout: 30_000 }).toBe(n);
  return { badges };
}

/** The Moodle activity (course module) made for a picked item, by its title. */
export function activityByName(courseShort: string, name: string): { id: number; cmid: number; name: string; intro: string; instructorcustomparameters: string; grademax: number | null; gradetype: number | null } {
  const list = moodleCli('activities', { course: courseShort }).activities as any[];
  const a = [...list].reverse().find((x) => x.name === name);
  if (!a) throw new Error(`no activity "${name}" in ${courseShort}: ${list.map((x) => x.name).join(', ')}`);
  return a;
}
export const activityUrl = (cmid: number) => `${MOODLE}/mod/lti/view.php?id=${cmid}`;
