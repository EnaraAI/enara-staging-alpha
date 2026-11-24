# What I need from you

_24 Nov 2026, 9:50 PM Cairo. Short list, most urgent first. Nothing here blocks the work in progress. Each item says what it unblocks._

## 1. Parents school app (client)
| # | Ask | Unblocks | Until then |
|---|---|---|---|
| 1 | **The client's LMS name** (and whether it has an API or exports) | The connector for timetable, attendance and announcements | Excel / CSV import (works today) |
| 2 | **Answers to the 10 client questions** (plan, "Questions to ask the client") | Final details per section | Sensible defaults, listed below |
| 3 | Q3: do bus supervisors **agree to share their phones** with parents? | Showing the call button | Phones hidden (the school can switch them on) |
| 4 | Q7: who sees **fees**: every guardian, or the payer only? | The default for the client | Every linked guardian (the school can switch to the main guardian only) |
| 5 | Q2: do **receipts exist as PDFs**, and who marks instalments paid? | Receipt upload in real use | Upload is built; marking paid by the school is built |
| 6 | Q9: **email only**, or SMS / WhatsApp needed at the start? | SMS or WhatsApp (cost per message) | In-app plus email |
| 7 | Q10: **Fawry or Paymob**, and a merchant account? | Step (f), online payment (separate plan) | Payment at the school only |

## 2. Legal review (before a real school)
1. Is the **tap-to-sign consent record** enough for trips and activities under Egyptian law? The record keeps the time, the device, a network-address hash and the exact text.
2. **Retention periods** (plan section 1): attendance, fees and receipts, consents, requests, and chatbot logs (90 days).
3. **Chatbot:** the disclaimer, its logs, and a model processing children's data (DeepSeek on our own Modal).
4. The school as data controller and ENARA as processor (a data processing agreement); consent to contact by email, SMS and WhatsApp.

## 3. Decisions you still have open
| # | Decision | Options |
|---|---|---|
| 1 | **Mishkat cold start** outside school hours (over 10 s, so the first English answer falls back to v3b) | accept it / keep 1 container warm 24/7 (about $100 a month) / widen the warm window (about $65 a month) |
| 2 | **Move lms-test to test.enara.app** (`TEST_ENARA_MOVE_PLAN.md`) | "go" per step: 1–2, then 3–6, then 7 |
| 3 | **Vercel Pro** for the new team | Needed before the move; reduces the risk of another block |

## 4. Things only you can do
1. **Teacher marks:** send the 50 + 50 marking sheet to teachers and return the marks (the accuracy bar for any grading claim).
2. **Your corrections on the Mishkat review sheet** (then I retrain on the GPU).
3. **One real Moodle launch** on lms-test, done by a person.
4. **Change the two short passwords** in Vercel: `SEED_USER_PASSWORD` and `API_DOCS_PASSWORD` (12+ characters).
5. **Email:** the production sender and reply-to, and the Resend plan upgrade (needed before parent emails go to real parents).
6. **The LAILA authors' OK** for the Arabic essays.

## 5. Nothing needed from you
I finish these myself and report:
- deploying #119–#125 one at a time;
- reloading the sample data (fees, buses, requests, consent);
- the full screenshot set;
- a check of the chatbot with real DeepSeek on lms-test;
- the final short report.
