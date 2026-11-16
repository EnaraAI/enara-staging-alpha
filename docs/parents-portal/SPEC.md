# ENARA Parents Portal — Product Spec

Source of truth: the living spec doc in Claude (exported 16 Nov 2026). This file is a copy for implementation.

## 1. Purpose and principles

The portal must answer three questions in under 10 seconds: **Is my child practicing? Are they improving? Is anything wrong?** Everything else is one tap deeper.

- **Plain language, not pedagogy.** "Can introduce herself and talk about her family", not "A1.2 spoken interaction". CEFR and ENARA grades sit one tap away.
- **Effort and progress together.** Minutes and streaks next to skill growth.
- **Every insight ends in an action** ("Ask him about his weekend in English").
- **Support, not surveillance.** Visibility depends on learner age (section 2). Learners always know what their parent can see.
- **No comparing children.** No leaderboards or "vs other learners".
- **Mobile-first, Arabic and English.** Full RTL layout, WhatsApp-friendly reports.

## 2. Visibility tiers

The portal covers any learner a parent pays for, adults included. Adult learners are treated like teens: no separate sponsor mode, no opt-in sharing. Tier is computed from the learner's birth date and switches automatically on the 13th birthday (both sides notified a week before).

| What the parent sees | Kids (under 13) | Teens and adults (13+) |
| --- | --- | --- |
| Minutes, streak, sessions | Yes | Yes |
| Level and skill progress | Yes | Yes |
| Session summaries (topic, what went well) | Yes | Yes |
| Full chat transcripts and audio | Yes | No |
| Safety alerts | Yes, with excerpt | Yes, without excerpt |
| Assessment results | Yes | Yes |
| Set time limits and schedule | Yes | Suggests; learner accepts |
| Set goals and rewards | Yes | Co-set with learner |
| Billing and plan | Yes | Yes |

Consent:

- **Kids:** parent creates and owns the account; parental consent captured at signup.
- **13+:** learner sees a "What your parent can see" card in their own app and is notified when a parent changes a setting. An existing 13+ account joins the parent's plan by accepting an invite.

Legal check before launch: Egypt Personal Data Protection Law (No. 151 of 2020); COPPA and GDPR if sold outside Egypt.

## 3. Information architecture

Five bottom tabs; a learner switcher + status line sits above every tab.

| Tab | Contents | Tiers |
| --- | --- | --- |
| Home | Status line, effort ring, level card, "this week they learned", hear the progress, try this at home, alerts | All |
| Progress | CEFR level ladder, skill bars, 8-week trend, can-do checklist, strengths and focus areas, assessments | All |
| Activity | Calendar, session log, session cards with teaching methods; transcripts and audio for kids only | All |
| Controls | Weekly goal, daily time limit, allowed hours, reminders, learning focus, rewards, tutor settings | Kids set; 13+ co-set |
| Account | Learners and invites, co-parent, plan and payment, language, notifications, data download and delete | All |

## 4. Home (weekly snapshot), top to bottom

1. **Learner switcher.** Avatar chips.
2. **Status line.** *On track* (meeting weekly goal pace), *Needs a nudge* (behind pace or 3+ days missed), *Check this* (safety alert or sharp score drop). One-line reason.
3. **This week's effort.** Minutes vs weekly goal as a ring, day dots (week starts Saturday), current streak.
4. **Level card.** Level in plain words + CEFR code, progress bar to next level, latest can-do achieved.
5. **"This week they learned".** Three AI-generated bullets: a skill, new words, a win.
6. **Hear the progress.** 10-second clip now vs 4 weeks ago (v2).
7. **Try this at home.** One small action tied to this week's content.
8. **Alerts.** Upcoming assessment, plan renewal, unread items.

Never show raw scores without context, never more than one call to action.

## 5. Progress and CEFR

| CEFR | Parent label | Example can-do |
| --- | --- | --- |
| Pre-A1 | Starter | Knows greetings, colours, numbers |
| A1 | Beginner | Introduces self and family in simple sentences |
| A2 | Elementary | Talks about daily routine and last weekend |
| B1 | Intermediate | Tells a story, explains an opinion simply |
| B2 | Upper intermediate | Discusses school topics with some detail |
| C1 | Advanced | Debates and writes structured essays |
| C2 | Proficient | Near-native in most situations |

Progress tab:

