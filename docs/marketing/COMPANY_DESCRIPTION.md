# ENARA: company description, taken from the code (for your review)

**How this was built:** a read-only sweep of the whole codebase on `lms-test-live`. Every line below is backed by code; the evidence is in the inventory at the end. Nothing here has been applied to the video script yet.

## One line
**ENARA is the AI infrastructure for schools: one platform that turns a school's own curriculum into personal teaching, fair assessment and clear insight, and plugs into the systems the school already uses.**

## Short version (about 50 words)
ENARA is AI infrastructure for schools and education. It takes a school's own content and turns it into an AI teaching layer, an assessment layer and a learner model that remembers every student. It connects to the school's LMS and gives teachers, students and parents their own apps. Each school gets its own controls, budgets and safeguards.

## Why "infrastructure" is accurate: the layers in the code
| Layer | What ENARA provides |
|---|---|
| **1. Content** | Schools upload their materials. ENARA extracts them into searchable passages, drafts learning objectives (Arabic and English, approved by staff), and drafts lesson plans, study plans and quizzes. |
| **2. AI teaching engine** | A tutor that answers from the school's own materials with sources, by chat, voice or live avatar. **Code chooses how to teach** (23 teaching methods, lesson shapes, hints before answers); the AI only writes the reply. It has a deep English-language engine built for Arabic speakers, and graded practice in any subject. |
| **3. Assessment** | Builder, versions, adaptive diagnostic and placement tests, speaking exams. AI-assisted marking with an audit record for every answer; **teachers review and release** results. A grade ledger. |
| **4. Learner model** | Mastery per learning objective, mistakes turned into spaced reviews, memory of each session, and what teaching works for each learner, including mistakes from the school's Moodle quizzes. |
| **5. Insight** | Teacher, class, school and student analytics; teaching impact; AI usage and spend per school. |
| **6. Integration** | LTI 1.3 with Moodle: launch, activity picker, grades back, class lists; a generic LTI connection; documented APIs and school API keys. |
| **7. Apps for every role** | Student app, kids' app (under 13), teacher tools, school admin, and a parents' portal in Arabic and English. |
| **8. Trust and control** | Each school's data kept apart; roles and permissions; per-school AI spend caps; usage ledger; audit trail; data-retention and erasure tools; age bands; no voice audio stored; guarded against misuse. |
| **9. Reliable delivery** | Every change passes a full end-to-end suite on real Moodle before release, with automatic health checks and rollback. |

## Strongest differentiators (all in the code)
1. **Pedagogy by design, not by prompt.** A rule-based planner picks the lesson shape and the teaching method; the AI writes within it.
2. **A real LMS integration**, end to end with Moodle, tested automatically.
3. **A learner model that lasts** and feeds the tutor: spaced review of real mistakes, including from Moodle quizzes.
4. **Teachers stay in charge**: AI marks are proposals until a teacher releases them, and parents see results only after release.
5. **Grounded in the school's own materials**: the tutor shows sources, and says when the materials don't cover something.
6. **Per-school AI cost control**: spending is reserved before each AI call, with a price list and a ledger.
7. **Built for Arabic-speaking learners and for children**: an Arabic/English interface, Arabic-specific language support, and a separate kids' experience.
8. **A full parents product**, not an add-on.

## What we should NOT claim (true today)
| Claim to avoid | Why |
|---|---|
| "Used in schools" | No real school is live yet. |
| "AI grading accurate enough for official grades" | Grades to real schools are switched off until a set accuracy level is reached. |
| "Virus-scanned uploads" | There's no scanner yet. Say "documents are checked and approved before use" (a rights statement is required). |
| "Works with Canvas, Blackboard or D2L" | Only Moodle and generic LTI are built. |
| Pronunciation scoring | Not active yet. |
| Children speaking with the tutor | On in our demo environment only, and needs parent consent and the legal review before schools. |
| "The same deep teaching engine in every subject" | The deep method engine is English-specific; other subjects get grounded answers and graded practice. |
| Full multi-class enrolment | Partial. |
| Business dashboards (finance, CRM) | Sample data. |

**Data-protection wording:** the code's retention jobs are built around the Saudi PDPL. For Egypt, say "data-retention and erasure controls" rather than naming a law until the legal review confirms which apply.

## What this changes in the video (once you approve)
- **Opening and closing line:** "ENARA: the AI infrastructure for your school".
- **A new "platform" scene:** the layers (content → teaching → assessment → learner model → insight), connected to the LMS and the apps.
- **Positioning:** the tutor becomes one capability of the platform, not the whole story.
- **Safety scene:** "checked and approved documents", not scanning; no law named.
- **Coming soon:** pronunciation feedback; more LMS connections.

## Please confirm
1. Which one-line version do you want: the one above, or a shorter one, "ENARA: AI infrastructure for schools"?
2. Should the film keep the tutor as the hero feature inside the platform story, or give all the layers equal weight?
