import React from 'react';
import { apiRequest } from '../../services/apiService';
import { useP } from '../ui';

// Learner memory for parents: the child's "errors to work on" (plain words) and up to 5 interests the tutor may use in examples.
// Each part is hidden while its switch is off (the API answers 404).
const L = (id: string) => `/api/parents/learners/${encodeURIComponent(id)}`;
type Err = { objective: string | null; error: string; status: 'open' | 'waiting' | 'resolved' };
const WORDS = {
  en: { errors: 'Points to practise', errorsSub: 'From released tests. The tutor practises them with new exercises.', open: 'Practising', waiting: 'Waiting for results', resolved: 'Done', interests: 'Interests', interestsSub: 'The tutor may use these in examples (up to 5).', save: 'Save', saved: 'Saved' },
  ar: { errors: 'نقاط للتدريب', errorsSub: 'من الاختبارات التي صدرت نتائجها. يتدرّب عليها المعلّم الذكي بتمارين جديدة.', open: 'قيد التدريب', waiting: 'بانتظار النتائج', resolved: 'تم', interests: 'الاهتمامات', interestsSub: 'قد يستخدمها المعلّم الذكي في الأمثلة (حتى ٥).', save: 'حفظ', saved: 'تم الحفظ' },
};
export const MemoryCard: React.FC<{ studentId: string; canEdit: boolean }> = ({ studentId, canEdit }) => {
  const { lang } = useP();
  const w = WORDS[lang === 'ar' ? 'ar' : 'en'];
  const [errors, setErrors] = React.useState<Err[] | null>(null);
  const [interests, setInterests] = React.useState<{ chosen: string[]; options: string[] } | null>(null);
  const [saved, setSaved] = React.useState(false);
  React.useEffect(() => {
    apiRequest<{ errors: Err[] }>('GET', `${L(studentId)}/errors-to-work-on`).then((r) => setErrors(r.errors)).catch(() => setErrors(null));
    apiRequest<{ interests: string[]; options: string[] }>('GET', `${L(studentId)}/interests`).then((r) => setInterests({ chosen: r.interests, options: r.options })).catch(() => setInterests(null));
  }, [studentId]);
  const toggle = (x: string) => { if (!interests) return; setSaved(false); const has = interests.chosen.includes(x); if (!has && interests.chosen.length >= 5) return; setInterests({ ...interests, chosen: has ? interests.chosen.filter((y) => y !== x) : [...interests.chosen, x] }); };
  const save = () => { if (interests) apiRequest('PUT', `${L(studentId)}/interests`, { interests: interests.chosen }).then(() => setSaved(true)).catch(() => setSaved(false)); };
  return (
    <>
      {errors && errors.length > 0 && (
        <section className="pp-card" aria-labelledby="pp-errors" data-testid="pp-errors-to-work-on">
          <h2 className="pp-h2" id="pp-errors">{w.errors}</h2>
          <p className="pp-sub">{w.errorsSub}</p>
          {errors.map((e, i) => (
            <div className="pp-row" key={i}>
              <div style={{ flexGrow: 1, minInlineSize: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, lineHeight: '20px' }} dir="auto">{e.objective ?? ''}</p>
                <p className="pp-sub" dir="auto">{e.error}</p>
              </div>
              <span className={`pp-tag ${e.status === 'resolved' ? 'pp-tag--ok' : e.status === 'waiting' ? 'pp-tag--sky' : 'pp-tag--warn'}`}>{w[e.status]}</span>
            </div>
          ))}
        </section>
      )}
      {interests && (
        <section className="pp-card" aria-labelledby="pp-interests" data-testid="pp-interests">
          <h2 className="pp-h2" id="pp-interests">{w.interests}</h2>
          <p className="pp-sub">{w.interestsSub}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {interests.options.map((x) => (
              <button key={x} type="button" disabled={!canEdit} aria-pressed={interests.chosen.includes(x)} onClick={() => toggle(x)}
                className={`pp-tag ${interests.chosen.includes(x) ? 'pp-tag--ok' : ''}`}>{x}</button>
            ))}
          </div>
          {canEdit && <div className="pp-row" style={{ marginBlockStart: 8 }}><button type="button" className="pp-btn" onClick={save}>{saved ? w.saved : w.save}</button></div>}
        </section>
      )}
    </>
  );
};
