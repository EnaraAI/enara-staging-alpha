import React, { useState } from 'react';
import { parentsApi } from '../api';
import { Icon, useP } from '../ui';
import { formatCodeInput } from '../codeFormat';

// Enter a school-issued parent link code -> minimal preview -> confirm.
// The parent types the code (it is never read from a URL: P0 item 4, D15).
export const LinkChild: React.FC<{ onLinked: (studentId: string) => void; onCancel?: () => void; another?: boolean }> = ({ onLinked, onCancel, another }) => {
  const { t } = useP();
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<{ learner: string; school: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const fail = (e: any) => setError(e?.code === 'PARENT_SCHOOL_ACCESS_OFF' ? t.codeSchoolOff : e?.status === 429 ? t.codeLocked : t.codeInvalid);
  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!code.trim()) { setError(t.codeInvalid); return; }
    setBusy(true);
    try { setPreview(await parentsApi.previewCode(code)); } catch (err) { fail(err); } finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await parentsApi.confirmCode(code);
      setDone(preview?.learner ?? '');
      setTimeout(() => onLinked(r.studentId), 900);
    } catch (err) { fail(err); setPreview(null); } finally { setBusy(false); }
  };

  return (
    <>
      <h1 className="pp-h1">{another ? t.addAnotherChild : t.linkTitle}</h1>
      {!preview && !done && (
        <form className="pp-card" onSubmit={check} noValidate>
          <p style={{ fontSize: 14 }}>{another ? t.addAnotherBody : t.linkBody}</p>
          <div className="pp-input">
            <label htmlFor="pp-code">{t.codeLabel}</label>
            <input id="pp-code" dir="ltr" inputMode="text" autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} maxLength={24} placeholder={t.codePh}
              value={code} onChange={(e) => { setCode(formatCodeInput(e.target.value)); setError(null); }} aria-invalid={!!error} aria-describedby={error ? 'pp-code-err' : 'pp-code-help'} />
            <p className="pp-sub" id="pp-code-help">{t.whatYouSee}</p>
          </div>
          {/* Owner decision d): the secret-code warning on the code entry page. */}
          <p className="pp-notice" role="note" data-testid="secret-code-warning" style={{ display: 'block', fontSize: 13, background: '#fff7e6', color: '#5c3d00' }}>{t.secretCode}</p>
          {error && <p className="pp-error" id="pp-code-err" role="alert"><Icon name="alert" />{error}</p>}
          <button type="submit" className="pp-btn pp-btn--primary pp-btn--block" disabled={busy}>{busy ? t.loading : t.check}</button>
          {onCancel && <button type="button" className="pp-btn pp-btn--block" onClick={onCancel}>{t.cancel}</button>}
        </form>
      )}
      {preview && !done && (
        <section className="pp-card" aria-labelledby="pp-preview">
          <h2 className="pp-h2" id="pp-preview">{t.previewTitle}</h2>
          <div className="pp-person">
            <span className="pp-avatar" style={{ background: '#f59f0a', color: '#08172b' }} aria-hidden="true">{preview.learner.charAt(0)}</span>
            <div className="pp-person-text"><b dir="auto">{preview.learner}</b>{preview.school && <small dir="auto">{t.previewSchool(preview.school)}</small>}</div>
          </div>
          <p className="pp-sub">{t.whatYouSee}</p>
          {error && <p className="pp-error" role="alert">{error}</p>}
          <button type="button" className="pp-btn pp-btn--primary pp-btn--block" onClick={confirm} disabled={busy}><Icon name="link" />{t.confirm}</button>
          <button type="button" className="pp-btn pp-btn--block" onClick={() => setPreview(null)} disabled={busy}>{t.cancel}</button>
        </section>
      )}
      {done !== null && <p className="pp-success" role="status"><Icon name="check" />{t.linked(done)}</p>}
    </>
  );
};
