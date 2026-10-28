import React, { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, Bot, RotateCw } from 'lucide-react';
import { fetchNextSteps, type NextStep } from '../../services/apiService';
import { QuickReview } from './QuickReview';

interface NextStepsCardProps {
  onAskTutor?: (message: string) => void;
  onOpenCourse: (courseId: string) => void;
}

const ICONS = { review: RotateCw, tutor: Bot, lesson: BookOpen } as const;
const ACTION_LABEL = { review: 'Start review', tutor: 'Practise with tutor', lesson: 'Open lesson' } as const;

// "Your next steps": what the tutor suggests, from the student's own progress,
// quiz results and review questions due.
export const NextStepsCard: React.FC<NextStepsCardProps> = ({ onAskTutor, onOpenCourse }) => {
  const [data, setData] = useState<{ note: string; steps: NextStep[] } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const load = () => fetchNextSteps().then(setData).catch(() => setData(null));
  useEffect(() => { load(); }, []);

  if (!data || data.steps.length === 0) return null;

  const run = (step: NextStep) => {
    if (step.kind === 'review') setReviewOpen(true);
    else if (step.kind === 'tutor') onAskTutor?.(step.prompt);
    else onOpenCourse(step.courseId);
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="next-steps-title">
      <div>
        <h2 id="next-steps-title" className="m-0 text-lg font-bold">Your next steps</h2>
        <p className="m-0 mt-1 text-sm text-slate-600">{data.note}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.steps.map((step, i) => {
          const Icon = ICONS[step.kind];
          const disabled = step.kind === 'tutor' && !onAskTutor;
          return (
            <div key={i} className={`bg-white border rounded-xl p-5 flex flex-col gap-2 ${i === 0 ? 'border-teal-600' : 'border-[#e5e7eb]'}`}>
              <span className="w-9 h-9 rounded-md bg-teal-50 text-teal-700 grid place-items-center" aria-hidden="true"><Icon size={18} /></span>
              <strong className="leading-snug">{step.title}</strong>
              <span className="text-sm text-slate-600 flex-1">{step.detail}</span>
              <button
                onClick={() => run(step)}
                disabled={disabled}
                className="self-start mt-1 inline-flex items-center gap-1 font-bold text-teal-700 hover:text-teal-800 hover:underline disabled:opacity-50"
              >
                {ACTION_LABEL[step.kind]} <ArrowRight size={14} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
      {reviewOpen && (
        <QuickReview
          onClose={() => {
            setReviewOpen(false);
            load();
          }}
        />
      )}
    </section>
  );
};
