# Plan: everything lms-test does, on design.enara.app

**Where we are (27 Nov 2026, 5:00 PM Cairo).** Of 188 lms-test features, design.enara.app has 37 fully, 24 partly, 127 missing
(details per role in PARITY.md). The 31 approved screens were built new; the kids app and the live tutor were copied as they are.

## Options
| | What | Time | Look |
|---|---|---|---|
| **A. Copy the rest as it is** | Every lms-test screen that has no new design is copied unchanged (same method as the kids app: same files, a check that they still match lms-test, styles kept inside those screens). Each role's menu links to them. | About a day | New design on 31 screens, the lms-test look on the rest |
| B. Redesign everything | Build all ~150 missing or partial features in the new design. | Several weeks | One look everywhere |
| **C. A now, then B step by step (recommended)** | A first, so nothing is missing. Then replace copied screens with new designs one area at a time, starting with the most used, each through checks. | A: a day; then ongoing | Gets more uniform each week |

## Steps for A (one small PR-sized change per role, each through the design checks, then deploy)
1. **Shared:** forgot/reset password, invitation accept, Google and email-code sign-in for parents, LMS launch/picker/onboarding, demo, product tour.
2. **Student:** lesson reader (content, video, mark complete), My progress, diagnostics, study plan, speaking exams, result appeals, older quizzes.
3. **Parent:** the lms-test parents app for account, link child, add email, share report, controls, requests and consent, live bus map.
4. **Teacher:** class assignments (assign, open/close, extensions, release results), question bank, lesson planner, documents, educator AI chat, objectives, grade history, speaking exam settings.
5. **School admin / academic manager:** students, staff and invitations, curriculum center, batches and course instances, analytics and insights, LMS connections and roster, fee instalments, bus notices and live bus, parent codes and CSV invites.
6. **Platform admin:** credit management, AI credits, research insights, integrations, remaining admin pages.
7. **Bus supervisor:** the lms-test bus app.
8. Checks: every copied screen is opened for its role in Arabic and English, phone and desktop, with no API or page errors, and screenshots next to lms-test. No paid calls.
9. Report: one line per deploy, then the check report.

Rules: no backend change (all of these already exist on lms-test), lms-test and test.enara.app untouched, no merge into the lms-test front end.
