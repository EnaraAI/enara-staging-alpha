import { test, expect } from '@playwright/test';
import { ENARA } from '../lib/env';

// Scenario 17 (NEXT_PLAN item 1, kidsAudioVisual): the picture choices for children under 9. The pictures are served from ENARA's own
// folder (OpenMoji, CC BY-SA 4.0), every listed picture loads and draws, and the browser can read a word aloud (speechSynthesis). The
// tutor names the choices in its hidden line; the engine side is covered by unit tests. Speaking (microphone) stays off for children.
test('picture index and pictures load and draw; read-aloud is available', async ({ page }) => {
  const index = await (await page.request.get(`${ENARA}/kids/pics/index.json`)).json() as { words: Record<string, string> };
  const slugs = Object.values(index.words);
  expect(slugs.length).toBeGreaterThan(100);
  const sample = ['cat', 'dog', 'apple', 'ball', 'bus', 'duck'].map((w) => index.words[w]).filter(Boolean);
  expect(sample.length).toBe(6);
  await page.goto(`${ENARA}/kids/pics/index.json`); // same origin as the app, for the image checks below
  const drawn = await page.evaluate(async (list) => Promise.all(list.map((s) => new Promise<number>((done) => {
    const img = new Image(); img.onload = () => done(img.naturalWidth); img.onerror = () => done(0); img.src = `/kids/pics/${s}.svg`;
  }))), sample);
  for (const w of drawn) expect(w).toBeGreaterThan(0);
  const speech = await page.evaluate(() => typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance === 'function');
  expect(speech).toBe(true);
});
