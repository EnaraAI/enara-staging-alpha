import React, { useEffect, useState } from 'react';
import { fetchStudentTeachingImpact } from '../services/apiService';

// P21: the student's own progress on each learning objective from their assessed
// work, and what happened after the tutor changed how it taught. Scores come from
// assessments only (never from tutor chat). Plain language; no rankings.

const pct = (x: number | null | undefined) => (x == null ? '—' : `${Math.round(x * 100)}%`);

export const MyTeachingProgress: React.FC<{ studentId?: string }> = ({ studentId = 'me' }) => {
  const [data, setData] = useState<any>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    fetchStudentTeachingImpact(studentId).then(setData).catch(() => setHidden(true));
  }, [studentId]);
  if (hidden || !data || (!data.objectiveTrends.length && !data.episodes.length)) return null;
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3" aria-labelledby="my-progress">
      <h2 id="my-progress" className="font-semibold text-slate-900">Your progress on assessed work</h2>
      {data.objectiveTrends.length > 0 && (
        <ul className="space-y-1 text-sm">
          {data.objectiveTrends.map((t: any) => (
            <li key={t.objectiveId} className="text-slate-700">
              <span className="font-medium">{t.objective}</span>:{' '}
              {t.label === 'insufficient_evidence'
                ? 'not enough assessed answers yet to see a trend.'
                : `earlier answers ${pct(t.first?.score)}, recent answers ${pct(t.last?.score)} (${t.n} assessed answers).`}
            </li>
          ))}
        </ul>
      )}
      {data.episodes.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-slate-800">After the tutor changed its approach</h3>
          <ul className="space-y-1 text-sm">
            {data.episodes.slice(0, 5).map((e: any) => (
              <li key={e.id} className="text-slate-700">
                {e.objective} · {e.methodName}:{' '}
                {e.label === 'insufficient_evidence'
                  ? 'take a quick check on this objective to see how it is going.'
                  : `${pct(e.baseline.score)} before, ${pct(e.post.score)} after${e.retention.n ? `, ${pct(e.retention.score)} a while later` : ''}.`}
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">These are your assessment results. Class lessons and your own practice count too, so they are not a measure of the tutor alone.</p>
        </div>
      )}
    </section>
  );
};

export default MyTeachingProgress;
