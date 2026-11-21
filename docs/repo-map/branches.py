import html
L='live'; R='research'; P='plan'; O='ops'; X='not merged'
groups=[
("Base branches", "#0b203c", [
 ("main","Initial commit only; never deploys","base"),
 ("staging-alpha","Original staging app snapshot (Vercel staging); the starting point for everything",'base'),
 ("lms-test-live","The lms-test site: every PR below merges here after E2E, then deploys to lms-test.enara.app",'base'),
 ("e2e-results","Screenshots from the latest E2E run (rewritten each run)",O),
]),
("LMS track (Moodle / LTI)", "#2f6bff", [
 ("claude/lms-integration","LMS design docs; grader accuracy gate before real schools get grades",X),
 ("claude/lms-phase1a","LTI 1.3 launch: Moodle opens ENARA, framed pages, error page",L),
 ("claude/lms-phase1b","Launch follow-ups; rule 'done = E2E passed'",L),
 ("claude/lms-phase2","Activity picker (Deep Linking), verified on MoodleCloud",L),
 ("claude/lms-phase2b","Picker follow-ups: grade type, 'accept grades' setting",L),
 ("claude/lms-phase3","Grades back to Moodle (AGS) + read-only evidence route",L),
 ("claude/lms-phase3-followups","Keep released grade while a newer attempt waits; linked activity",L),
 ("claude/lms-phase4","Roster sync (NRPS); Moodle web-service test tool",L),
 ("claude/lms-phase8","Tutor, live avatar and diagnostic activities in Moodle (no grade)",L),
 ("claude/lms-p0","P0 fixes incl. microphone in the Moodle frame",L),
 ("claude/lms-grade-ledger","Append-only grade ledger, LMS sync log, change detection",L),
 ("claude/lms-email-drafts","LMS email templates wired to events; daily job",L),
 ("claude/lms-email-safety","Every lms-test email goes to the test inbox, capped",L),
 ("claude/lms-onboarding","School onboarding; mic-blocked E2E case",L),
 ("claude/lms-school-guide","School and teacher Moodle guides (EN/AR)",X),
 ("claude/lms-e2e","E2E suite: Moodle 4.5 + Playwright in Docker",L),
 ("claude/lms-cd","Continuous delivery: guard, merge, deploy, migrate, health check, rollback",L),
 ("claude/lms-claude-md","CLAUDE.md standing rules, go-live checklist (this session's dev branch)",L),
 ("claude/multi-class-enrollment","A student in several classes (enrollments, backfill, shadow check)",L),
]),
("Parents track", "#9b6bd6", [
 ("claude/parents-p1","Parents portal: code-first entry, school access Off/Free, usage card",L),
 ("claude/parents-p1-redeploy","Deploy manifest accepts PARENT_* switches",X),
 ("claude/parents-p2","Class code sheets, teacher codes, email sign-in, account merge",L),
 ("claude/parents-p3","Results reach parents only after the teacher releases them",L),
 ("claude/parents-p4","Approved parent emails (link, results, weekly summary)",L),
 ("claude/parents-p5","CSV invitations, one email per parent",L),
 ("claude/parents-desktop","Desktop layout for the portal (side menu); phones unchanged",L),
]),
("Tutor track: features live on lms-test", "#f59f0a", [
 ("claude/tutor-memory","Learner memory phase 1: errors to work on from released assessments",L),
 ("claude/tutor-lms-integrate","Tutor engine (planner2, ESL5) brought into the LMS site; one age rule",L),
 ("claude/tutor-lms-memory / memory2","Memory phases 2-4 (session memory, learner profile, what works); planner2f fixes",L),
 ("claude/tutor-lms-next","Admin card: learner memory report (counts only)",L),
 ("claude/tutor-lms-moodlequiz","Errors from Moodle quiz attempts (read-only token per school)",L),
 ("claude/tutor-lms-e2e-workon","E2E 15: errors-to-work-on scenario",L),
 ("claude/tutor-lms-planner2g","planner2g: answer the learner's own question, short child explanations",L),
 ("claude/tutor-lms-pairfix / slipfix","Grading fixes: comparative pairs; lesson words never 'spelling slips'",L),
 ("claude/tutor-lms-trusted","workOnTrusted + oneTaskMethod switches",L),
 ("claude/tutor-lms-spaced / rulewrong / moves / flagson","spacedReview, ruleOnWrong, switchMove, spellingPattern, l1Lexical, childShort",L),
 ("claude/tutor-lms-reviewfirst","Spaced reviews open the session before today's rule",L),
 ("claude/tutor-lms-childrule","Under-9 rule lines fit the short-reply limit",L),
 ("claude/tutor-lms-adaptivespacing","Review gaps follow how the learner did",L),
 ("claude/tutor-lms-mixedreview","Review items mix two known points",L),
 ("claude/tutor-lms-realchat","Two real-conversation replies per session, then back to the lesson",L),
 ("claude/tutor-lms-kidsav","Picture choices read aloud for under-9s",L),
 ("claude/tutor-lms-avatarspeaking","Speaking practice with the avatar; pilot plan",L),
 ("claude/tutor-lms-anamvoice","Avatar uses Anam's own speech-to-text and voice",L),
 ("claude/tutor-lms-kidsspeaking","Children speak to the tutor and the avatar (no user toggles)",L),
 ("claude/tutor-lms-ownpics","ENARA's own 292 pictures replace OpenMoji",L),
 ("claude/tutor-lms-avatarusage","Test-only cost/latency readout per avatar call",L),
 ("claude/tutor-lms-worklog","Tutor work log",L),
]),
("Tutor track: plans and reports (docs only)", "#f59f0a", [
 ("claude/tutor-esl6","Plans and reports (this report, repo map, bridge plan, ESL6 run)",P),
 ("claude/tutor-lit-review-plan","Literature review vs the tutor; ranked changes",P),
 ("claude/tutor-review-first-plan","Plan for reviewFirst",P),
 ("claude/tutor-next-plan","NEXT_PLAN: childRule + five improvements",P),
 ("claude/tutor-picture-trial","20 drawn pictures vs OpenMoji, for review",P),
 ("claude/tutor-review-pack","Review pack from the ESL6 run",P),
 ("claude/tutor-esl5-pilot-plan","ESL6 rounds comparison and power",P),
 ("claude/tutor-esl-methods","Teaching-methods table by age / level",P),
]),
("Tutor track: research (simulated learners only)", "#5cb85c", [
 ("claude/tutor-esl7","ESL7 journey + ESL7b reviewFirst check",R),
 ("claude/tutor-planner2","planner2 design and simulation rounds",R),
 ("claude/tutor-kids-pack","Kids pack: Starters word list, child rules",R),
 ("claude/tutor-teaching / teaching-work","teach2 simulation rounds",R),
 ("claude/grader-round8 / round12","Grader accuracy rounds (round 12 passed: 96%)",R),
 ("claude/r12-answer-writer / scoring-input / scorer-s1..s3","Independent answers and scorers for grader round 12",R),
]),
("Tutor track: one-off runs on lms-test (no app code)", "#e85d4a", [
 ("claude/tutor-lms-copykeys-run","Copied ANAM_* names/IDs from the frozen project (read only)",O),
 ("claude/tutor-lms-aion-run","Turned AI on for lms-test (spend cap required)",O),
 ("claude/tutor-lms-avatarcost-run","Avatar cost/latency test harness (waiting for a working key)",O),
 ("claude/tutor-lms-accountcheck","Read-only check of a failing sign-in (cancelled)",O),
]),
("Other", "#566376", [
 ("claude/busy-ramanujan-v3i1cl","Lesson quiz editor with AI drafts (merged into staging-alpha)",'base'),
 ("claude/email-templates","Email templates; parent sign-up heading",X),
 ("claude/codebase-review-kbxqan","Codebase review",X),
]),
]
TAG={L:('#e7f6ec','#0c8d62','live on lms-test'),R:('#ecf6ff','#075985','research'),P:('#fff8ea','#92400e','docs'),O:('#fff3f1','#b42318','one-off run'),X:('#f0f0f0','#666','not merged'),'base':('#eef0f4','#0b203c','base')}
out=['<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#f6f7fa;font:13px/1.35 Inter,system-ui,sans-serif;color:#13233a}.w{width:1600px;padding:28px 32px}h1{margin:0 0 4px;font-size:28px}.sub{color:#566376;margin-bottom:16px}.cols{columns:2;column-gap:18px}.g{break-inside:avoid;background:#fff;border:2px solid var(--c);border-radius:14px;padding:10px 12px;margin-bottom:16px}.g h2{margin:0 0 6px;font-size:15px;color:var(--c)}.r{display:grid;grid-template-columns:330px 1fr 104px;gap:8px;padding:4px 0;border-top:1px solid #eef2f6;align-items:start}.r:first-of-type{border-top:0}.b{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;word-break:break-all}.t{font-size:11px;font-weight:600;border-radius:999px;padding:2px 8px;text-align:center}.leg{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}</style></head><body><div class="w"><h1>ENARA repo: branches (84) and what each contributes</h1><div class="sub">Grouped by track. "Live on lms-test" = merged into lms-test-live after E2E and deployed. Rule: each session works only on its own track\'s branches.</div><div class="leg">']
for k in (L,P,R,O,X,'base'):
    bg,fg,lab=TAG[k]; out.append(f'<span class="t" style="background:{bg};color:{fg}">{lab}</span>')
out.append('</div><div class="cols">')
n=0
for name,c,rows in groups:
    out.append(f'<div class="g" style="--c:{c}"><h2>{html.escape(name)} ({len(rows)})</h2>')
    for b,d,k in rows:
        bg,fg,lab=TAG[k]
        out.append(f'<div class="r"><span class="b">{html.escape(b)}</span><span>{html.escape(d)}</span><span class="t" style="background:{bg};color:{fg}">{lab}</span></div>')
    out.append('</div>')
out.append('</div></div></body></html>')
open('/home/user/enara-staging-alpha/docs/repo-map/branches.html','w').write(''.join(out))
