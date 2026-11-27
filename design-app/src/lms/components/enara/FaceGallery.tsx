import React, { useMemo, useState } from 'react';
import { Check, Loader2, Search, X } from 'lucide-react';
import type { TutorFaceChoice } from '../../services/apiService';

interface FaceGalleryProps {
  title: string;
  subtitle?: string;
  faces: TutorFaceChoice[];
  // 'single': clicking a face picks it. 'multi': clicking ticks faces, then Save.
  mode?: 'single' | 'multi';
  selectedIds: string[];
  busyId?: string | null;
  onPick?: (face: TutorFaceChoice) => void;
  onSave?: (ids: string[]) => void;
  onClose: () => void;
  // Optional link next to the filters, e.g. "Use school default instead".
  extraAction?: { label: string; onClick: () => void };
  dark?: boolean;
}

// A searchable grid of tutor faces, used by admins and students.
export const FaceGallery: React.FC<FaceGalleryProps> = ({
  title,
  subtitle,
  faces,
  mode = 'single',
  selectedIds,
  busyId = null,
  onPick,
  onSave,
  onClose,
  extraAction,
}) => {
  const [query, setQuery] = useState('');
  const [gender, setGender] = useState<'all' | 'woman' | 'man'>('all');
  const [ticked, setTicked] = useState<Set<string>>(new Set(selectedIds));

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return faces.filter(a =>
      (gender === 'all' || a.gender === gender) &&
      (!q || `${a.name} ${a.variant || ''} ${a.description || ''}`.toLowerCase().includes(q)),
    );
  }, [faces, query, gender]);

  const click = (face: TutorFaceChoice) => {
    if (mode === 'single') return onPick?.(face);
    setTicked(prev => {
      const next = new Set(prev);
      if (next.has(face.id)) next.delete(face.id);
      else next.add(face.id);
      return next;
    });
  };

  const isOn = (id: string) => (mode === 'multi' ? ticked.has(id) : selectedIds.includes(id));

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" aria-labelledby="face-gallery-title">
      <div className="w-full max-w-5xl bg-white rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="face-gallery-title" className="m-0 text-lg font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="m-0 text-sm text-slate-600">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-md text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <label htmlFor="face-search" className="sr-only">Search faces</label>
          <div className="relative flex-1 min-w-[180px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              id="face-search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name or look"
              className="w-full h-10 pl-9 pr-3 rounded-md border border-slate-300 text-slate-900"
            />
          </div>
          <div className="flex gap-1" role="group" aria-label="Filter faces">
            {(['all', 'woman', 'man'] as const).map(g => (
              <button
                key={g}
                onClick={() => setGender(g)}
                aria-pressed={gender === g}
                className={`px-3 h-9 rounded-full text-sm font-semibold border ${gender === g ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-300 text-slate-700'}`}
              >
                {g === 'all' ? 'All' : g === 'woman' ? 'Women' : 'Men'}
              </button>
            ))}
          </div>
          {extraAction && (
            <button onClick={extraAction.onClick} disabled={busyId !== null} className="text-sm font-semibold text-teal-700 hover:underline disabled:opacity-50">
              {extraAction.label}
            </button>
          )}
        </div>

        <div className="p-6 overflow-y-auto">
          {shown.length === 0 ? (
            <p className="m-0 text-sm text-slate-600">No faces match.</p>
          ) : (
            <ul className="m-0 p-0 list-none grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {shown.map(a => {
                const on = isOn(a.id);
                return (
                  <li key={a.id}>
                    <button
                      onClick={() => click(a)}
                      disabled={busyId !== null}
                      aria-pressed={on}
                      className={`w-full text-left rounded-lg border overflow-hidden hover:border-teal-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 disabled:opacity-60 ${on ? 'border-teal-600 ring-2 ring-teal-600' : 'border-slate-200'}`}
                    >
                      <div className="relative aspect-[4/5] bg-slate-100">
                        {a.imageUrl && <img src={a.imageUrl} alt="" loading="lazy" className="w-full h-full object-cover" />}
                        {on && (
                          <span className="absolute top-2 right-2 w-7 h-7 rounded-full bg-teal-600 text-white grid place-items-center">
                            <Check size={16} aria-hidden="true" />
                          </span>
                        )}
                        {busyId === a.id && (
                          <span className="absolute inset-0 bg-white/60 grid place-items-center">
                            <Loader2 size={20} className="animate-spin text-teal-700" aria-label="Saving" />
                          </span>
                        )}
                      </div>
                      <div className="px-3 py-2">
                        <p className="m-0 font-bold text-slate-900 text-sm">{a.name}</p>
                        <p className="m-0 text-xs text-slate-600">
                          {[a.variant, a.gender === 'woman' ? "Woman's voice" : a.gender === 'man' ? "Man's voice" : null].filter(Boolean).join(' · ') || ' '}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {mode === 'multi' && (
          <div className="px-6 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-slate-600">
              {ticked.size === 0 ? 'None ticked: students can pick any face.' : `${ticked.size} face${ticked.size === 1 ? '' : 's'} ticked`}
            </span>
            <div className="flex gap-2">
              {ticked.size > 0 && (
                <button onClick={() => setTicked(new Set())} className="border border-slate-300 bg-white text-slate-700 rounded-md px-4 h-10 font-semibold">
                  Clear
                </button>
              )}
              <button
                onClick={() => onSave?.([...ticked])}
                disabled={busyId !== null}
                className="bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-md px-4 h-10 disabled:opacity-50"
              >
                Save list
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
