import { expect, type Browser, type BrowserContext, type Page, type Route, type WebSocketRoute } from '@playwright/test';
import { enaraApi, login, seedEmail } from './enara';
import { ENARA, secrets } from './env';

// A live tutor call in the browser with no video or speech provider (this stack has none, and nothing here may cost
// money). The learner is a seeded School A student signed in to ENARA's own site. Playwright stands in for every
// provider-facing piece: the call start (POST /api/avatar/session), the tutor's replies (/api/avatar/query-stream),
// its speech (/api/avatar/speak: silence) and ElevenLabs real-time transcription (a fake WebSocket that says what
// the "learner" said). The fake session token makes the video tutor refuse, so the call carries on voice-only, the
// mode where ENARA listens and speaks itself. Nothing leaves the stack.

export const LIVE_STUDENT = 'lt-s-a03'; // 14 years old, group 7A (School A)
const LIVE_CLASS = 'LT-C-ENG-7A';
export const SESSION_ID = 'av-e2e-live';
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

export interface LiveQuery { kind: string; messages: Array<{ role: string; content: string }>; at: number }

export interface LiveCall {
  context: BrowserContext;
  page: Page;
  /** Every reply the call asked the tutor for (opening, turns, nudges), in order. */
  queries: LiveQuery[];
  /** Transcription sessions the browser opened (each one is the microphone streaming), with whether each has closed. */
  stt: Array<{ ws: WebSocketRoute; closed: boolean; audioChunks: number }>;
  /** The fake transcription service hears the learner say this (on the newest open session). */
  learnerSays(text: string, language?: string): Promise<void>;
  /** The call-start response's features (the server's live call switches); change before the next start. */
  features: Record<string, boolean> | undefined;
  /** The tutor's reply text for a request (Markdown allowed: the server sends what the model wrote, cleaned by the browser). */
  reply: (q: LiveQuery) => string;
  /** The visual aid the call's side panel shows (null: none). */
  artifactHtml: string | null;
}

/** The tutor's default reply lines: text only (the browser asks /speak for each sentence's audio). */
export const tutorReply = (q: LiveQuery) =>
  q.kind === 'opening' ? 'Hello! I am your tutor today. What is your name?' : q.kind === 'nudge' ? 'Take your time. What is your name?' : 'Nice to meet you. Let us practise greetings.';

