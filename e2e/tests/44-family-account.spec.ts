import { test, expect } from '@playwright/test';
import { maintenance } from '../lib/enara';
import { ENARA, secrets } from '../lib/env';
import { shot } from '../lib/state';

// Scenario 44: the family account (owner "go" 25 Nov 2026). Mona Hassan signs in with her email and password and sees her three
// children at Al Nour International School; each takes 5 subjects; the assistant answers about practice and marks with charts.
const PARENT = 'mona.hassan@alnour.school.enara.app';

test.describe.serial('44 · Family account: 3 children, 5 subjects each', () => {
  test('the family is built, the parent signs in and sees every child, subject and chart', async ({ browser }) => {
    test.setTimeout(180_000);
    const out = await maintenance('POST', '/full-seed', { action: 'run-family', password: secrets.enaraPassword });
    expect(out.children).toEqual(['Youssef Hassan (Grade 3)', 'Laila Hassan (Grade 6)', 'Omar Hassan (Grade 9)']);
    expect(JSON.stringify(out)).not.toContain(secrets.enaraPassword);

    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('[pageerror family]', String(e).slice(0, 400)));
    await page.goto(`${ENARA}/`);
    await page.getByRole('tab', { name: 'Parents', exact: true }).click();
    await page.locator('#si-email').fill(PARENT);
    await page.locator('#si-pass').fill(secrets.enaraPassword);
    await page.getByRole('button', { name: 'Continue' }).click();

    const chips = page.locator('.pp-switcher .pp-chip:not(.pp-chip--add)');
    await expect(chips).toHaveCount(3, { timeout: 45_000 });
    for (const name of ['Youssef', 'Laila', 'Omar']) await expect(chips.filter({ hasText: name })).toHaveCount(1);
    for (const name of ['Youssef', 'Laila', 'Omar']) {
      await chips.filter({ hasText: name }).click();
      await expect(page.getByTestId('pp-subjects').getByRole('button')).toHaveCount(6, { timeout: 30_000 }); // All subjects + 5
    }
    await shot(page, 'family-44-01-home');

    // The assistant (Laila is selected): practice per week and marks per subject, each with its chart.
    await chips.filter({ hasText: 'Laila' }).click();
    await page.getByTestId('pp-nav-messages').click();
    await page.getByTestId('pp-chat-open').click();
    await page.getByTestId('pp-chat-input').fill('How is she doing in her tests?');
    await page.getByTestId('pp-chat-send').click();
    const marks = page.getByTestId('pp-chat-answer').last().getByTestId('pp-chat-chart');
    await expect(marks).toHaveAttribute('data-kind', 'subjects', { timeout: 30_000 });
    await expect(marks.getByTestId('pp-chat-chart-row')).toHaveCount(5);
    await page.getByTestId('pp-chat-input').fill('How much does she practise?');
    await page.getByTestId('pp-chat-send').click();
    const practice = page.getByTestId('pp-chat-answer').last().getByTestId('pp-chat-chart');
    await expect(practice).toHaveAttribute('data-kind', 'weeks', { timeout: 30_000 });
    await shot(page, 'family-44-02-assistant');
    await context.close();
  });
});
