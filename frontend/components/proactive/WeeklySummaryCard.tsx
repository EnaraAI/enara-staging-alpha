import React, { useEffect, useState } from 'react';
import { AlertTriangle, BookOpen, MessageCircle, Sparkles } from 'lucide-react';
import { fetchWeeklySummary, type WeeklySummary } from '../../services/apiService';

// "This week in your school": who needs attention, what to re-teach, and what
// students asked the tutor most. Mondays it is also emailed to staff.
export const WeeklySummaryCard: React.FC = () => {
  const [data, setData] = useState<WeeklySummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchWeeklySummary().then(setData).catch(() => setFailed(true));
  }, []);

  if (failed) return null;

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-5" aria-labelledby="weekly-summary-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="m-0 text-xs font-bold uppercase tracking-wide text-teal-700 flex items-center gap-1">
            <Sparkles size={13} aria-hidden="true" /> Written by your AI tutor
          </p>
          <h2 id="weekly-summary-title" className="m-0 mt-1 text-lg font-bold text-slate-900">This week in your school</h2>
        </div>
        {data && (
          <span className="text-sm text-slate-600">
            {data.totals.activeStudents7d} of {data.totals.students} students active · {data.totals.tutorQuestions7d} tutor questions
          </span>
        )}
      </div>

      {!data ? (
        <div className="space-y-2" aria-label="Loading summary">
          <div className="h-4 bg-slate-100 rounded w-3/4 animate-pulse" />
          <div className="h-4 bg-slate-100 rounded w-1/2 animate-pulse" />
        </div>
      ) : (
        <>
          <p className="m-0 text-slate-800 leading-relaxed" dir="auto">{data.summary}</p>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 p-4">
              <h3 className="m-0 text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <AlertTriangle size={15} className="text-orange-700" aria-hidden="true" /> Need attention
              </h3>
              {data.stuckStudents.length === 0 ? (
                <p className="m-0 mt-2 text-sm text-slate-600">No students at risk this week.</p>
              ) : (
                <ul className="m-0 mt-2 p-0 list-none space-y-1.5">
                  {data.stuckStudents.map(s => (
                    <li key={s.id} className="text-sm">
                      <strong className="text-slate-900">{s.name}</strong>
                      <span className="text-slate-600"> · {s.reasons.join(', ')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <h3 className="m-0 text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <BookOpen size={15} className="text-teal-700" aria-hidden="true" /> Topics to re-teach
              </h3>
              {data.reteachTopics.length === 0 ? (
                <p className="m-0 mt-2 text-sm text-slate-600">No weak quiz topics yet.</p>
              ) : (
                <ul className="m-0 mt-2 p-0 list-none space-y-1.5">
                  {data.reteachTopics.map(t => (
                    <li key={t.topic} className="text-sm flex justify-between gap-2">
                      <span className="text-slate-900">{t.topic}</span>
                      <span className="font-bold text-rose-700">{t.accuracy}% right</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <h3 className="m-0 text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <MessageCircle size={15} className="text-teal-700" aria-hidden="true" /> Asked the tutor most
              </h3>
              {data.questionThemes.length === 0 ? (
                <p className="m-0 mt-2 text-sm text-slate-600">No tutor questions this week.</p>
              ) : (
                <ul className="m-0 mt-2 pl-4 space-y-1.5 text-sm text-slate-800">
                  {data.questionThemes.map(t => <li key={t} dir="auto">{t}</li>)}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
};
