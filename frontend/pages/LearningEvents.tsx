import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { fetchSchoolEvents, fetchStudents, type LearningEventRecord } from '../services/apiService';

// Admin explorer for the learning event log: what students did, when, and
// whether each record is verified evidence (checked by the server) or not
// (AI output, or reported by the browser).

const TYPE_LABELS: Record<string, string> = {
  lesson_viewed: 'Viewed lesson',
  lesson_completed: 'Completed lesson',
  assessment_started: 'Started assessment',
  question_answered: 'Answered question',
  assessment_submitted: 'Submitted assessment',
  review_answered: 'Answered review',
  tutor_question: 'Asked tutor',
  tutor_reply: 'Tutor replied',
};

const SOURCE_LABELS: Record<string, string> = {
  lesson: 'Lesson',
  assessment: 'Assessment',
  review: 'Review',
  tutor_chat: 'Tutor chat',
  tutor_voice: 'Live call',
  client: 'Browser',
};

const formatDuration = (ms?: number) => {
  if (!ms) return '';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

function outcomeText(e: LearningEventRecord) {
  if (e.outcome?.correct === true) return 'Correct';
  if (e.outcome?.correct === false) return 'Incorrect';
  if (typeof e.outcome?.score === 'number') return `Score ${e.outcome.score}%`;
  return '';
}

export const LearningEvents: React.FC = () => {
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [filters, setFilters] = useState({ studentId: '', type: '', source: '', verified: '', from: '', to: '' });
  const [events, setEvents] = useState<LearningEventRecord[]>([]);
  const [counts, setCounts] = useState<Record<string, { total: number; verified: number }>>({});
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStudents()
      .then((list) => setStudents((list || []).map((s: any) => ({ id: s.id, name: s.name }))))
      .catch(() => setStudents([]));
  }, []);

  const studentName = (id: string) => students.find((s) => s.id === id)?.name || id;

  const load = async (append = false) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchSchoolEvents({
        ...filters,
        from: filters.from ? new Date(filters.from).toISOString() : undefined,
        to: filters.to ? new Date(`${filters.to}T23:59:59`).toISOString() : undefined,
        before: append && nextBefore ? nextBefore : undefined,
        limit: '100',
      });
      setEvents((prev) => (append ? [...prev, ...result.events] : result.events));
      setNextBefore(result.nextBefore);
      if (!append) setCounts(result.counts || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load events.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filters]);

  const set = (key: keyof typeof filters) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) =>
    setFilters((f) => ({ ...f, [key]: e.target.value }));

  const select = 'h-10 px-3 rounded-md border border-slate-300 bg-white text-sm';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-teal-700">Evidence</p>
        <h1 className="text-3xl font-extrabold text-slate-900">Learning events</h1>
        <p className="text-slate-600 mt-1 max-w-3xl">
          Every recorded learning action. <strong>Verified</strong> means the server observed it or checked the answer against the key.
          Tutor replies (AI) and browser-reported time are kept, but never count as verified evidence.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {Object.entries(TYPE_LABELS).map(([type, label]) => (
          <button
            key={type}
            onClick={() => setFilters((f) => ({ ...f, type: f.type === type ? '' : type }))}
            aria-pressed={filters.type === type}
            className={`text-left rounded-lg border p-3 ${filters.type === type ? 'border-teal-600 bg-teal-50' : 'border-slate-200 bg-white'}`}
          >
            <p className="m-0 text-xs text-slate-600">{label}</p>
            <p className="m-0 text-xl font-extrabold text-slate-900">{counts[type]?.total ?? 0}</p>
            <p className="m-0 text-[11px] text-slate-500">{counts[type]?.verified ?? 0} verified</p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-xl p-4">
        <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
          Student
          <select value={filters.studentId} onChange={set('studentId')} className={`${select} min-w-[180px]`}>
            <option value="">All students</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
          Type
          <select value={filters.type} onChange={set('type')} className={select}>
            <option value="">All types</option>
            {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
          Source
          <select value={filters.source} onChange={set('source')} className={select}>
            <option value="">All sources</option>
            {Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
          Evidence
          <select value={filters.verified} onChange={set('verified')} className={select}>
            <option value="">All</option>
            <option value="true">Verified only</option>
            <option value="false">Unverified only</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
          From
          <input type="date" value={filters.from} onChange={set('from')} className={select} />
        </label>
        <label className="text-xs font-semibold text-slate-700 flex flex-col gap-1">
          To
          <input type="date" value={filters.to} onChange={set('to')} className={select} />
        </label>
        <button onClick={() => load()} className="h-10 px-3 rounded-md border border-slate-300 bg-white text-sm font-semibold inline-flex items-center gap-2">
          <RefreshCw size={14} aria-hidden="true" /> Refresh
        </button>
      </div>

      {error && <p className="text-sm text-rose-700">{error}</p>}

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold">When</th>
              <th className="px-4 py-3 font-semibold">Student</th>
              <th className="px-4 py-3 font-semibold">Event</th>
              <th className="px-4 py-3 font-semibold">Topic</th>
              <th className="px-4 py-3 font-semibold">Outcome</th>
              <th className="px-4 py-3 font-semibold">Source</th>
              <th className="px-4 py-3 font-semibold">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-t border-slate-100">
                <td className="px-4 py-2.5 whitespace-nowrap text-slate-700">{new Date(e.at).toLocaleString()}</td>
                <td className="px-4 py-2.5 text-slate-900">{studentName(e.studentId)}</td>
                <td className="px-4 py-2.5">
                  {TYPE_LABELS[e.type] || e.type}
                  {e.durationMs ? <span className="text-slate-500"> · {formatDuration(e.durationMs)}</span> : null}
                </td>
                <td className="px-4 py-2.5 text-slate-700">{e.topic || '—'}</td>
                <td className="px-4 py-2.5 text-slate-700">{outcomeText(e) || '—'}</td>
                <td className="px-4 py-2.5 text-slate-700">{SOURCE_LABELS[e.source] || e.source}</td>
                <td className="px-4 py-2.5">
                  {e.verified ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                      <CheckCircle2 size={14} aria-hidden="true" /> Verified{e.gradedBy === 'rule' ? ' (answer key)' : ''}
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-slate-500">{e.type === 'tutor_reply' ? 'AI output' : 'Unverified'}</span>
                  )}
                </td>
              </tr>
            ))}
            {!loading && events.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">No events match these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-center">
        {loading ? (
          <Loader2 className="animate-spin text-teal-700" aria-label="Loading" />
        ) : (
          nextBefore && (
            <button onClick={() => load(true)} className="h-10 px-4 rounded-md border border-slate-300 bg-white text-sm font-semibold">
              Load older events
            </button>
          )
        )}
      </div>
    </div>
  );
};
