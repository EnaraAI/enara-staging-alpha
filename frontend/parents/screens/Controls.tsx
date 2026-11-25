import React, { useEffect, useState } from 'react';
import { parentsApi, type Controls as C, type LearnerChip } from '../api';
import { ErrorBox, Icon, Loading, useP } from '../ui';
import { useLive } from '../useLive';

// Controls (v2 in the spec; built because it is cheap). Settings are saved but
// not enforced by the tutor yet, and the screen says so.
export const Controls: React.FC<{ learner: LearnerChip; refreshKey: number }> = ({ learner, refreshKey }) => {
  const { t, n } = useP();
  const q = useLive(() => parentsApi.controls(learner.studentId), [learner.studentId], refreshKey);
  const [draft, setDraft] = useState<C['controls'] | null>(null);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  useEffect(() => { if (q.data) setDraft(q.data.controls); }, [q.data]);
  if (!q.data || !draft) return q.error ? <ErrorBox onRetry={q.reload} /> : <Loading />;
  const canEdit = learner.role !== 'view';
  const name = learner.firstName;
  const set = (patch: Partial<C['controls']>) => { setDraft({ ...draft, ...patch }); setSaved('idle'); };
  const save = async () => {
    setSaved('saving');
    try { const r = await parentsApi.saveControls(learner.studentId, draft); setDraft(r.controls); setSaved('saved'); } catch { setSaved('error'); }
  };
  const step = (label: string, value: number, unit: string, lo: number, hi: number, onChange: (v: number) => void) => (
    <div className="pp-stepper">
      <button type="button" aria-label={t.decrease(label)} disabled={!canEdit || value <= lo} onClick={() => onChange(Math.max(lo, value - 15))}>−</button>
      <output aria-live="polite"><span>{n(value)}</span> <small>{unit}</small></output>
      <button type="button" aria-label={t.increase(label)} disabled={!canEdit || value >= hi} onClick={() => onChange(Math.min(hi, value + 15))}>+</button>
    </div>
  );

  return (
    <>
      <h1 className="pp-h1">{t.controlsTitle}</h1>
      <p className="pp-notice" style={{ display: 'block' }}><span style={{ fontSize: 13 }}>{t.notEnforced}</span></p>
      {learner.tier !== 'kid' && <p className="pp-notice" style={{ display: 'block' }}><span style={{ fontSize: 13 }}>{t.coSet(name)}</span></p>}
      {!canEdit && <p className="pp-error" role="note">{t.viewOnly}</p>}

      <section className="pp-card" aria-labelledby="pp-goal">
        <div><h2 className="pp-h2" id="pp-goal">{t.weeklyGoalTitle}</h2><p className="pp-sub">{t.weeklyGoalSub}</p></div>
        {step(t.weeklyGoalTitle, draft.weeklyGoalMin, t.minPerWeek, 30, 300, (v) => set({ weeklyGoalMin: v }))}
        <p className="pp-sub">{t.perDay(n(Math.round(draft.weeklyGoalMin / 5)))}</p>
      </section>

      <section className="pp-card" aria-labelledby="pp-screen">
        <h2 className="pp-h2" id="pp-screen">{t.screenTime}</h2>
        <p style={{ fontSize: 14, fontWeight: 500 }}>{t.dailyLimit}</p>
        {step(t.dailyLimit, draft.dailyLimitMin, t.minShort('').trim() || 'min', 15, 120, (v) => set({ dailyLimitMin: v }))}
        <div className="pp-row" style={{ fontSize: 14 }}><span>{t.schoolNights}</span><span className="pp-num">{t.schoolHours}</span></div>
        <div className="pp-row" style={{ fontSize: 14 }}><span>{t.weekend}</span><span className="pp-num">{t.weekendHours}</span></div>
      </section>

      <section className="pp-card" aria-labelledby="pp-focus">
        <h2 className="pp-h2" id="pp-focus">{t.learningFocus}</h2>
        <div className="pp-seg" role="group" aria-labelledby="pp-focus">
          {Object.keys(t.focusOpt).map((f) => (
            <button type="button" key={f} aria-pressed={draft.focus === f} disabled={!canEdit} onClick={() => set({ focus: f })}>{t.focusOpt[f]}</button>
          ))}
        </div>
      </section>

      <section className="pp-card" aria-labelledby="pp-tutor">
        <h2 className="pp-h2" id="pp-tutor">{t.tutorSettings}</h2>
        {(['reminders', 'liveAvatar', 'microphone', 'camera'] as const).map((k) => (
          <div className="pp-toggle-row" key={k}>
            <label htmlFor={`pp-sw-${k}`}>{t.toggles[k][0]}<small>{t.toggles[k][1]}</small></label>
            <button type="button" id={`pp-sw-${k}`} role="switch" className="pp-switch" aria-checked={!!draft[k]} disabled={!canEdit} onClick={() => set({ [k]: !draft[k] })}>
              <span className="pp-switch-track" aria-hidden="true"><span>{draft[k] ? <Icon name="check" style={{ inlineSize: 14, blockSize: 14, color: 'var(--blue)' }} /> : null}</span></span>
            </button>
          </div>
        ))}
      </section>

      <section className="pp-notice" aria-live="polite">
        <Icon name="eye" style={{ color: 'var(--sky)' }} />
        <p>{t.preview(name, n(draft.dailyLimitMin), n(draft.weeklyGoalMin), t.focusOpt[draft.focus])}</p>
      </section>
      {canEdit && (
        <button type="button" className="pp-btn pp-btn--primary pp-btn--block" onClick={save} disabled={saved === 'saving'}>
          {saved === 'saved' ? <><Icon name="check" />{t.saved}</> : t.save}
        </button>
      )}
      {saved === 'error' && <p className="pp-error" role="alert">{t.error}</p>}
    </>
  );
};
