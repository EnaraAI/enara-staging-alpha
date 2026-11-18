import { lmsNewTabUrl, reportMicTelemetry, type LmsNewTabTarget } from './apiService';
import { browserFamily, isInFrame, type MicFeature } from './micCheck';

// "Open in new tab" that works in Safari (mic / new tab, item 1). Safari only
// lets a page open a tab during the click itself; a tab opened after waiting
// for the server is blocked. So a blank tab opens at once, inside the click,
// and is pointed at ENARA when the server has made the one-time link. If the
// browser blocked even the blank tab, the caller shows a plain link instead.

export type NewTabOutcome = { state: 'opened' } | { state: 'blocked'; url: string } | { state: 'failed'; message: string };

export function reportNewTabOpened(feature?: MicFeature, bearer?: string) {
  reportMicTelemetry(
    { event: 'new_tab_opened', browserFamily: browserFamily(typeof navigator === 'undefined' ? '' : navigator.userAgent), inFrame: isInFrame(), ...(feature ? { feature } : {}) },
    bearer,
  );
}

/** Call it synchronously from the click handler (before any await): the blank tab must open inside the click. */
export function openLmsNewTab(target: LmsNewTabTarget, opts: { bearer?: string; feature?: MicFeature } = {}): Promise<NewTabOutcome> {
  let w: Window | null = null;
  try {
    w = window.open('about:blank', '_blank');
  } catch {
    w = null;
  }
  if (w) {
    // The new tab must not reach back into this page (what 'noopener' did before).
    try { w.opener = null; } catch { /* ignore */ }
    try {
      w.document.title = 'ENARA';
      w.document.body.style.fontFamily = 'system-ui, sans-serif';
      w.document.body.textContent = 'Opening ENARA…';
    } catch { /* ignore */ }
  }
  return lmsNewTabUrl(target, opts.bearer).then(
    (url): NewTabOutcome => {
      if (w && !w.closed) {
        w.location.replace(url);
        reportNewTabOpened(opts.feature, opts.bearer);
        return { state: 'opened' };
      }
      return { state: 'blocked', url };
    },
    (error: unknown): NewTabOutcome => {
      if (w && !w.closed) w.close();
      return { state: 'failed', message: error instanceof Error && error.message ? error.message : 'Could not open a new tab. Try again.' };
    },
  );
}
