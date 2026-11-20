import React from 'react';
import { Brain } from 'lucide-react';
import {
  fetchMemoryProfile, fetchSessionSummaries, fetchStudyHabits, fetchWhatWorks, updateMemoryProfile,
  type LearnerProfileView, type SessionSummaryView, type StudyHabitsView, type WhatWorksView,
} from '../services/apiService';
import { toast } from '../services/toastService';

// Learner memory phases 2-4 for teachers and school admins: recent sessions, profile (first language and accommodations: school admins edit),
// study habits, and what has worked. Each section is hidden while its switch is off (404) or empty.
const NEXT: Record<string, string> = { reteach: 'Reteach the point', finish_item: 'Finish the open exercise', next_point: 'Next point' };
const ACC: Record<string, string> = { extra_time: 'Extra time', typed_instead_of_voice: 'Typed instead of voice', read_aloud: 'Read aloud', fewer_items: 'Fewer items', larger_text: 'Larger text' };
const LANG: Record<string, string> = { ar: 'Arabic', en: 'English', fr: 'French', ur: 'Urdu', hi: 'Hindi', tl: 'Tagalog', bn: 'Bengali', fa: 'Persian', tr: 'Turkish', other: 'Other' };
const day = (s: string) => new Date(s).toLocaleDateString();

export const LearnerMemoryPanel: React.FC<{ studentId: string }> = ({ studentId }) => {
  const [sessions, setSessions] = React.useState<SessionSummaryView[] | null>(null);
  const [profile, setProfile] = React.useState<LearnerProfileView | null>(null);
  const [habits, setHabits] = React.useState<StudyHabitsView | null | undefined>(undefined);
  const [works, setWorks] = React.useState<WhatWorksView | null>(null);
  React.useEffect(() => {
    fetchSessionSummaries(studentId).then((r) => setSessions(r.sessions)).catch(() => setSessions(null));
    fetchMemoryProfile(studentId).then(setProfile).catch(() => setProfile(null));
    fetchStudyHabits(studentId).then((r) => setHabits(r.habits)).catch(() => setHabits(undefined));
    fetchWhatWorks(studentId).then(setWorks).catch(() => setWorks(null));
  }, [studentId]);
  if (!sessions?.length && !profile && !habits && !works?.methods.length) return null;
  const save = async (patch: Parameters<typeof updateMemoryProfile>[1]) => {
    try { setProfile(await updateMemoryProfile(studentId, patch)); } catch { toast.error('Not saved', 'Only a school admin can change this.'); }
  };
  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-5" data-testid="learner-memory">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-700"><Brain size={20} /></div>
        <h3 className="font-semibold text-slate-900">Learner memory</h3>
      </div>
      {!!sessions?.length && (
        <section>
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Recent tutor sessions</h4>
          <ul className="divide-y divide-slate-100 text-sm">
            {sessions.slice(0, 5).map((s) => (
              <li key={s.sessionId} className="py-2 flex justify-between gap-3">
                <span className="text-slate-700">{day(s.endedAt)} · {s.right} right, {s.wrong} wrong{s.stuckOn ? ` · stuck on ${s.stuckOn.replace(/_/g, ' ')}` : ''}{s.stoppedWithOpenItem ? ' · stopped mid-exercise' : ''}</span>
                <span className="text-xs text-slate-500 shrink-0">Next: {NEXT[s.nextStep]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {profile && (
        <section className="text-sm space-y-2">
          <h4 className="font-semibold text-slate-700">Profile</h4>
          <label className="flex items-center gap-2">First language
            <select className="border border-slate-200 rounded px-2 py-1" value={profile.firstLanguage ?? ''} onChange={(e) => save({ firstLanguage: e.target.value || null })}>
              <option value="">Not set</option>
              {profile.options.firstLanguages.map((l) => <option key={l} value={l}>{LANG[l] ?? l}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 items-center">Accommodations
            {profile.options.accommodations.map((a) => {
              const on = profile.accommodations.includes(a);
              return <button key={a} type="button" aria-pressed={on} onClick={() => save({ accommodations: on ? profile.accommodations.filter((x) => x !== a) : [...profile.accommodations, a] })}
                className={`text-xs px-2 py-1 rounded-full border ${on ? 'bg-indigo-50 border-indigo-300 text-indigo-800' : 'border-slate-200 text-slate-600'}`}>{ACC[a] ?? a}</button>;
            })}
          </div>
          <p className="text-slate-600">Interests (chosen by the learner or a parent): {profile.interests.length ? profile.interests.join(', ') : 'none yet'}</p>
          <p className="text-xs text-slate-500">The tutor gets only the effect of an accommodation (for example "typed answers are fine"), never the reason.</p>
        </section>
      )}
      {habits && (
        <section className="text-sm">
          <h4 className="font-semibold text-slate-700 mb-1">Study habits (last 30 days)</h4>
          <p className="text-slate-700">{habits.activeDays} active days · {habits.sessions} sessions · about {habits.avgMinutesPerActiveDay} min a day{habits.usualTime ? ` · mostly ${habits.usualTime}` : ''}{habits.daysSinceLast !== null ? ` · last active ${habits.daysSinceLast} days ago` : ''}{habits.longestGapDays >= 7 ? ` · longest break ${habits.longestGapDays} days` : ''}</p>
        </section>
      )}
      {!!works?.methods.length && (
        <section className="text-sm">
          <h4 className="font-semibold text-slate-700 mb-1">What has worked</h4>
          <ul className="text-slate-700">
            {works.methods.slice(0, 5).map((m) => <li key={m.method}>{m.method.replace(/_/g, ' ')}: {m.withIndependentSuccess} of {m.sessions} sessions had a right answer on their own</li>)}
          </ul>
          <p className="text-xs text-slate-500 mt-1">{works.note}</p>
        </section>
      )}
    </div>
  );
};
