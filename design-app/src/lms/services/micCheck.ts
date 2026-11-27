// Microphone check before it is needed (LMS mic / new tab, item 3).
//
// Inside an LMS frame the browser only lets ENARA use the microphone when the
// LMS page allowed it on the frame (`allow="microphone"`). Chrome and Edge can
// tell in advance without a prompt; Safari and Firefox cannot. So:
//   (a) on load, a check that never prompts (frame? policy? permission state?)
//   (b) on the student's click, a short probe (getUserMedia, then stop) that
//       runs BEFORE the speaking exam, the tutor's voice input or the live
//       avatar starts, and whose error picks the message the student sees.
// This module has no imports and no side effects at load, so the pure parts
// (error mapping, browser family, messages) are tested from the backend suite.

export type MicStatus = 'ok' | 'blocked_in_frame' | 'denied' | 'no_microphone' | 'busy' | 'unsupported';
export type BrowserFamily = 'chrome' | 'safari' | 'firefox' | 'edge' | 'other';
export type MicFeature = 'speaking' | 'tutor_voice' | 'avatar';
export type MicTelemetryEvent = 'mic_ok' | 'mic_blocked_in_frame' | 'mic_denied' | 'mic_none' | 'mic_busy' | 'new_tab_opened';

/** True inside any frame (an LMS, or anything else embedding ENARA). A cross-origin parent throws: also a frame. */
export function isInFrame(win: { self: unknown; top: unknown } | undefined = typeof window === 'undefined' ? undefined : window): boolean {
  if (!win) return false;
  try {
    return win.self !== win.top;
  } catch {
    return true;
  }
}

/**
 * The browser family from the user-agent string. Conservative for Safari:
 * WebKit with a Safari or mobile token and none of the Chrome, Chromium, Edge,
 * Firefox, Opera or Samsung tokens (their iOS builds included).
 */
