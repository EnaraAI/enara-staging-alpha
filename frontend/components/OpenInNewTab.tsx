import React, { useState } from 'react';
import { isLmsSession, type LmsNewTabTarget } from '../services/apiService';
import { openLmsNewTab, reportNewTabOpened } from '../services/lmsNewTab';
import type { MicFeature } from '../services/micCheck';

// "Open in new tab" (mic / new tab, item 1): a blank tab opens inside the
// click and is pointed at a fresh one-time link (60 seconds, used once) when
// the server has made it. If the browser blocked the tab, a plain link is
// shown for the student to click. Outside an LMS session (another site
// embedding ENARA) it is a plain link to ENARA: the student signs in there.

export const OpenInNewTab: React.FC<{
  /** Read at click time: where the new tab lands. */
  target: () => LmsNewTabTarget;
  /** The session token when this page could not store it (blocked storage in the frame). */
  bearer?: string;
  feature?: MicFeature;
  label?: string;
  className?: string;
  /** Also show the Arabic text (components that already speak Arabic). */
  arabic?: boolean;
}> = ({ target, bearer, feature, label = 'Open in a new tab', className, arabic = false }) => {
  const [state, setState] = useState<{ kind: 'idle' | 'opening' | 'opened' } | { kind: 'blocked'; url: string } | { kind: 'failed'; message: string }>({ kind: 'idle' });
  const lms = !!bearer || isLmsSession();
  const buttonClass = className ?? 'underline font-semibold disabled:opacity-60';

  if (!lms) {
    return (
      <a href={typeof window === 'undefined' ? '/' : window.location.origin + '/'} target="_blank" rel="noopener noreferrer" className={buttonClass} onClick={() => reportNewTabOpened(feature)}>
        {label}
      </a>
    );
  }

  const open = () => {
    setState({ kind: 'opening' });
    // No await before this call: the blank tab opens inside the click.
    void openLmsNewTab(target(), { bearer, feature }).then((outcome) => {
      if (outcome.state === 'opened') setState({ kind: 'opened' });
      else if (outcome.state === 'blocked') setState({ kind: 'blocked', url: outcome.url });
      else setState({ kind: 'failed', message: outcome.message });
    });
  };

  if (state.kind === 'blocked') {
    return (
      <span className="inline-flex flex-col gap-1">
        <span className="text-xs opacity-80">Your browser blocked the new tab. Use this link instead (it works for 1 minute).</span>
        {arabic && <span dir="rtl" className="text-xs opacity-80">منع المتصفح علامة التبويب الجديدة. استخدم هذا الرابط بدلاً منها (يعمل لمدة دقيقة واحدة).</span>}
        <a
          href={state.url}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass}
          onClick={() => {
            reportNewTabOpened(feature, bearer);
            setState({ kind: 'opened' });
          }}
        >
          Open ENARA in a new tab{arabic ? ' · افتح ENARA في علامة تبويب جديدة' : ''}
        </a>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" onClick={open} disabled={state.kind === 'opening'} className={buttonClass}>
        {state.kind === 'opening' ? 'Opening…' : label}
      </button>
      {state.kind === 'opened' && <span className="text-xs opacity-80">Opened in a new tab. Continue there.{arabic ? ' · تم الفتح في علامة تبويب جديدة. تابع هناك.' : ''}</span>}
      {state.kind === 'failed' && <span role="alert" className="text-xs text-rose-600">{state.message}</span>}
    </span>
  );
};
