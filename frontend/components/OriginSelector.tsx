import React from 'react';
import { getSessionUser } from '../services/apiService';
import { ORIGIN_LABELS, originOptionsFor, OriginView } from '../services/roleRouting';

// Live / Demo (/ All) switch for teacher and class dashboards, with a
// persistent label of the data on screen. Renders only the label when the
// account has no choice to make.
export const OriginSelector: React.FC<{ value: OriginView; onChange: (v: OriginView) => void }> = ({ value, onChange }) => {
  const options = originOptionsFor(getSessionUser()?.role);
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Data shown">
      <span
        className={`text-xs font-semibold px-2 py-1 rounded-full ${value === 'live' ? 'bg-emerald-50 text-emerald-800' : value === 'demo_seed' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700'}`}
        data-testid="origin-label"
      >
        Showing: {ORIGIN_LABELS[value]}
      </span>
      {options.length > 1 && (
        <div role="radiogroup" aria-label="Choose data" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
          {options.map((o) => (
            <button
              key={o}
              role="radio"
              aria-checked={value === o}
              onClick={() => onChange(o)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md ${value === o ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {ORIGIN_LABELS[o]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