export async function liveCallSession(browser: Browser, opts: { features?: Record<string, boolean> } = {}): Promise<LiveCall> {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1, permissions: ['microphone'] });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('[pageerror live call]', String(e).slice(0, 500)));
  // ENARA's first-visit product tour is not under test. It can open under the call's modal (where a click can't reach
  // it), so it is skipped with a click event sent straight to its button.
  await page.addLocatorHandler(page.getByRole('button', { name: 'Skip tour' }), async (b) => { await b.dispatchEvent('click'); });
  // Straight to the services (no relay), which are all faked below.
  await context.addInitScript(() => { try { localStorage.setItem('enara.relay', 'off'); } catch { /* storage blocked */ } });

  const call: LiveCall = {
    context, page, queries: [], stt: [], features: opts.features, reply: tutorReply, artifactHtml: null,
    async learnerSays(text: string, language = 'en') {
      await expect.poll(() => call.stt.filter((s) => !s.closed).length, { timeout: 30_000, message: 'an open transcription session' }).toBeGreaterThan(0);
      const open = call.stt.filter((s) => !s.closed);
      open[open.length - 1].ws.send(JSON.stringify({ message_type: 'committed_transcript_with_timestamps', text, language_code: language, words: [] }));
    },
  };

  // The video provider is never reached (its fake token is refused before any request; this is a safety net).
  await context.route(/^https:\/\/([a-z0-9-]+\.)*anam\.ai\//, (route) => route.abort());
  await context.route(/\/api\/avatar\/session$/, (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    return json(route, {
      session_id: SESSION_ID, provider: 'video', session_token: 'e2e-not-a-session-token', speech: 'server', fallback_reason: null, pronunciation: false,
      ...(call.features ? { features: call.features } : {}),
    });
  });
  await context.route(new RegExp(`/api/avatar/session/${SESSION_ID}(/[a-z-]+)?$`), (route) => {
    const url = route.request().url();
    if (route.request().method() === 'DELETE') return route.fulfill({ status: 204, body: '' });
    if (url.endsWith('/stt-token')) return json(route, { token: 'e2e-not-a-token', model_id: 'scribe_v2_realtime' });
    if (url.endsWith('/heartbeat')) return route.fulfill({ status: 204, body: '' });
    return json(route, { error: { code: 'NOT_FOUND', message: 'not in this test' } }, 404);
  });
  await context.route(new RegExp(`/api/avatar/artifact/${SESSION_ID}$`), (route) => json(route, { html: call.artifactHtml }));
  await context.route(/\/api\/avatar\/query-stream$/, (route) => {
    const body = route.request().postDataJSON() as { kind?: string; messages?: LiveQuery['messages'] };
    const q: LiveQuery = { kind: body.kind ?? 'turn', messages: body.messages ?? [], at: Date.now() };
    call.queries.push(q);
    const text = call.reply(q);
    const lines = text.split(/(?<=[.!?]) /).map((part, i, all) => JSON.stringify({ content: i < all.length - 1 ? `${part} ` : part }));
    return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: `${lines.join('\n')}\n` });
  });
  // 0.1 s of silence per sentence (16 kHz, 16-bit mono PCM).
  await context.route(/\/api\/avatar\/speak$/, (route) => route.fulfill({ status: 200, contentType: 'audio/L16; rate=16000; channels=1', body: Buffer.alloc(3200) }));
  await context.routeWebSocket(/\/v1\/speech-to-text\/realtime/, (ws) => {
    const entry = { ws, closed: false, audioChunks: 0 };
    call.stt.push(entry);
    ws.onMessage((m) => { if (typeof m === 'string' && m.includes('input_audio_chunk')) entry.audioChunks += 1; });
    ws.onClose(() => { entry.closed = true; });
    ws.send(JSON.stringify({ message_type: 'session_started', session_id: `e2e-${call.stt.length}`, config: {} }));
  });

  // The E2E stack reads a student's classes from class enrolments (multi-class on); the seed links students only
  // through their group, so the learner is enrolled in English 7A here (as scenarios 5 and 15 do).
  await enaraApi.post(`/api/multi-class/students/${LIVE_STUDENT.toUpperCase()}/enrollments`, await login('admin.a'), { scope: 'class', targetId: LIVE_CLASS }, [200, 201, 409]);

  // Sign in as the student on ENARA's own site.
  await page.goto(`${ENARA}/`);
  await page.getByRole('tab', { name: 'Student', exact: true }).click();
  await page.locator('#si-email').fill(seedEmail(LIVE_STUDENT));
  await page.locator('#si-pass').fill(secrets.enaraPassword);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect.poll(() => page.evaluate(() => !!(sessionStorage.getItem('enara_token') || localStorage.getItem('enara_token'))), { timeout: 30_000 }).toBe(true);
  // The product tour is not under test: mark it done (as "Skip tour" would), so it never opens under the call.
  const token = await page.evaluate(() => sessionStorage.getItem('enara_token') || localStorage.getItem('enara_token') || '');
  await page.request.post(`${ENARA}/api/auth/tour/complete`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
  await page.evaluate(() => {
    for (const store of [sessionStorage, localStorage]) {
      const raw = store.getItem('enara_user');
      if (raw) store.setItem('enara_user', JSON.stringify({ ...JSON.parse(raw), tourPending: false }));
    }
  });
  await page.reload();
  // If the tour still starts (it opens 1.2 s after the page), skip it now, before anything else opens.
  const tour = page.getByRole('button', { name: 'Skip tour' });
  if (await tour.waitFor({ state: 'visible', timeout: 4000 }).then(() => true, () => false)) await tour.dispatchEvent('click');
  return call;
}

/** My learning -> the English course -> the course page with its tutor panel. */
export async function openCoursePage(call: LiveCall): Promise<void> {
  const { page } = call;
  await page.getByRole('button', { name: 'My learning', exact: true }).click();
  await page.getByRole('button', { name: /English/ }).first().click();
  await expect(page.getByRole('button', { name: /Live AI Tutor/ })).toBeVisible({ timeout: 60_000 });
}

/** From the course page: open the live tutor and start a call (fake microphone; the call goes voice-only). */
export async function startCall(call: LiveCall): Promise<void> {
  const { page } = call;
  const before = call.queries.length;
  await page.getByRole('button', { name: /Live AI Tutor/ }).click();
  await page.getByRole('button', { name: 'Start call' }).click();
  // The tutor opens the call by itself once ENARA is listening.
  await expect.poll(() => call.queries.slice(before).some((q) => q.kind === 'opening'), { timeout: 60_000, message: 'the tutor opened the call' }).toBe(true);
}

export async function endCall(call: LiveCall): Promise<void> {
  const close = call.page.locator('.fixed.inset-0 button').filter({ has: call.page.locator('svg.lucide-x') }).first();
  await close.click();
  await expect(call.page.getByRole('button', { name: 'Start call' })).toBeHidden();
}
