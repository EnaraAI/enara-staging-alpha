import React from 'react';

// Marks data that is sample/seed content or a fixed template, not computed
// from the student's activity or written by the AI for them.
export const SampleBadge: React.FC<{ label?: string; title?: string; dark?: boolean }> = ({
  label = 'Sample data',
  title = 'Example values, not computed from real activity yet.',
  dark = false,
}) => (
  <span
    title={title}
    className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide ${
      dark ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40' : 'bg-amber-100 text-amber-900 border border-amber-200'
    }`}
  >
    {label}
  </span>
);
