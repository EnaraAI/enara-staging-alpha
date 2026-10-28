import React, { useEffect, useState } from 'react';
import { Check, Loader2, RotateCw, X } from 'lucide-react';
import { answerReview, fetchDueReviews, type ReviewQuestion } from '../../services/apiService';
import { toast } from '../../services/toastService';

interface QuickReviewProps {
  onClose: (answered: number) => void;
}

// Spaced review: questions the student missed before, one at a time.
export const QuickReview: React.FC<QuickReviewProps> = ({ onClose }) => {
  const [items, setItems] = useState<ReviewQuestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ correct: boolean; answer: string; explanation: string; nextInDays: number | null } | null>(null);
  const [rightCount, setRightCount] = useState(0);

  useEffect(() => {
    fetchDueReviews()
      .then(r => setItems(r.items))
      .catch(err => {
        toast.error('Review unavailable', err instanceof Error ? err.message : 'Could not load your review questions.');
        onClose(0);
      });
  }, []);

  const item = items?.[index];
  const done = items !== null && index >= items.length;

  const submit = async (answer: string | number) => {
    if (!item || busy) return;
    setBusy(true);
    try {
      const result = await answerReview(item.id, answer);
      setFeedback(result);
      if (result.correct) setRightCount(n => n + 1);
    } catch (err) {
      toast.error('Could not check your answer', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    setFeedback(null);
    setTyped('');
    setIndex(i => i + 1);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" aria-labelledby="quick-review-title">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="quick-review-title" className="m-0 text-lg font-bold text-slate-900">Quick review</h2>
            {items && !done && <p className="m-0 text-sm text-slate-600">Question {index + 1} of {items.length}{item?.topic ? ` · ${item.topic}` : ''}</p>}
          </div>
          <button onClick={() => onClose(index)} aria-label="Close review" className="p-2 rounded-md text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex flex-col gap-4">
          {items === null && <Loader2 className="animate-spin text-teal-600 self-center" aria-label="Loading" />}

          {done && (
            <div className="text-center flex flex-col gap-2 py-4">
              <p className="m-0 text-3xl font-extrabold text-slate-900">{rightCount}/{items!.length}</p>
              <p className="m-0 text-slate-600">
                {items!.length === 0
                  ? 'Nothing to review right now.'
                  : 'Done for today. Questions you missed come back tomorrow; the ones you got right come back later.'}
              </p>
            </div>
          )}

          {item && !done && (
            <>
              <p className="m-0 text-lg font-semibold text-slate-900" dir="auto">{item.question}</p>
              {item.options ? (
                <div className="flex flex-col gap-2">
                  {item.options.map((opt, i) => (
                    <button
                      key={i}
                      disabled={busy || !!feedback}
                      onClick={() => submit(i)}
                      dir="auto"
                      className="text-left px-4 py-3 rounded-md border border-slate-300 hover:border-teal-600 hover:bg-teal-50 disabled:opacity-70 disabled:hover:bg-white"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <form
                  onSubmit={e => { e.preventDefault(); if (typed.trim()) submit(typed.trim()); }}
                  className="flex gap-2"
                >
                  <label htmlFor="review-answer" className="sr-only">Your answer</label>
                  <input
                    id="review-answer"
                    value={typed}
                    onChange={e => setTyped(e.target.value)}
                    disabled={busy || !!feedback}
                    dir="auto"
                    className="flex-1 h-11 px-3 rounded-md border border-slate-300"
                    placeholder="Your answer"
                  />
                  <button type="submit" disabled={busy || !!feedback || !typed.trim()} className="bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-md px-4 h-11 disabled:opacity-50">
                    Check
                  </button>
                </form>
              )}

              {feedback && (
                <div role="status" className={`rounded-lg p-4 border ${feedback.correct ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}`}>
                  <p className={`m-0 font-bold flex items-center gap-1.5 ${feedback.correct ? 'text-green-800' : 'text-orange-800'}`}>
                    {feedback.correct ? <Check size={16} aria-hidden="true" /> : <RotateCw size={16} aria-hidden="true" />}
                    {feedback.correct
                      ? feedback.nextInDays === null ? 'Right, and you have this one now.' : `Right! It comes back in ${feedback.nextInDays} days.`
                      : 'Not quite. It comes back tomorrow.'}
                  </p>
                  {!feedback.correct && <p className="m-0 mt-1 text-sm text-slate-800" dir="auto">Answer: <strong>{feedback.answer}</strong></p>}
                  {feedback.explanation && <p className="m-0 mt-1 text-sm text-slate-700" dir="auto">{feedback.explanation}</p>}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end">
          {done || items === null ? (
            <button onClick={() => onClose(index)} className="bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-md px-4 h-10">Close</button>
          ) : (
            <button onClick={next} disabled={!feedback} className="bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-md px-4 h-10 disabled:opacity-50">
              {index + 1 < (items?.length || 0) ? 'Next question' : 'Finish'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
