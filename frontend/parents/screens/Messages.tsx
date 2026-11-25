import React from 'react';
import type { LearnerChip, SchoolOverview } from '../api';
import { AssistantStar, Icon, useP } from '../ui';
import type { SchoolView } from './School';

// Redesign step 1: the Messages tab. The ENARA assistant is a normal chat row (first), then what the school sends:
// notifications and announcements. There is no parent–teacher chat in ENARA yet, so there are no teacher threads.
export const Messages: React.FC<{ learner: LearnerChip; overview: SchoolOverview | null; openChat: () => void; openSchool: (v: SchoolView) => void }> = ({ learner, overview: o, openChat, openSchool }) => {
  const { t, n } = useP();
  const on = o?.sections;
  const unread = o?.unreadNotifications ?? 0;
  const rows = !!(on?.chat || on?.notifications || on?.announcements);
  return (
    <>
      <div className="pp-pagehead"><h1>{t.ui.msgTitle}</h1><p>{t.ui.msgSub}</p></div>
      {rows ? (
        <section className="pp-card pp-card--flush pp-threads" aria-label={t.ui.msgTitle}>
          {on?.chat && (
            <button type="button" className="pp-thread" onClick={openChat} data-testid="pp-chat-open" aria-label={`${t.ui.assistant}: ${t.sch.chatOpen}`}>
              <AssistantStar />
              <span className="pp-thread-body">
                <span className="pp-thread-name">{t.ui.assistant}<span className="pp-tag pp-tag--ai"><bdi dir="ltr">{t.ui.ai}</bdi></span></span>
                <span className="pp-thread-sub">{t.ui.assistantSub(learner.firstName)}</span>
                <span className="pp-thread-pv">{t.ui.assistantPv}</span>
              </span>
            </button>
          )}
          {on?.notifications && (
            <button type="button" className={`pp-thread${unread ? ' pp-thread--unread' : ''}`} onClick={() => openSchool('notifications')} data-testid="pp-msg-notifications">
              <span className="pp-av2 pp-av2--school"><Icon name="school" /></span>
              <span className="pp-thread-body">
                <span className="pp-thread-name">{t.ui.schoolNews}</span>
                <span className="pp-thread-pv">{unread ? t.ui.schoolNewsPv(n(unread)) : t.ui.allRead}</span>
              </span>
              {unread > 0 && <span className="pp-thread-side"><span className="pp-count">{n(unread > 99 ? '99+' : unread)}</span></span>}
            </button>
          )}
          {on?.announcements && (
            <button type="button" className="pp-thread" onClick={() => openSchool('announcements')} data-testid="pp-msg-announcements">
              <span className="pp-av2 pp-av2--info"><Icon name="megaphone" /></span>
              <span className="pp-thread-body">
                <span className="pp-thread-name">{t.sch.announcements}</span>
                <span className="pp-thread-pv">{o?.announcementsCount ? t.ui.announcementsPv(n(o.announcementsCount)) : t.sch.none}</span>
              </span>
            </button>
          )}
        </section>
      ) : (
        <section className="pp-card pp-empty"><Icon name="messages" /><p>{t.ui.noMessages}</p></section>
      )}
    </>
  );
};
