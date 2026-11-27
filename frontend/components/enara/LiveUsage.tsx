import React, { useCallback, useEffect, useState } from 'react';
import { fetchMyLiveUsage, type LiveUsage } from '../../services/apiService';

// liveTimeUsed: the learner's live tutor calls today (GET /api/me/tutor/live-usage). With the switch off the
// server answers 404, usage stays null and nothing here renders: the screens look as before.

export function useLiveUsage(enabled: boolean): { usage: LiveUsage | null; reload: () => void } {
  const [usage, setUsage] = useState<LiveUsage | null>(null);
  const reload = useCallback(() => {
    if (!enabled) return;
    void fetchMyLiveUsage().then(setUsage);
  }, [enabled]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { usage, reload };
}

export const noCallsLeft = (usage: LiveUsage | null | undefined): boolean => !!usage && usage.callsLeftToday <= 0;

export const NO_CALLS_LEFT = { en: 'No live calls left today', ar: 'لم تتبقَّ لك مكالمات مباشرة اليوم' };

/** m:ss */
export const clock = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function liveUsageText(usage: LiveUsage, lang: 'en' | 'ar'): string {
  const max = usage.maxCallSeconds ? Math.round(usage.maxCallSeconds / 60) : null;
  if (lang === 'ar') {
    const parts = [
      usage.callsLeftToday <= 0 ? NO_CALLS_LEFT.ar : `المكالمات المباشرة المتبقية اليوم: ${usage.callsLeftToday}`,
      `الدقائق المستخدمة اليوم: ${usage.minutesUsedToday}`,
      ...(max ? [`الحد الأقصى للمكالمة: ${max} دقيقة`] : []),
    ];
    return parts.join(' · ');
  }
  const left = usage.callsLeftToday;
  const parts = [
    left <= 0 ? NO_CALLS_LEFT.en : `${left} live ${left === 1 ? 'call' : 'calls'} left today`,
    `${usage.minutesUsedToday} min used today`,
    ...(max ? [`up to ${max} min per call`] : []),
  ];
  return parts.join(' · ');
}

/** One line for the screens where a live call starts. lang 'both': English, then Arabic. */
export const LiveUsageLine: React.FC<{ usage: LiveUsage | null; lang?: 'en' | 'ar' | 'both'; className?: string }> = ({ usage, lang = 'both', className = '' }) => {
  if (!usage) return null;
  const warn = noCallsLeft(usage);
  return (
    <p data-testid="live-usage" data-calls-left={usage.callsLeftToday} role="status" className={`m-0 text-xs ${warn ? 'font-bold' : ''} ${className}`}>
      {lang !== 'ar' && <span>{liveUsageText(usage, 'en')}</span>}
      {lang === 'both' && <br />}
      {lang !== 'en' && <span lang="ar" dir="rtl">{liveUsageText(usage, 'ar')}</span>}
    </p>
  );
};
