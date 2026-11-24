# What I need from you

_24 Nov 2026, 10:00 PM Cairo. Updated after your answers. Most urgent first; nothing here blocks the work in progress._

## 1. Client (pending answers)
| # | Question | Until answered |
|---|---|---|
| 4 | Attendance: daily or per period; who records it, by what time? | Both supported (period optional) |
| 5 | Which parent requests are most common, and who answers them? | Four types: certificate, early leave, teacher meeting, other |
| 6 | Which activities need signed consent today, and is a tap-to-sign record acceptable to them? | Tap-to-sign forms as built |
| 8 | Language of announcements: Arabic, English or both? | Both (an Arabic title and text are optional) |
| 10 | Later payments: Fawry or Paymob, and a merchant account? | Payment at the school only; step (f) waits |
| — | For the Moodle connector: the client's **Moodle site address**, and a **web service token** for a service user with read access (courses, forums, calendar, attendance plugin if used) | The connector is built and tested on our test Moodle; it connects to theirs once the token is set (never shown in chat) |

## 2. Your account steps
1. **Vercel Pro** for the new team. Tell me when it is active: test.enara.app steps 1–2 start then (after #119–#125 are deployed).
2. **Teacher marks:** send the 50 + 50 sheet to teachers and return the marks.
3. **Your corrections on the Mishkat review sheet** (then I retrain on the GPU).
4. **One real Moodle launch** on lms-test, done by a person.
5. **Change the two short passwords** in Vercel: `SEED_USER_PASSWORD` and `API_DOCS_PASSWORD` (12+ characters).
6. **Email:** the production sender and reply-to, and the Resend plan upgrade.
7. **The LAILA authors' OK** for the Arabic essays.

## 3. Decided (for the record)
- Vercel Pro: yes (your steps).
- Mishkat cold start: accepted for now; revisit before the first real school.
- test.enara.app: steps 1–2 after Vercel Pro is active and #119–#125 are deployed; steps 3–6 wait for your go.

## 4. Nothing needed from you
I do these and report: deploy #119–#125 one at a time; reload the sample data; the full screenshot set; a DeepSeek check of the chatbot on lms-test; retention settings per data type; the Moodle connector; the bus call button on.
