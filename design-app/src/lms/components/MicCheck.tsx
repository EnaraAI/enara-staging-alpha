import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MicOff } from 'lucide-react';
import { isLmsSession, lmsNewTabTarget, reportMicTelemetry, type LmsNewTabTarget } from '../services/apiService';
import { browserFamily, isInFrame, micMessage, micTelemetryEvent, probeMic, quickMicCheck, showSafariFrameHint, type MicFeature, type MicStatus } from '../services/micCheck';
import { OpenInNewTab } from './OpenInNewTab';

// Mic check before it is needed (mic / new tab, items 3 and 4), shared by the
// speaking exam, the AI tutor's voice input and the live avatar.

export type MicProblem = Exclude<MicStatus, 'ok'>;

const ua = () => (typeof navigator === 'undefined' ? '' : navigator.userAgent);

/**
 * check(): the probe on the student's click, run before any voice or avatar
 * SDK starts (once it worked, later clicks skip it). settle(): the outcome of
 * a probe the component ran itself. fail(): a later mic error
 * (the SDK's own) mapped the same way. With showOnLoad, the no-prompt check
 * on load already shows "blocked in the frame" where the browser can tell.
 */
export function useMicGate(feature: MicFeature, opts: { showOnLoad?: boolean } = {}) {
  const [problem, setProblem] = useState<MicProblem | null>(null);
  const okRef = useRef(false);
  const showOnLoad = opts.showOnLoad ?? false;

  useEffect(() => {
    if (!showOnLoad) return;
    let cancelled = false;
    quickMicCheck()
      .then((q) => {
        if (!cancelled && q.likely === 'blocked_in_frame') setProblem((p) => p ?? 'blocked_in_frame');
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [showOnLoad]);

  const report = useCallback((status: MicStatus) => {
    // Counted for LMS sessions and framed pages only (how often the new tab is needed).
    const inFrame = isInFrame();
    if (!inFrame && !isLmsSession()) return;
    reportMicTelemetry({ event: micTelemetryEvent(status), browserFamily: browserFamily(ua()), inFrame, feature });
  }, [feature]);

  /** Records the outcome of a probe this component ran itself (e.g. the speaking exam's level check). */
  const settle = useCallback((status: MicStatus) => {
    report(status);
    okRef.current = status === 'ok';
    setProblem(status === 'ok' ? null : status);
  }, [report]);

  const check = useCallback(async (): Promise<MicStatus> => {
    if (okRef.current) return 'ok';
    const status = await probeMic();
    settle(status);
    return status;
  }, [settle]);

  const fail = useCallback((status: MicProblem) => {
    okRef.current = false;
    setProblem(status);
    report(status);
  }, [report]);

  const clear = useCallback(() => setProblem(null), []);
  return { problem, check, settle, fail, clear };
}

/** The message for a mic problem; "blocked in the frame" offers "Open in a new tab". */
export const MicProblemNotice: React.FC<{
  problem: MicProblem;
  feature: MicFeature;
  /** Where the new tab lands (default: this LMS session's activity). */
  target?: () => LmsNewTabTarget;
  /** Also show the Arabic text (components that already speak Arabic). */
  arabic?: boolean;
  tone?: 'light' | 'dark';
}> = ({ problem, feature, target, arabic = false, tone = 'light' }) => {
  const en = micMessage(problem, 'en');
  const ar = arabic ? micMessage(problem, 'ar') : null;
  const box = tone === 'dark' ? 'bg-white/5 border-white/15 text-slate-200' : 'bg-rose-50 border-rose-200 text-rose-900';
  return (
    <div role="alert" data-testid={`mic-problem-${problem}`} className={`rounded-lg border p-3 text-sm space-y-1.5 text-left ${box}`}>
      <p className="font-semibold flex items-center gap-1.5"><MicOff className="w-4 h-4 shrink-0" aria-hidden="true" /> {en.title}</p>
      <p>{en.body}</p>
      {ar && (
        <div dir="rtl" lang="ar" className="space-y-1 pt-1">
          <p className="font-semibold">{ar.title}</p>
          <p>{ar.body}</p>
        </div>
      )}
      {en.newTab && (
        <OpenInNewTab
          target={target ?? (() => lmsNewTabTarget())}
          feature={feature}
          arabic={arabic}
          label={arabic ? 'Open in a new tab · افتح في علامة تبويب جديدة' : 'Open in a new tab'}
          className={tone === 'dark' ? 'px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold disabled:opacity-60' : 'px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-60'}
        />
      )}
    </div>
  );
};

/** Item 4: Safari inside a frame cannot tell in advance; a small "Open in a new tab" link before the exam starts. */
export const SafariFrameHint: React.FC<{ feature: MicFeature; target?: () => LmsNewTabTarget }> = ({ feature, target }) => {
  if (!showSafariFrameHint(ua(), isInFrame())) return null;
  return (
    <p data-testid="safari-frame-hint" className="text-xs text-slate-600">
      Using Safari inside your LMS? If the microphone does not work here,{' '}
      <OpenInNewTab target={target ?? (() => lmsNewTabTarget())} feature={feature} label="open the exam in a new tab" className="underline font-semibold text-teal-800 disabled:opacity-60" />.
    </p>
  );
};
