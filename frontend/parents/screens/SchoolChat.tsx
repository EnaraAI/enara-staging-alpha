import React, { useEffect, useRef, useState } from 'react';
import { cairoDate, schoolApi, type ChatReply, type LearnerChip } from '../api';
import { Icon, Sheet, useP } from '../ui';

// Parents school app, step (e): the assistant. Answers come only from what the school shares for THIS child (the server builds them
// from the parent's own screens) and show their source and date. It never acts: a request is opened only after the parent taps confirm.
type Msg = { from: 'you' | 'enara'; text: string; reply?: ChatReply; created?: boolean };

export const SchoolChat: React.FC<{ learner: LearnerChip }> = ({ learner }) => {
  const { t, lang } = useP();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { setMsgs([]); }, [learner.studentId]);
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }); }, [msgs, busy]);
  const label = (s: string) => t.sch.srcLabel[s] ?? t.sch[s as 'fees'] ?? s;
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = q.trim(); if (!text || busy) return;
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
  return (
    <>
      <button type="button" className="pp-chat-fab" onClick={() => setOpen(true)} aria-label={t.sch.chatOpen} data-testid="pp-chat-open">
        <svg viewBox="0 0 24 24" aria-hidden="true" width="26" height="26"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <Sheet title={t.sch.chatTitle} onClose={() => setOpen(false)}>
          <div className="pp-chat" data-testid="pp-chat">
            {!msgs.length && <p className="pp-sub">{t.sch.chatHint(learner.firstName)}</p>}
            {msgs.map((m, i) => (
              <div key={i} className={`pp-chat-msg pp-chat-msg--${m.from}`} data-testid={m.from === 'enara' ? 'pp-chat-answer' : 'pp-chat-question'}>
                <p dir="auto">{m.text}</p>
                {m.reply?.sources.map((s) => <small key={s.source} className="pp-meta" data-testid="pp-chat-source" style={{ display: 'block' }}>{t.sch.chatFrom(label(s.source), s.updatedAt ? cairoDate(s.updatedAt.slice(0, 10), lang) : '')}</small>)}
                {m.reply?.offerRequest && !m.created && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBlockStart: 6 }}>
                    <small>{t.sch.chatOffer(t.sch.reqType[m.reply.offerRequest.type] ?? m.reply.offerRequest.type)}</small>
                    <button type="button" className="pp-btn" onClick={() => void confirm(i)} data-testid="pp-chat-confirm"><Icon name="check" />{t.sch.chatConfirm}</button>
                  </div>
                )}
                {m.created && <small className="pp-meta" role="status" data-testid="pp-chat-created" style={{ display: 'block' }}>{t.sch.chatCreated}</small>}
              </div>
            ))}
            {busy && <p className="pp-meta" role="status">{t.sch.chatThinking}</p>}
            <div ref={end} />
          </div>
          <form className="pp-chat-form" onSubmit={send}>
            <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} placeholder={t.sch.chatPh} aria-label={t.sch.chatPh} dir="auto" data-testid="pp-chat-input" />
            <button type="submit" className="pp-btn pp-btn--primary" disabled={busy || !q.trim()} data-testid="pp-chat-send">{t.sch.chatSend}</button>
          </form>
          <p className="pp-meta">{t.sch.chatDisclaimer}</p>
        </Sheet>
      )}
    </>
  );
};