- Level ladder with position and sub-level % (from ENARA's own grading).
- Skill bars: Listening, Speaking, Reading, Writing, Vocabulary, Grammar, each with a 4-week trend arrow.
- 8-week trend line of overall ENARA score, assessment dates marked.
- Can-do checklist for current level: achieved / in progress / not started.
- Two strengths and two focus areas in plain words.
- Assessment history with certificate on level-up.
- Time to next level: only after 4+ weeks of data, as a range, never a promise (later).
- Starter (Pre-A1) gets its own sub-steps so young kids see movement.

## 6. Activity and sessions

Reverse-chronological log grouped by day; each row expands to a session card:

- Date, start time, duration, course and unit
- **How ENARA taught it:** teaching methods used, in parent words (role-play, story retelling, spaced vocabulary review…)
- What went well / what was hard (one line each)
- Words to practise together
- Speaking time and focus (High / Medium / Low, not %)
- Quiz or checkpoint result if any

Transcripts and audio:

- **Kids:** "View conversation" opens full transcript + audio where recorded. Kept 90 days, then summary only.
- **13+:** summary only, never what the learner said.

Calendar strip above the log: practised, missed and scheduled days.

## 7. Controls

| Control | What the parent sets | Default | 13+ |
| --- | --- | --- | --- |
| Weekly goal | Minutes or sessions per week | 90 min / week | Co-set, learner accepts |
| Daily time limit | Max minutes per day | 45 min (kids) | Suggestion only |
| Allowed hours | School nights (Sun–Thu) vs weekend (Fri–Sat); quiet hours | 4–9 pm school nights | Suggestion only |
| Reminders | Days and time of nudges | Off | Learner controls |
| Learning focus | Conversation, school support, exam prep, reading | Conversation | Co-set |
| Rewards | Parent-defined rewards unlocked by goals | None | Optional |
| Tutor settings | Live avatar, microphone, camera, content strictness | Mic on, camera off | Learner controls camera |

Every change shows a plain-language preview line ("Omar can practise up to 45 minutes a day, 4–9 pm on school nights").

## 8. Notifications and weekly report

| Event | Channel | Timing | Tiers |
| --- | --- | --- | --- |
| Safety alert | Push + WhatsApp | Immediate | All |
| Weekly report | WhatsApp + email | Thursday 7 pm Cairo time | All |
| Level up / certificate | Push | Same day | All |
| Assessment result | Push | Same day | All |
| No practice for 3 days | Push | Day 3, 6 pm | All |
| Goal reached early | Push | Same day | All |
| Plan renewal / payment failed | Email + push | 7 days before / immediate | All |

Weekly report (one shareable card): status line, minutes vs goal, level and change since last week, three learned bullets, one try-this-at-home action, link to the portal. Monthly PDF (v2) adds 4-week skill trend and can-do checklist.

## 9. Account, billing, multiple learners

- Learners: add a learner of any age, or link an existing learner by invite code (13+ must accept).
- Second guardian: *Full* or *View only*. Only the owner manages billing.
- Plan: per-learner or family plan, renewal date, upgrade/downgrade, cancel.
- Payment: cards plus local options common in Egypt (e.g. Fawry, mobile wallets); PDF invoices.
- Preferences: language (Arabic / English), notification channels, report day.
- Data: download a learner's data, delete transcripts, close a learner's account.

## 10. Privacy and safety

Safety alerts fire on: sharing personal details (address, phone, school name), signs of distress, bullying mentions, attempts to push the tutor into inappropriate content. Alert states the category and what ENARA did. Kids' alerts include the excerpt; 13+ alerts do not.

Parents never see:

- A 13+ learner's own words, transcripts or recordings
- Safety alert excerpts for learners aged 13+
- Rankings or comparisons with other learners
- ENARA internal model data (method selection logic, raw scoring features)

## 11. MVP scope

| Feature | MVP | v2 | Later |
| --- | --- | --- | --- |
| Home snapshot, status line, effort ring | Yes | | |
| Level ladder, skill bars, can-do checklist | Yes | | |
| Session log with summaries | Yes | | |
| Kids transcripts | Yes | | |
| Weekly report (WhatsApp + email) | Yes | | |
| Safety alerts | Yes | | |
| Multiple learners, billing | Yes | | |
| Visibility tiers (under 13, 13+) | Yes | | |
| Time limits, allowed hours, weekly goal | | Yes | |
| "Hear the progress" voice clips | | Yes | |
| Rewards | | Yes | |
| Co-parent access | | Yes | |
| Monthly PDF report, certificates | | Yes | |
| Time-to-next-level estimate | | | Yes |
| School / teacher view | | | Yes |

## 12. Open questions (do not guess; flag them)

- How do ENARA grade bands map to CEFR sub-levels?
- Are sessions recorded as audio today, and can kids' audio be stored for 90 days?
- Which safety categories can the tutor already detect reliably?
- Separate parent app, or a parent mode inside the ENARA app?
- Report day: fixed Thursday evening, or parent's choice?
