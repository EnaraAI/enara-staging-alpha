import React, { useEffect, useRef, useState } from 'react';
import { cairoDate, schoolApi, type ChatReply, type LearnerChip, type SchoolSection } from '../api';
import { AssistantStar, Icon, useP } from '../ui';

// Parents school app, step (e): the assistant. Answers come only from what the school shares for THIS child (the server builds them
// from the parent's own screens) and show their source and date. It never acts: a request is opened only after the parent taps confirm.
// Redesign step 4: a full-screen chat opened from the assistant row in Messages, with suggestions and a typing indicator.
// It stays mounted while the parent moves around, so the conversation is still there when they come back (until the child changes).
type Msg = { from: 'you' | 'enara'; text: string; reply?: ChatReply; created?: boolean };

export const SchoolChat: React.FC<{ learner: LearnerChip; open: boolean; onClose: () => void; sections?: Partial<Record<SchoolSection, boolean>> }> = ({ learner, open, onClose, sections = {} }) => {
  const { t, lang } = useP();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => { setMsgs([]); }, [learner.studentId]);
  useEffect(() => { if (open) end.current?.scrollIntoView?.({ block: 'end' }); }, [msgs, busy, open]);
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement as HTMLElement | null;
    back.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  const label = (s: string) => t.sch.srcLabel[s] ?? t.sch[s as 'fees'] ?? s;
  const ask = async (raw: string) => {
    const text = raw.trim(); if (!text || busy) return;
    setQ(''); setMsgs((m) => [...m, { from: 'you', text }]); setBusy(true);
    try { const reply = await schoolApi.chat(learner.studentId, text); setMsgs((m) => [...m, { from: 'enara', text: reply.answer, reply }]); }
    catch { setMsgs((m) => [...m, { from: 'enara', text: t.sch.chatError }]); }
    finally { setBusy(false); }
  };
  const confirm = async (i: number) => {
    const offer = msgs[i].reply?.offerRequest; if (!offer) return;
    try { await schoolApi.chatRequest(learner.studentId, offer); setMsgs((m) => m.map((x, j) => (j === i ? { ...x, created: true } : x))); }
    catch { setMsgs((m) => [...m, { from: 'enara', text: t.sch.chatError }]); }
  };
  const suggestions = [
    sections.buses ? t.ui.sugBus : null,
    sections.timetable ? t.ui.sugTomorrow : null,
    sections.fees ? t.ui.sugFees : null,
    sections.attendance ? t.ui.sugAttendance : null,
  ].filter((x): x is string => !!x).slice(0, 3);
  return (
    <div className="pp-chatscreen" role="dialog" aria-modal="true" aria-labelledby="pp-chat-title" data-testid="pp-chat-screen">
      <header className="pp-chat-head">
        <button type="button" className="pp-iconbtn" onClick={onClose} aria-label={t.ui.backToMessages} ref={back}><Icon name="chevron" className="pp-back" /></button>
        <AssistantStar small />
        <div className="pp-hello"><small dir="auto">{t.ui.assistantAbout(learner.firstName, learner.school ?? '')}</small><b id="pp-chat-title">{t.ui.assistant}</b></div>
      </header>
      <div className="pp-chat" data-testid="pp-chat" aria-live="polite">
        {!msgs.length && (
          <div className="pp-chat-msg pp-chat-msg--enara pp-chat-hello">
            <p>{t.sch.chatHint(learner.firstName)}</p>
          </div>
        )}
        {msgs.map((m, i) => (
          <React.Fragment key={i}>
            <div className={`pp-chat-msg pp-chat-msg--${m.from}`} data-testid={m.from === 'enara' ? 'pp-chat-answer' : 'pp-chat-question'}>
              <p dir="auto">{m.text}</p>
              {m.reply?.sources.map((s) => <small key={s.source} className="pp-chat-src" data-testid="pp-chat-source"><Icon name="school" />{t.sch.chatFrom(label(s.source), s.updatedAt ? cairoDate(s.updatedAt.slice(0, 10), lang) : '')}</small>)}
              {m.created && <small className="pp-chat-src" role="status" data-testid="pp-chat-created"><Icon name="check" />{t.sch.chatCreated}</small>}
            </div>
            {m.reply?.offerRequest && !m.created && (
              <div className="pp-propose">
                <b><Icon name="inbox" />{t.sch.chatOffer(t.sch.reqType[m.reply.offerRequest.type] ?? m.reply.offerRequest.type)}</b>
                <button type="button" className="pp-btn pp-btn--primary" onClick={() => void confirm(i)} data-testid="pp-chat-confirm"><Icon name="check" />{t.sch.chatConfirm}</button>
                <small>{t.ui.nothingSent}</small>
              </div>
            )}
          </React.Fragment>
        ))}
        {busy && <div className="pp-chat-msg pp-chat-msg--enara pp-typing" role="status" aria-label={t.sch.chatThinking}><i /><i /><i /></div>}
        <div ref={end} />
      </div>
      <div className="pp-chat-foot">
        {suggestions.length > 0 && !busy && (
          <div className="pp-sugs" role="group" aria-label={t.ui.suggestions}>
            {suggestions.map((s) => <button key={s} type="button" onClick={() => void ask(s)}>{s}</button>)}
          </div>
        )}
        <form className="pp-chat-form" onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} placeholder={t.sch.chatPh} aria-label={t.sch.chatPh} dir="auto" data-testid="pp-chat-input" />
          <button type="submit" className="pp-chat-sendbtn" disabled={busy || !q.trim()} data-testid="pp-chat-send" aria-label={t.sch.chatSend}><Icon name="send" className="pp-flip" /></button>
        </form>
        <p className="pp-meta">{t.sch.chatDisclaimer}</p>
      </div>
    </div>
  );
};
