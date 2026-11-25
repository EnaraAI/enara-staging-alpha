import React from 'react';
import { cairoDate, type SchoolOverview } from '../api';
import { Icon, useP } from '../ui';
import type { SchoolView } from './School';

/** How many things wait on the parent: consents to answer and overdue instalments (the Actions badge). */
export const actionsCount = (o: SchoolOverview | null | undefined): number =>
  !o ? 0 : (o.sections.consents ? o.consentsPending ?? 0 : 0) + (o.sections.fees ? o.fees?.overdueCount ?? 0 : 0);

// Redesign step 1: the Actions tab. Everything the school needs from the parent, across consents, fees and requests.
// Each row opens today's detail screen; step 5 replaces them with the full To do / Waiting / Done inbox.
export const Actions: React.FC<{ overview: SchoolOverview | null; openSchool: (v: SchoolView) => void }> = ({ overview: o, openSchool }) => {
  const { t, n, lang } = useP();
  const on = o?.sections;
  const any = !!(on?.consents || on?.fees || on?.requests);
  const pending = o?.consentsPending ?? 0;
  const overdue = o?.fees?.overdueCount ?? 0;
  return (
    <>
      <div className="pp-pagehead"><h1>{t.ui.actTitle}</h1><p>{t.ui.actSub}</p></div>
      {any && actionsCount(o) === 0 && <p className="pp-notice" role="status" style={{ display: 'block' }}>{t.ui.nothingToDo}</p>}
      {any ? (
        <section className="pp-card pp-card--flush pp-threads" aria-label={t.ui.actTitle}>
          {on?.consents && (
            <button type="button" className={`pp-thread${pending ? ' pp-thread--unread' : ''}`} onClick={() => openSchool('consents')} data-testid="pp-act-consents">
              <span className={`pp-av2 ${pending ? 'pp-av2--warn' : 'pp-av2--ok'}`}><Icon name="pen" /></span>
              <span className="pp-thread-body">
                <span className="pp-thread-name">{t.sch.consents}</span>
                <span className="pp-thread-pv">{pending ? t.ui.consentsPv(n(pending)) : t.ui.noConsents}</span>
              </span>
              {pending > 0 && <span className="pp-thread-side"><span className="pp-count">{n(pending)}</span></span>}
            </button>
          )}
          {on?.fees && (
            <button type="button" className={`pp-thread${overdue ? ' pp-thread--unread' : ''}`} onClick={() => openSchool('fees')} data-testid="pp-act-fees">
              <span className={`pp-av2 ${overdue ? 'pp-av2--bad' : 'pp-av2--info'}`}><Icon name="coin" /></span>
              <span className="pp-thread-body">
                <span className="pp-thread-name">{t.sch.fees}</span>
                <span className="pp-thread-pv">{o?.fees?.next ? t.sch.feeDueLine(n(o.fees.next.amount.toLocaleString('en-US')), cairoDate(o.fees.next.dueDate, lang)) : t.ui.feesNone}</span>
              </span>
              {overdue > 0 && <span className="pp-thread-side"><span className="pp-tag pp-tag--bad">{t.sch.overdueCount(n(overdue))}</span></span>}
            </button>
          )}
          {on?.requests && (
            <button type="button" className="pp-thread" onClick={() => openSchool('requests')} data-testid="pp-act-requests">
              <span className="pp-av2 pp-av2--info"><Icon name="inbox" /></span>
              <span className="pp-thread-body">
                <span className="pp-thread-name">{t.sch.requests}</span>
                <span className="pp-thread-pv">{o?.openRequests ? t.ui.requestsPv(n(o.openRequests)) : t.ui.noRequests}</span>
              </span>
            </button>
          )}
        </section>
      ) : (
        <section className="pp-card pp-empty"><Icon name="actions" /><p>{t.ui.nothingToDo}</p></section>
      )}
    </>
  );
};
