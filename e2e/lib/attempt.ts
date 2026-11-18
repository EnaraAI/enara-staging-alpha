import { expect, type Frame } from '@playwright/test';
import { QUESTIONS } from './content';

/**
 * Student, inside the ENARA frame on an opened assignment: start an attempt,
 * answer the first `correct` questions right and the rest wrong, submit.
 */
export async function answerAndSubmit(f: Frame, correct: number): Promise<void> {
  const start = f.getByRole('button', { name: /^(Start|Start another attempt|Continue)$/ });
  await expect(start).toBeVisible();
  await start.click();
  for (const [i, q] of QUESTIONS.entries()) {
    const set = f.locator('fieldset').filter({ hasText: q.text });
    await set.getByLabel(i < correct ? q.options[0] : q.options[1], { exact: true }).check();
  }
  await expect(f.getByText(`${QUESTIONS.length} of ${QUESTIONS.length} answered`)).toBeVisible();
  await f.getByRole('button', { name: 'Submit', exact: true }).first().click();
  const dialog = f.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  // Back on the assignment: the attempt is listed (or a result is shown).
  await expect(f.getByRole('button', { name: /Start another attempt/ })).toBeVisible({ timeout: 60_000 });
}
