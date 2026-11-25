import React from 'react';
import { cairoDate, schoolApi, type LearnerChip, type SchoolOverview } from '../api';
import { Icon, useP } from '../ui';
import { useLive } from '../useLive';
import type { SchoolView } from './School';

/** How many things wait on the parent: consents to answer and overdue instalments (the Actions badge). */
export const actionsCount = (o: SchoolOverview | null | undefined): number =>
  !o ? 0 : (o.sections.consents ? o.consentsPending ?? 0 : 0) + (o.sections.fees ? o.fees?.overdueCount ?? 0 : 0);

const none = () => Promise.resolve(null);

// Redesign step 5: the Actions inbox for the chosen child. To do (consents to answer, the next or overdue instalment),
// Waiting on school (open requests with Sent → Seen by office → Answered) and Done. Signing, paying details and new requests
// keep their own screens (one tap away), so the rules they carry (exact consent text, view-only guardians) stay in one place.
export const Actions: React.FC<{ learner: LearnerChip; overview: SchoolOverview | null; refreshKey: number; openSchool: (v: SchoolView) => void }> = ({ learner, overview: o, refreshKey, openSchool }) => {
  const { t, n, lang } = useP();
  const on = o?.sections;
  const id = learner.studentId;
  const consents = useLive(() => (on?.consents ? schoolApi.consents(id).catch(() => null) : none()), [id, !!on?.consents], refreshKey);
  const requests = useLive(() => (on?.requests ? schoolApi.requests(id).catch(() => null) : none()), [id, !!on?.requests], refreshKey);
  const fees = useLive(() => (on?.fees ? schoolApi.fees(id).catch(() => null) : none()), [id, !!on?.fees], refreshKey);
  const any = !!(on?.consents || on?.fees || on?.requests);

  const forms = consents.data?.forms ?? [];
  const toSign = forms.filter((f) => f.open && (!f.answer || !f.answer.sameText));
  const signed = forms.filter((f) => f.answer && f.answer.sameText);
  const reqs = requests.data?.requests ?? [];
  const open = reqs.filter((r) => r.status === 'new' || r.status === 'in_progress');
  const closed = reqs.filter((r) => r.status === 'done' || r.status === 'refused');
  const nextFee = fees.data?.next ?? null;
  const feeTodo = nextFee && (nextFee.status === 'overdue' || nextFee.status === 'due') ? nextFee : null;
  const todo = toSign.length + (feeTodo ? 1 : 0);
  const loading = (on?.consents && !consents.data && consents.loading) || (on?.requests && !requests.data && requests.loading) || (on?.fees && !fees.data && fees.loading);
  const formTitle = (f: (typeof forms)[number]) => (lang === 'ar' && f.titleAr) || f.title;

  return (
    <>
      <div className="pp-pagehead pp-row" style={{ alignItems: 'flex-end' }}>
        <div><h1>{t.ui.actTitle}</h1><p>{t.ui.actSub}</p></div>
        {on?.requests && requests.data?.canCreate && <button type="button" className="pp-btn pp-btn--ton" onClick={() => openSchool('requests')} data-testid="pp-act-new-request"><Icon name="plus" />{t.ui.newRequestShort}</button>}
      </div>
      {!any && <section className="pp-card pp-empty"><Icon name="actions" /><p>{t.ui.nothingToDo}</p></section>}
      {any && loading && <div className="pp-skeleton" role="status" aria-label={t.loading} />}

      {any && !loading && (
        <>
          <div className="pp-sec-h"><h2>{t.ui.todo}</h2>{todo > 0 && <span className="pp-count">{n(todo)}</span>}</div>
          {todo === 0 && <p className="pp-notice pp-notice--ok" role="status" style={{ display: 'flex' }}><Icon name="ontrack" /><span>{t.ui.nothingToDo}</span></p>}
          {toSign.map((f) => (
            <article key={f.id} className="pp-card pp-act" data-testid="pp-act-consents">
              <div className="pp-act-top"><span className="pp-ico pp-ico--warn"><Icon name="pen" /></span>
                <div className="pp-act-tx"><span className="pp-meta">{t.ui.consentKind} · {t.sch.deadline(cairoDate(f.deadline, lang))}</span><b dir="auto">{formTitle(f)}</b></div></div>
              {f.answer && !f.answer.sameText && <p className="pp-sub">{t.sch.textChanged}</p>}
              <button type="button" className="pp-btn pp-btn--primary pp-btn--block" onClick={() => openSchool('consents')}>{t.ui.answerNow}<Icon name="chevron" flip /></button>
            </article>
          ))}
          {feeTodo && (
            <article className={`pp-card pp-act${feeTodo.status === 'overdue' ? ' pp-act--bad' : ''}`} data-testid="pp-act-fees">
              <div className="pp-act-top"><span className={`pp-ico ${feeTodo.status === 'overdue' ? 'pp-ico--bad' : 'pp-ico--info'}`}><Icon name="coin" /></span>
                <div className="pp-act-tx"><span className="pp-meta">{t.sch.instalment(n(feeTodo.number))} · {t.sch.feeStatus[feeTodo.status]}</span>
                  <b>{t.sch.feeDueLine(n(feeTodo.amount.toLocaleString('en-US')), cairoDate(feeTodo.dueDate, lang))}</b></div></div>
              <p className="pp-sub">{t.ui.payAtOffice}</p>
              <button type="button" className="pp-btn pp-btn--block" onClick={() => openSchool('fees')}>{t.ui.seeFees}<Icon name="chevron" flip /></button>
            </article>
          )}

          {on?.requests && (
            <>
              <div className="pp-sec-h"><h2>{t.ui.waitingOnSchool}</h2>{open.length > 0 && <span className="pp-meta">{n(open.length)}</span>}</div>
              {open.length === 0 && <p className="pp-sub">{t.ui.noRequests}</p>}
              {open.map((r) => (
                <button key={r.id} type="button" className="pp-card pp-act pp-card--link" onClick={() => openSchool('requests')} data-testid="pp-act-request" data-status={r.status}>
                  <span className="pp-act-top"><span className="pp-ico pp-ico--info"><Icon name="inbox" /></span>
                    <span className="pp-act-tx"><span className="pp-meta">{cairoDate(r.createdAt.slice(0, 10), lang)}</span><b>{t.sch.reqType[r.type] ?? r.type}</b><span className="pp-sub" dir="auto">{r.details}</span></span></span>
                  <ol className="pp-steps" aria-label={t.sch.reqStatus[r.status] ?? r.status}>
                    <li className="pp-step--done"><i><Icon name="check" /></i>{t.ui.reqSent}</li>
                    <li className={r.status === 'in_progress' ? 'pp-step--done' : 'pp-step--cur'} aria-current={r.status === 'new' ? 'step' : undefined}><i>{r.status === 'in_progress' && <Icon name="check" />}</i>{t.ui.reqSeen}</li>
                    <li className={r.status === 'in_progress' ? 'pp-step--cur' : undefined} aria-current={r.status === 'in_progress' ? 'step' : undefined}><i />{t.ui.reqAnswered}</li>
                  </ol>
                </button>
              ))}
            </>
          )}

          {(signed.length > 0 || closed.length > 0) && (
            <>
              <div className="pp-sec-h"><h2>{t.ui.done}</h2></div>
              <section className="pp-card pp-card--flush pp-threads">
                {signed.map((f) => (
                  <button key={f.id} type="button" className="pp-thread" onClick={() => openSchool('consents')}>
                    <span className="pp-av2 pp-av2--ok"><Icon name="check" /></span>
                    <span className="pp-thread-body"><span className="pp-thread-name" dir="auto">{formTitle(f)}</span><span className="pp-thread-sub">{t.ui.answeredOn(cairoDate(f.answer!.at.slice(0, 10), lang))}</span></span>
                  </button>
                ))}
                {closed.map((r) => (
                  <button key={r.id} type="button" className="pp-thread" onClick={() => openSchool('requests')}>
                    <span className={`pp-av2 ${r.status === 'done' ? 'pp-av2--ok' : 'pp-av2--bad'}`}><Icon name={r.status === 'done' ? 'check' : 'close'} /></span>
                    <span className="pp-thread-body"><span className="pp-thread-name">{t.sch.reqType[r.type] ?? r.type}</span><span className="pp-thread-pv" dir="auto">{r.reply ?? t.sch.reqStatus[r.status]}</span></span>
                  </button>
                ))}
              </section>
            </>
          )}
        </>
      )}
    </>
  );
};