export function browserFamily(ua: string): BrowserFamily {
  if (!ua) return 'other';
  if (/\b(Edg|Edge|EdgA|EdgiOS)\//.test(ua)) return 'edge';
  if (/\b(Firefox|FxiOS)\//.test(ua)) return 'firefox';
  if (/\b(OPR|Opera|OPiOS|SamsungBrowser|YaBrowser|UCBrowser)\//.test(ua)) return 'other';
  if (/\b(Chrome|Chromium|CriOS|HeadlessChrome)\//.test(ua)) return 'chrome';
  if (/AppleWebKit\//.test(ua) && /\b(Version\/[\d.]+.*Safari\/|Mobile\/\w+)/.test(ua) && !/\b(GSA|FBAN|FBAV|Instagram|Line)\//.test(ua)) return 'safari';
  return 'other';
}

export const isSafari = (ua: string) => browserFamily(ua) === 'safari';

/**
 * Item 4: Safari has no policy API, so inside a frame a small "Open in a new
 * tab" link is shown before a speaking exam starts.
 */
export const showSafariFrameHint = (ua: string, inFrame: boolean) => inFrame && isSafari(ua);

/** What a failed getUserMedia means for the student. */
export function classifyMicError(error: unknown, inFrame: boolean): Exclude<MicStatus, 'ok'> {
  const name = error && typeof error === 'object' && 'name' in error ? String((error as { name: unknown }).name) : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError': // older Chrome
    case 'SecurityError':
      return inFrame ? 'blocked_in_frame' : 'denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError': // older Chrome
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'no_microphone';
    case 'NotReadableError':
    case 'TrackStartError': // older Chrome
    case 'AbortError':
      return 'busy';
    case 'TypeError':
      return 'unsupported'; // no mediaDevices: not a secure context, or an old browser
    default:
      return 'busy';
  }
}

/** The Web Speech API's error strings (the tutor's voice input), mapped the same way; null = not a mic problem. */
export function classifySpeechRecognitionError(error: string, inFrame: boolean): Exclude<MicStatus, 'ok'> | null {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return inFrame ? 'blocked_in_frame' : 'denied';
    case 'audio-capture':
      return 'no_microphone';
    default:
      return null; // no-speech, network, aborted, language-not-supported: not about the microphone
  }
}

export interface QuickMicCheck {
  inFrame: boolean;
  /** The frame's policy for the microphone, where the browser tells (Chrome, Edge). */
  policy: 'allowed' | 'blocked' | 'unknown';
  /** The permission state, where the browser tells. */
  permission: 'granted' | 'denied' | 'prompt' | 'unknown';
  /** What the click will most likely find: 'unknown' until the probe runs. */
  likely: MicStatus | 'unknown';
}

type PolicyDoc = { permissionsPolicy?: { allowsFeature?: (f: string) => boolean }; featurePolicy?: { allowsFeature?: (f: string) => boolean } };

/** Reads the frame's microphone policy without any prompt; 'unknown' where the browser has no API (Safari, Firefox). */
export function micPolicy(doc: PolicyDoc | undefined = typeof document === 'undefined' ? undefined : (document as unknown as PolicyDoc)): QuickMicCheck['policy'] {
  if (!doc) return 'unknown';
  for (const api of [doc.permissionsPolicy, doc.featurePolicy]) {
    try {
      if (api && typeof api.allowsFeature === 'function') return api.allowsFeature('microphone') ? 'allowed' : 'blocked';
    } catch {
      /* try the next one */
    }
  }
  return 'unknown';
}

/** Combines the frame, the policy and the permission state into what is most likely (pure). */
export function likelyMicStatus(inFrame: boolean, policy: QuickMicCheck['policy'], permission: QuickMicCheck['permission']): QuickMicCheck['likely'] {
  if (inFrame && policy === 'blocked') return 'blocked_in_frame';
  if (permission === 'denied') return inFrame && policy !== 'allowed' ? 'blocked_in_frame' : 'denied';
  if (permission === 'granted' && policy !== 'blocked') return 'ok';
  return 'unknown';
}

/** (a) On load: never prompts. */
export async function quickMicCheck(): Promise<QuickMicCheck> {
  const inFrame = isInFrame();
  const policy = micPolicy();
  let permission: QuickMicCheck['permission'] = 'unknown';
  try {
    const nav = typeof navigator === 'undefined' ? undefined : navigator;
    const status = await nav?.permissions?.query({ name: 'microphone' as PermissionName });
    if (status && (status.state === 'granted' || status.state === 'denied' || status.state === 'prompt')) permission = status.state;
  } catch {
    /* Firefox and older Safari do not know the 'microphone' permission name */
  }
  return { inFrame, policy, permission, likely: likelyMicStatus(inFrame, policy, permission) };
}

/**
 * (b) On the student's click, before any voice or avatar SDK starts: asks for
 * the microphone (the browser may prompt), then stops every track at once.
 * Camera only when the feature itself uses it.
 */
export async function probeMic(opts: { video?: boolean } = {}): Promise<MicStatus> {
  const inFrame = isInFrame();
  const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
  if (!media || typeof media.getUserMedia !== 'function') return inFrame && micPolicy() === 'blocked' ? 'blocked_in_frame' : 'unsupported';
  try {
    const stream = await media.getUserMedia({ audio: true, ...(opts.video ? { video: true } : {}) });
    stream.getTracks().forEach((t) => t.stop());
    return 'ok';
  } catch (error) {
    return classifyMicError(error, inFrame);
  }
}

/** The telemetry event for a probe result ('unsupported' is counted as no microphone). */
export function micTelemetryEvent(status: MicStatus): Exclude<MicTelemetryEvent, 'new_tab_opened'> {
  switch (status) {
    case 'ok':
      return 'mic_ok';
    case 'blocked_in_frame':
      return 'mic_blocked_in_frame';
    case 'denied':
      return 'mic_denied';
    case 'no_microphone':
    case 'unsupported':
      return 'mic_none';
    default:
      return 'mic_busy';
  }
}

export interface MicMessage {
  title: string;
  body: string;
  /** Offer "Open in a new tab" (the LMS frame blocks the microphone). */
  newTab: boolean;
}

const EN: Record<Exclude<MicStatus, 'ok'>, MicMessage> = {
  blocked_in_frame: {
    title: 'Your LMS page blocks the microphone',
    body: 'The page ENARA is shown in does not allow the microphone. Open ENARA in a new tab to use your voice. You stay signed in and your work is kept.',
    newTab: true,
  },
  denied: {
    title: 'Microphone access is turned off',
    body: 'Your browser blocked the microphone for ENARA. Click the lock or camera icon in the address bar, set Microphone to Allow, then reload the page and try again.',
    newTab: false,
  },
  no_microphone: {
    title: 'No microphone found',
    body: 'Connect a microphone or headset (or check that it is switched on), then try again.',
    newTab: false,
  },
  busy: {
    title: 'The microphone is busy',
    body: 'Another app or tab is using the microphone. Close it (for example a video call), then try again.',
    newTab: false,
  },
  unsupported: {
    title: 'This browser cannot use the microphone here',
    body: 'Use a recent version of Chrome, Edge, Safari or Firefox, then try again.',
    newTab: false,
  },
};

const AR: Record<Exclude<MicStatus, 'ok'>, MicMessage> = {
  blocked_in_frame: {
    title: 'صفحة نظام التعلّم تمنع الميكروفون',
    body: 'الصفحة التي تعرض ENARA لا تسمح باستخدام الميكروفون. افتح ENARA في علامة تبويب جديدة لاستخدام صوتك. ستبقى مسجّلاً للدخول ويُحفظ عملك.',
    newTab: true,
  },
  denied: {
    title: 'الوصول إلى الميكروفون متوقف',
    body: 'منع المتصفح الميكروفون عن ENARA. اضغط على رمز القفل أو الكاميرا في شريط العنوان، واختر «السماح» للميكروفون، ثم أعد تحميل الصفحة وحاول مرة أخرى.',
    newTab: false,
  },
  no_microphone: {
    title: 'لم يتم العثور على ميكروفون',
    body: 'وصّل ميكروفوناً أو سماعة رأس (أو تأكد من تشغيله)، ثم حاول مرة أخرى.',
    newTab: false,
  },
  busy: {
    title: 'الميكروفون مشغول',
    body: 'تطبيق أو علامة تبويب أخرى تستخدم الميكروفون. أغلقها (مثل مكالمة فيديو)، ثم حاول مرة أخرى.',
    newTab: false,
  },
  unsupported: {
    title: 'لا يمكن لهذا المتصفح استخدام الميكروفون هنا',
    body: 'استخدم إصداراً حديثاً من Chrome أو Edge أو Safari أو Firefox، ثم حاول مرة أخرى.',
    newTab: false,
  },
};

export function micMessage(status: Exclude<MicStatus, 'ok'>, lang: 'en' | 'ar' = 'en'): MicMessage {
  return (lang === 'ar' ? AR : EN)[status];
}
