import { describe, expect, it } from 'vitest';
import {
  browserFamily,
  classifyMicError,
  classifySpeechRecognitionError,
  isInFrame,
  isSafari,
  likelyMicStatus,
  micMessage,
  micPolicy,
  micTelemetryEvent,
  showSafariFrameHint,
  type MicStatus,
} from '../../../frontend/services/micCheck';
import { lmsLandingPage } from '../../../frontend/services/roleRouting';

// LMS mic / new tab, items 3 and 4: the frontend's pure helpers (the frontend
// has no test runner). Error mapping of the click-time probe, the no-prompt
// check on load, conservative Safari detection, messages (EN + AR), the
// telemetry event per outcome, and where "Open in new tab" lands.

const UA = {
  chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  androidWebView: 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36',
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  edgeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/131.0.2903.68 Mobile/15E148 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:132.0) Gecko/20100101 Firefox/132.0',
  firefoxIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  safariIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  safariIpad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iosWebView: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  opera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/115.0.0.0',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
};

const err = (name: string) => Object.assign(new Error(name), { name });

describe('browser family and Safari detection (conservative)', () => {
  it('Chrome, Edge and Firefox tokens are never Safari, on iOS too', () => {
    expect(browserFamily(UA.chromeMac)).toBe('chrome');
    expect(browserFamily(UA.chromeAndroid)).toBe('chrome');
    expect(browserFamily(UA.androidWebView)).toBe('chrome');
    expect(browserFamily(UA.chromeIos)).toBe('chrome');
    expect(browserFamily(UA.edge)).toBe('edge');
    expect(browserFamily(UA.edgeIos)).toBe('edge');
    expect(browserFamily(UA.firefox)).toBe('firefox');
    expect(browserFamily(UA.firefoxIos)).toBe('firefox');
    expect(browserFamily(UA.opera)).toBe('other');
    expect(browserFamily(UA.samsung)).toBe('other');
    expect(browserFamily('')).toBe('other');
    expect(browserFamily('curl/8.0')).toBe('other');
  });
  it('WebKit Safari (macOS, iPhone, iPad, and the iOS web view) is Safari', () => {
    for (const ua of [UA.safariMac, UA.safariIos, UA.safariIpad, UA.iosWebView]) expect(isSafari(ua), ua).toBe(true);
    for (const ua of [UA.chromeMac, UA.chromeIos, UA.edgeIos, UA.firefoxIos, UA.androidWebView]) expect(isSafari(ua), ua).toBe(false);
  });
  it('item 4: the small "Open in a new tab" link shows for Safari inside a frame only', () => {
    expect(showSafariFrameHint(UA.safariMac, true)).toBe(true);
    expect(showSafariFrameHint(UA.safariIos, true)).toBe(true);
    expect(showSafariFrameHint(UA.safariMac, false)).toBe(false);
    expect(showSafariFrameHint(UA.chromeMac, true)).toBe(false);
    expect(showSafariFrameHint(UA.firefox, true)).toBe(false);
  });
});

describe('the click-time probe: what a getUserMedia error means', () => {
  it('NotAllowedError / SecurityError: blocked by the frame inside one, denied outside', () => {
    for (const name of ['NotAllowedError', 'SecurityError', 'PermissionDeniedError']) {
      expect(classifyMicError(err(name), true)).toBe('blocked_in_frame');
      expect(classifyMicError(err(name), false)).toBe('denied');
    }
  });
  it('NotFoundError / OverconstrainedError: no microphone; NotReadableError / AbortError: busy', () => {
    for (const name of ['NotFoundError', 'OverconstrainedError', 'DevicesNotFoundError']) for (const f of [true, false]) expect(classifyMicError(err(name), f)).toBe('no_microphone');
    for (const name of ['NotReadableError', 'AbortError', 'TrackStartError']) for (const f of [true, false]) expect(classifyMicError(err(name), f)).toBe('busy');
  });
  it('no mediaDevices (TypeError) is unsupported; anything unknown is treated as busy', () => {
    expect(classifyMicError(new TypeError('x'), false)).toBe('unsupported');
    expect(classifyMicError(err('WeirdError'), true)).toBe('busy');
    expect(classifyMicError(undefined, true)).toBe('busy');
    expect(classifyMicError('NotAllowedError', true)).toBe('busy'); // a string is not a DOMException
  });
  it('the speech service errors (tutor voice input) map the same way; other errors are not about the mic', () => {
    expect(classifySpeechRecognitionError('not-allowed', true)).toBe('blocked_in_frame');
    expect(classifySpeechRecognitionError('not-allowed', false)).toBe('denied');
    expect(classifySpeechRecognitionError('service-not-allowed', false)).toBe('denied');
    expect(classifySpeechRecognitionError('audio-capture', true)).toBe('no_microphone');
    for (const e of ['no-speech', 'network', 'aborted', 'language-not-supported', '']) expect(classifySpeechRecognitionError(e, true)).toBeNull();
  });
});

