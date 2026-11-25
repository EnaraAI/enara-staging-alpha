# Parents school app: final report

_25 Nov 2026, 7:10 AM Cairo._

## Done (all on lms-test, each behind its own switch)
| Step | What parents get | PRs |
|---|---|---|
| (a) | Timetable, announcements, attendance, notifications | #112–#118 |
| (b) | Fees: instalments, receipts (PDF), reminders | #119–#121 |
| (c) | Bus: route, stop times, delay notices, call the supervisor | #122–#123 |
| (d) | Requests to the school office; consent forms | #124–#125 |
| (e) | School chat (DeepSeek), answers only from the child's own records | #126, #129, #130 |
| — | Moodle connector (announcements; attendance plugin), Excel import as the first source | #127 |
| — | Parents portal Arabic: fusha only | #128 |

Retention per data type is a setting; chat logs follow it; studentErasure covers the school data.

## Chat check on lms-test (7:05 AM, after #130)
28 questions, two sample parents (English and Arabic schools), English, fusha and Egyptian dialect.
- 28 of 28 answered, about 5 seconds each (max 6.4 s). 27 by the model, 1 plain answer from the records.
- English question → English answer; Arabic or dialect question → fusha answer.
- Attendance numbers now match the dates (e.g. "3 absences: 3, 15 and 16 Nov").
- Other families' fees: refused. Off-topic: "not shared", offers a request. Certificate (English or dialect): offers a certificate request.

## Small gaps (not built; 1–2 h each if wanted)
- Sample data: one child pays the bus fee but has no bus route.
- Chat sometimes says "day 2" instead of the weekday name.
- Parent usage per section; assigning requests to staff; saved column mappings for imports.

## Waiting on others
- Client: Moodle site address and a read-only token; answers to Q4, 5, 6, 8, 10.
- You: Vercel Pro (then test.enara.app steps 1–2).
