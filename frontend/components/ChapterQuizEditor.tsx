import React from 'react';
import { Check, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import type { ChapterQuizQuestion } from '../types';

// The practice quiz at the end of a lesson ("Check what you learned").
// Students see the right answers after checking, so it is never graded.
export const MAX_QUIZ_QUESTIONS = 10;
export const MAX_QUIZ_OPTIONS = 6;

const blankQuestion = (): ChapterQuizQuestion => ({ text: '', options: ['', ''], correctAnswer: -1, explanation: '' });

// What the backend would refuse, in words a teacher can act on. Empty when the quiz can be saved.
export function quizProblems(questions: ChapterQuizQuestion[]): string[] {
  const out: string[] = [];
  if (questions.length > MAX_QUIZ_QUESTIONS) out.push(`A lesson quiz has at most ${MAX_QUIZ_QUESTIONS} questions.`);
  questions.forEach((q, i) => {
    const n = `Question ${i + 1}`;
    if (!q.text.trim()) out.push(`${n}: write the question.`);
    if (q.options.length < 2) out.push(`${n}: add at least 2 options.`);
    if (q.options.some(o => !o.trim())) out.push(`${n}: fill in every option, or remove the empty ones.`);
    if (!(q.correctAnswer >= 0 && q.correctAnswer < q.options.length)) out.push(`${n}: mark the right answer.`);
  });
  return out;
}

// The quiz as the backend stores it, for saving and for spotting changes.
export function normalizeQuiz(questions: ChapterQuizQuestion[] | undefined): ChapterQuizQuestion[] {
  return (questions || []).map(q => ({
    ...(q.id ? { id: q.id } : {}),
    text: q.text.trim(),
    options: q.options.map(o => o.trim()),
    correctAnswer: q.correctAnswer,
    explanation: (q.explanation || '').trim(),
  }));
}
export const quizFingerprint = (questions: ChapterQuizQuestion[] | undefined) =>
  JSON.stringify(normalizeQuiz(questions).map(({ id: _id, ...q }) => q));

export const ChapterQuizEditor: React.FC<{
  questions: ChapterQuizQuestion[];
  onChange: (questions: ChapterQuizQuestion[]) => void;
  // Drafts a quiz from the saved chapter with AI; absent when that is not possible yet.
  onGenerate?: () => Promise<ChapterQuizQuestion[]>;
  generateHint?: string;
}> = ({ questions, onChange, onGenerate, generateHint }) => {
  const [generating, setGenerating] = React.useState(false);
  const generate = async () => {
    if (!onGenerate) return;
    if (questions.length && !window.confirm('Replace the questions here with a new AI draft?')) return;
    setGenerating(true);
    try { onChange(await onGenerate()); } finally { setGenerating(false); }
  };
  const set = (i: number, patch: Partial<ChapterQuizQuestion>) => onChange(questions.map((q, k) => (k === i ? { ...q, ...patch } : q)));
  const removeOption = (i: number, o: number) => {
    const q = questions[i];
    const correctAnswer = q.correctAnswer === o ? -1 : q.correctAnswer > o ? q.correctAnswer - 1 : q.correctAnswer;
    set(i, { options: q.options.filter((_, k) => k !== o), correctAnswer });
  };
  const problems = quizProblems(questions);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-slate-500">Lesson quiz (practice)</p>
          <p className="text-[11px] text-slate-500">Students answer at the end of the lesson and see the right answers after checking. Up to {MAX_QUIZ_QUESTIONS} questions.</p>
        </div>
        {questions.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="text-xs font-semibold text-slate-500 hover:text-red-600 shrink-0">
            Remove quiz
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={!onGenerate || generating}
          className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        >
          {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {generating ? 'Writing questions…' : questions.length ? 'Generate again from chapter' : 'Generate from chapter'}
        </button>
        <span className="text-[11px] text-slate-500">{generateHint || 'AI writes a draft from this chapter’s description and documents. Check it, then save.'}</span>
      </div>

      {questions.map((q, i) => (
        <div key={i} className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-2" data-testid="quiz-question">
          <div className="flex items-start gap-2">
            <span className="mt-2 text-xs font-bold text-slate-500 w-5 shrink-0">{i + 1}.</span>
            <input
              value={q.text}
              onChange={e => set(i, { text: e.target.value })}
              maxLength={500}
              placeholder="Question, e.g. What comes after 30 when counting in tens?"
              aria-label={`Question ${i + 1}`}
              className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-md text-xs focus:ring-2 focus:ring-teal-500/20"
            />
            <button type="button" onClick={() => onChange(questions.filter((_, k) => k !== i))} className="p-2 text-slate-400 hover:text-red-600" aria-label={`Remove question ${i + 1}`}>
              <Trash2 size={14} />
            </button>
          </div>

          <div className="pl-7 space-y-1.5" role="radiogroup" aria-label={`Options for question ${i + 1}; choose the right answer`}>
            {q.options.map((opt, o) => {
              const right = q.correctAnswer === o;
              return (
                <div key={o} className="flex items-center gap-2">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={right}
                    aria-label={`Option ${o + 1} is the right answer`}
                    onClick={() => set(i, { correctAnswer: o })}
                    className={`w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center ${right ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 bg-white hover:border-emerald-500'}`}
                  >
                    {right && <Check size={12} />}
                  </button>
                  <input
                    value={opt}
                    onChange={e => set(i, { options: q.options.map((x, k) => (k === o ? e.target.value : x)) })}
                    maxLength={200}
                    placeholder={`Option ${o + 1}`}
                    aria-label={`Question ${i + 1}, option ${o + 1}`}
                    className={`flex-1 px-3 py-1.5 bg-white border rounded-md text-xs focus:ring-2 focus:ring-teal-500/20 ${right ? 'border-emerald-400' : 'border-slate-300'}`}
                  />
                  {q.options.length > 2 && (
                    <button type="button" onClick={() => removeOption(i, o)} className="p-1 text-slate-400 hover:text-red-600" aria-label={`Remove option ${o + 1}`}>
                      <X size={12} />
                    </button>
                  )}
                </div>
              );
            })}
            <div className="flex items-center justify-between">
              {q.options.length < MAX_QUIZ_OPTIONS ? (
                <button type="button" onClick={() => set(i, { options: [...q.options, ''] })} className="text-xs font-semibold text-teal-700 hover:text-teal-800 flex items-center gap-1">
                  <Plus size={12} /> Add option
                </button>
              ) : <span />}
              <span className={`text-[11px] ${q.correctAnswer >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                {q.correctAnswer >= 0 ? `Right answer: option ${q.correctAnswer + 1}` : 'Click the circle next to the right answer'}
              </span>
            </div>
            <input
              value={q.explanation || ''}
              onChange={e => set(i, { explanation: e.target.value })}
              maxLength={500}
              placeholder="Why it's right (optional), e.g. 30 + 10 = 40."
              aria-label={`Explanation for question ${i + 1}`}
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
        </div>
      ))}

      {questions.length < MAX_QUIZ_QUESTIONS && (
        <button
          type="button"
          onClick={() => onChange([...questions, blankQuestion()])}
          className="px-3 py-1.5 bg-teal-50 text-teal-700 text-xs font-bold rounded-lg border border-teal-100 hover:bg-teal-100 flex items-center gap-1"
        >
          <Plus size={12} /> {questions.length ? 'Add question' : 'Add a quiz question'}
        </button>
      )}

      {problems.length > 0 && (
        <ul className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2 space-y-0.5" aria-live="polite">
          {problems.map(p => <li key={p}>{p}</li>)}
        </ul>
      )}
    </div>
  );
};
