import { describe, expect, it } from 'vitest';
import { quizGate, slotOutcome, objectiveForSlot, REVIEW, type MoodleQuiz } from '../src/integrations/lms/core/moodleQuiz';
import { flatten, moodleQuizWs, siteBase, MoodleQuizWsError, MOODLE_QUIZ_FUNCTIONS } from '../src/integrations/lms/core/moodleQuizWs';

// Errors to work on from Moodle's own quizzes (MOODLE_QUIZ_IMPORT_PLAN v2): the gate, the outcomes and the read-only client.
const NOW = Date.UTC(2026, 10, 20, 12);
const closedQuiz: MoodleQuiz = { id: 7, course: 2, timeclose: NOW / 1000 - 60, attempts: 0, reviewcorrectness: REVIEW.AFTER_CLOSE };
const fin = (id = 1) => ({ id, state: 'finished', timefinish: NOW / 1000 - 3600 });

describe('moodle quiz gate (same rule as ENARA assignments)', () => {
  it('opens after the closing time when correctness may be reviewed after close', () => {
    expect(quizGate(closedQuiz, [fin()], NOW)).toEqual({ open: true, reason: 'closed' });
  });
  it('stays shut while the quiz is open and attempts are left, while an attempt is in progress, or with nothing finished', () => {
    expect(quizGate({ ...closedQuiz, timeclose: NOW / 1000 + 600 }, [fin()], NOW).reason).toBe('quiz_still_open');
    expect(quizGate({ ...closedQuiz, timeclose: 0, attempts: 0 }, [fin()], NOW).reason).toBe('quiz_still_open');
    expect(quizGate(closedQuiz, [fin(), { id: 2, state: 'inprogress' }], NOW).reason).toBe('attempt_in_progress');
    expect(quizGate(closedQuiz, [], NOW).reason).toBe('no_finished_attempt');
  });
  it('opens when no attempts are left, if correctness may be reviewed later while open', () => {
    const q = { ...closedQuiz, timeclose: 0, attempts: 1, reviewcorrectness: REVIEW.LATER_WHILE_OPEN };
    expect(quizGate(q, [fin()], NOW)).toEqual({ open: true, reason: 'no_attempts_left' });
    expect(quizGate({ ...q, reviewcorrectness: REVIEW.AFTER_CLOSE }, [fin()], NOW).reason).toBe('review_not_allowed');
  });
  it('stays shut when review after close is not allowed or unknown', () => {
    expect(quizGate({ ...closedQuiz, reviewcorrectness: REVIEW.DURING }, [fin()], NOW).reason).toBe('review_not_allowed');
    expect(quizGate({ ...closedQuiz, reviewcorrectness: undefined }, [fin()], NOW).reason).toBe('review_unknown');
  });
});

describe('moodle question outcomes and objectives', () => {
  it('right, wrong (wrong, partly right, gave up) or not counted', () => {
    expect(slotOutcome('gradedright')).toBe('right');
    for (const s of ['gradedwrong', 'gradedpartial', 'gaveup']) expect(slotOutcome(s)).toBe('wrong');
    for (const s of ['needsgrading', 'complete', 'todo', undefined]) expect(slotOutcome(s)).toBeNull();
  });
  it('a slot mapping wins over the quiz mapping', () => {
    const m = { objectiveId: 'obj-a', slotObjectives: [{ slot: 2, objectiveId: 'obj-b' }] };
    expect(objectiveForSlot(m, 1)).toBe('obj-a');
    expect(objectiveForSlot(m, 2)).toBe('obj-b');
    expect(objectiveForSlot({ slotObjectives: [] }, 1)).toBeUndefined();
  });
});

describe('read-only Moodle client', () => {
  const TOKEN = 'abcdef0123456789abcdef0123456789';
  it('only the three read functions exist; anything else is refused before any request', async () => {
    expect([...MOODLE_QUIZ_FUNCTIONS]).toEqual(['mod_quiz_get_quizzes_by_courses', 'mod_quiz_get_user_attempts', 'mod_quiz_get_attempt_review']);
    let called = false;
    const ws = moodleQuizWs('https://moodle.example', TOKEN, async () => { called = true; return { ok: true, status: 200, text: async () => '{}' }; });
    await expect(ws.call('core_user_create_users' as never, {})).rejects.toThrow('function_not_allowed');
    expect(called).toBe(false);
  });
  it('posts the token in the body to the site, encodes arrays the Moodle way, and keeps the token out of errors', async () => {
    let seen: { url: string; body: string } | undefined;
    const ws = moodleQuizWs('https://moodle.example', TOKEN, async (url, init) => { seen = { url, body: init.body }; return { ok: true, status: 200, text: async () => JSON.stringify({ exception: 'x', errorcode: 'invalidtoken', message: `Invalid token ${TOKEN}` }) }; });
    const err = await ws.call('mod_quiz_get_quizzes_by_courses', { courseids: [2, 5] }).catch((e) => e);
    expect(seen!.url).toBe('https://moodle.example/webservice/rest/server.php');
    expect(seen!.body).toContain('courseids%5B0%5D=2');
    expect(seen!.body).toContain('wsfunction=mod_quiz_get_quizzes_by_courses');
    expect(err).toBeInstanceOf(MoodleQuizWsError);
    expect(err.code).toBe('invalidtoken');
    expect(String(err.message)).not.toContain(TOKEN);
  });
  it('flattens nested params and booleans', () => {
    expect(flatten({ quizid: 7, includepreviews: false, courseids: [1, 2] })).toEqual([['quizid', '7'], ['includepreviews', '0'], ['courseids[0]', '1'], ['courseids[1]', '2']]);
  });
  it('the site must be https (http only for a local test site), with no credentials, query or fragment', () => {
    expect(siteBase('https://moodle.example/')).toBe('https://moodle.example');
    expect(siteBase('https://school.example/moodle/')).toBe('https://school.example/moodle');
    expect(() => siteBase('http://moodle.example')).toThrow('site_not_https');
    expect(siteBase('http://localhost:8080', true)).toBe('http://localhost:8080');
    expect(() => siteBase('https://user:pw@moodle.example')).toThrow('bad_site_url');
    expect(() => siteBase('https://moodle.example/?x=1')).toThrow('bad_site_url');
  });
});
