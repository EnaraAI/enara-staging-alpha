import React, { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import { fetchRequestUsage, fetchTodayUsage, type UsageCredits } from '../services/apiService';

// P5 usage chip: customer-facing credits (from the school's ENARA plan) or an
// honest state. Never a currency amount, never ENARA's provider cost, and
// never "0" or "free" for usage that is unknown.

function creditsText(c: UsageCredits | undefined, unknownOps = 0) {
  if (!c || c.status === 'not_configured') return 'credits not configured';
  if (c.status === 'partial') return `≥ ${c.value} credits · ${c.unknownOperations ?? unknownOps} usage unknown`;
  return `${c.value} credits`;
}

export function UsageChip({ requestId, features, label }: { requestId?: string | null; features?: string[]; label?: string }) {
  const [text, setText] = useState<string>('measuring…');
  const key = requestId ?? features?.join(',') ?? '';
  useEffect(() => {
    if (!key) return;
    let live = true;
    setText('measuring…');
    const load = requestId
      ? fetchRequestUsage(requestId).then((r) => (r.state === 'none' ? 'not available' : `${r.operations} AI operation${r.operations === 1 ? '' : 's'} · ${creditsText(r.credits)}${r.unpriced ? ' · unpriced' : ''}${r.usageUnknown ? ' · usage unknown' : ''}`))
      : fetchTodayUsage(features!).then((r) => (r.operations ? `Today: ${r.operations} AI operation${r.operations === 1 ? '' : 's'} · ${creditsText(r.credits)}${r.unpriced ? ' · unpriced' : ''}${r.usageUnknown ? ' · usage unknown' : ''}` : 'Today: no AI usage yet'));
    load.then((t) => live && setText(t)).catch(() => live && setText('not available'));
    return () => { live = false; };
  }, [key]);
  if (!key) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5" title="Usage in your school's credits. Unknown usage is never shown as zero.">
      <Gauge className="w-3 h-3" aria-hidden="true" />{label ? `${label}: ` : ''}{text}
    </span>
  );
}