describe('the no-prompt check on load', () => {
  it('reads the frame policy where the browser has the API (permissionsPolicy, then featurePolicy)', () => {
    expect(micPolicy({ permissionsPolicy: { allowsFeature: (f) => f !== 'microphone' } })).toBe('blocked');
    expect(micPolicy({ permissionsPolicy: { allowsFeature: () => true } })).toBe('allowed');
    expect(micPolicy({ featurePolicy: { allowsFeature: () => false } })).toBe('blocked');
    expect(micPolicy({ permissionsPolicy: { allowsFeature: () => { throw new Error('x'); } }, featurePolicy: { allowsFeature: () => true } })).toBe('allowed');
    expect(micPolicy({})).toBe('unknown'); // Safari, Firefox
    expect(micPolicy(undefined)).toBe('unknown');
  });
  it('combines frame, policy and permission into what is most likely', () => {
    expect(likelyMicStatus(true, 'blocked', 'unknown')).toBe('blocked_in_frame');
    expect(likelyMicStatus(true, 'blocked', 'granted')).toBe('blocked_in_frame');
    expect(likelyMicStatus(true, 'unknown', 'denied')).toBe('blocked_in_frame');
    expect(likelyMicStatus(true, 'allowed', 'denied')).toBe('denied');
    expect(likelyMicStatus(false, 'unknown', 'denied')).toBe('denied');
    expect(likelyMicStatus(false, 'allowed', 'granted')).toBe('ok');
    expect(likelyMicStatus(true, 'unknown', 'prompt')).toBe('unknown');
    expect(likelyMicStatus(true, 'allowed', 'unknown')).toBe('unknown');
  });
  it('a cross-origin parent (top throws) counts as a frame; no window: not a frame', () => {
    const w = { self: 1 } as { self: unknown; top: unknown };
    Object.defineProperty(w, 'top', { get() { throw new Error('cross-origin'); } });
    expect(isInFrame(w)).toBe(true);
    const same = {} as { self: unknown; top: unknown };
    same.self = same;
    same.top = same;
    expect(isInFrame(same)).toBe(false);
    expect(isInFrame({ self: 1, top: 2 })).toBe(true);
  });
});

describe('messages and telemetry', () => {
  const problems: Exclude<MicStatus, 'ok'>[] = ['blocked_in_frame', 'denied', 'no_microphone', 'busy', 'unsupported'];
  it('every problem has its own English and Arabic message; only "blocked in the frame" offers the new tab', () => {
    const titles = new Set<string>();
    for (const p of problems) {
      const en = micMessage(p, 'en');
      const ar = micMessage(p, 'ar');
      expect(en.title && en.body).toBeTruthy();
      expect(ar.body).toMatch(/[؀-ۿ]/);
      expect(en.newTab).toBe(p === 'blocked_in_frame');
      expect(ar.newTab).toBe(en.newTab);
      titles.add(en.title);
    }
    expect(titles.size).toBe(problems.length);
    expect(micMessage('denied').body).toMatch(/Allow/);
    expect(micMessage('blocked_in_frame').body).toMatch(/new tab/);
  });
  it('maps each outcome to its telemetry event', () => {
    expect(micTelemetryEvent('ok')).toBe('mic_ok');
    expect(micTelemetryEvent('blocked_in_frame')).toBe('mic_blocked_in_frame');
    expect(micTelemetryEvent('denied')).toBe('mic_denied');
    expect(micTelemetryEvent('no_microphone')).toBe('mic_none');
    expect(micTelemetryEvent('unsupported')).toBe('mic_none');
    expect(micTelemetryEvent('busy')).toBe('mic_busy');
  });
});

describe('where "Open in new tab" lands (same step)', () => {
  it('an assignment opens the assignments page; a page reopens that page when the portal has it', () => {
    expect(lmsLandingPage('student', 'student', null, 'dashboard')).toBe('dashboard');
    expect(lmsLandingPage('student', 'student', { assignmentId: 'a1' }, 'dashboard')).toBe('assignments-student');
    expect(lmsLandingPage('admin', 'teacher', { assignmentId: 'a1' }, 'teaching')).toBe('class-assignments');
    expect(lmsLandingPage('student', 'student', { page: 'courses' }, 'dashboard')).toBe('courses');
    expect(lmsLandingPage('student', 'student', { page: 'live-avatars' }, 'dashboard')).toBe('dashboard');
    expect(lmsLandingPage('student', 'student', { page: 'taking-assessment' }, 'dashboard')).toBe('dashboard');
    expect(lmsLandingPage('admin', 'teacher', { page: 'teaching' }, 'teaching')).toBe('teaching');
    expect(lmsLandingPage('admin', 'teacher', { page: 'dashboard' }, 'teaching')).toBe('teaching'); // never a school-admin page
    expect(lmsLandingPage('admin', 'admin', { page: 'students' }, 'dashboard')).toBe('students');
    expect(lmsLandingPage('admin', 'admin', { page: 'student-profile' }, 'dashboard')).toBe('dashboard');
  });
});
