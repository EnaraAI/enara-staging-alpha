# Environment variable check — summary

## Reading this (24 Nov 2026, 12:35 PM Cairo)
- **Values:** 0 real format problems. The flag on `ENARA_ENGINE_V2` ("esl5") is a false alarm: `esl5` is a valid feature bundle.
- **lms-test Anthropic key: `rejected`.** Anthropic refuses the key. The tutor uses DeepSeek, so tutoring works; anything that still calls Anthropic fails. It is a Sensitive value, so nobody can read it to compare with the old account.
- **test.enara.app:** `LMS_KEK` and `LMS_TOOL_BASE_URL` are set but not read by its live code (16 Nov). Harmless.
- **Intermittent `/ready` 503 (mongo unavailable) on BOTH lms-test and test.enara.app, at the same moments,** in 2 of 6 probes 20 s apart (10:30–10:31 UTC). The other probes returned 200 with mongo ok. A wrong variable would fail every time, so this is not a variable problem. Likely causes: a cold instance answering before its database connection is up, or the Atlas connection limit. Being looked into.
- **Not provable from outside:** the Sensitive keys on test.enara.app (frozen, no code change). On lms-test they are proven by the in-site check (PR #108) once it is deployed.

- **enara-landing**: 3 variables, 1 sensitive; format problems: 0; www.enara.app/ → 308; enara.app/ → 200
- **enara-lms-test**: 66 variables, 16 sensitive; format problems: 1; lms-test.enara.app/ready → 200 mongo=ok postgres=not_configured r2=configured anthropic=configured elevenlabs=not_configured anam=configured aiTestSpendCap=set anthropicKey=rejected anthropicFallbackKey=not_configured anthropicFallbackModel=not_set
- **enara-staging-alpha**: 34 variables, 9 sensitive; format problems: 0; test.enara.app/ready → 503 mongo=unavailable postgres=not_configured r2=configured anthropic=configured elevenlabs=configured anam=configured aiTestSpendCap=set

_2026-11-24T10:28:31.408Z · new team · names and states only_

## enara-landing (www.enara.app, enara.app)
Live code: not deployed from git (names in code cannot be compared)

| Variable | Targets | Type | Value format | Read by live code |
|---|---|---|---|---|
| ANAM_API_KEY | production | sensitive | sensitive: cannot be read | — |
| ANAM_AVATAR_ID | production | encrypted | ok | — |
| ANAM_VOICE_ID | production | encrypted | ok | — |

Running site: www.enara.app/ → 308; enara.app/ → 200

## enara-lms-test (lms-test.enara.app)
Live code: commit b9ee3b32

| Variable | Targets | Type | Value format | Read by live code |
|---|---|---|---|---|
| AI_PAUSED | production | plain | ok | yes |
| AI_TEST_SPEND_CAP_USD | production | encrypted | ok | yes |
| AI_TEST_SPEND_ID | production | encrypted | ok | yes |
| ANAM_API_KEY | production | sensitive | sensitive: cannot be read | yes |
| ANAM_AVATAR_ID | production | encrypted | ok | yes |
| ANAM_VOICE_ID_AR | production | encrypted | ok | yes |
| ANAM_VOICE_ID_EN | production | encrypted | ok | yes |
| ANTHROPIC_API_KEY | production | sensitive | sensitive: cannot be read | yes |
| API_DOCS_PASSWORD | production | sensitive | sensitive: cannot be read | yes |
| APP_URL | production | plain | ok | yes |
| CORS_ALLOWED_ORIGINS | production | plain | ok | yes |
| CRON_SECRET | production | sensitive | sensitive: cannot be read | yes |
| DEMO_MODE_ENABLED | production | encrypted | ok | yes |
| EMAIL_SENDER | production | plain | ok | yes |
| EMAIL_SUBJECT_PREFIX | production | encrypted | ok | yes |
| ENARA_ENGINE_V2 | production | plain | **unknown features: esl5** | yes |
| ENARA_STAGING | production | encrypted | ok | yes |
| ENROLLMENT_DUAL_WRITE | production | plain | ok | yes |
| ENROLLMENT_GROUP_ARCHIVE | production | plain | ok | yes |
| ENROLLMENT_MULTI_CLASS | production | plain | ok | yes |
| ENROLLMENT_READ_FROM | production | plain | ok | yes |
| ENROLLMENT_SHADOW | production | plain | ok | yes |
| ENROLLMENT_STUDENT_ARCHIVE | production | plain | ok | yes |
| FRONTEND_URL | production | plain | ok | yes |
| GRADE_LEDGER_ENABLED | production | plain | ok | yes |
| INGEST_HMAC_SECRET | production | sensitive | sensitive: cannot be read | yes |
| JWT_EXPIRES_IN | production | encrypted | ok | yes |
| JWT_SECRET | production | sensitive | sensitive: cannot be read | yes |
| LMS_DEEP_LINKING_ENABLED | production | plain | ok | yes |
| LMS_EMAILS_ENABLED | production | plain | ok | yes |
| LMS_GRADE_PASSBACK_ENABLED | production | plain | ok | yes |
| LMS_KEK | production | sensitive | sensitive: cannot be read | yes |
| LMS_LTI_ENABLED | production | plain | ok | yes |
| LMS_NO_GRADE_ACTIVITIES_ENABLED | production | plain | ok | yes |
| LMS_OPS_EMAILS | production | encrypted | ok | yes |
| LMS_ROSTER_SYNC_ENABLED | production | plain | ok | yes |
| LMS_TOOL_BASE_URL | production | plain | ok | yes |
| MAINTENANCE_CI_TOKEN | production | sensitive | sensitive: cannot be read | yes |
| MAINTENANCE_ENDPOINTS_ENABLED | production | plain | ok | yes |
| MAINTENANCE_TOKEN | production | sensitive | sensitive: cannot be read | yes |
| MONGODB_URI | production | sensitive | sensitive: cannot be read | yes |
| NODE_ENV | production | encrypted | ok | yes |
| PARENT_ALL_SUBJECTS_ENABLED | production | plain | ok | yes |
| PARENT_CODE_SIGNUP_ENABLED | production | plain | ok | yes |
| PARENT_CODE_TOOLS_ENABLED | production | plain | ok | yes |
| PARENT_CSV_INVITES_ENABLED | production | plain | ok | yes |
| PARENT_EMAIL_SIGNIN_ENABLED | production | plain | ok | yes |
| PARENT_EMAILS_ENABLED | production | plain | ok | yes |
| PARENT_GRADES_AFTER_REVIEW_ENABLED | production | plain | ok | yes |
| PARENT_SETTINGS_ENABLED | production | plain | ok | yes |
| R2_ACCESS_KEY_ID | production | sensitive | sensitive: cannot be read | yes |
| R2_ACCOUNT_ID | production | sensitive | sensitive: cannot be read | yes |
| R2_BUCKET | production | encrypted | ok | yes |
| R2_SECRET_ACCESS_KEY | production | sensitive | sensitive: cannot be read | yes |
| REGISTRATION_INVITE_ONLY | production | encrypted | ok | yes |
| REMINDER_TEST_RECIPIENT | production | encrypted | ok | yes |
| REMINDERS_ENABLED | production | encrypted | ok | yes |
| RESEND_API_KEY | production | sensitive | sensitive: cannot be read | yes |
| RUN_MIGRATIONS_ON_START | production | encrypted | ok | yes |
| SEED_USER_PASSWORD | production | sensitive | sensitive: cannot be read | yes |
| SERVE_LOCAL_UPLOADS | production | encrypted | ok | yes |
| TRUST_PROXY | production | encrypted | ok | yes |
| TUTOR_LLM_API_KEY | production | sensitive | sensitive: cannot be read | yes |
| TUTOR_LLM_ENDPOINT | production | plain | ok | yes |
| TUTOR_LLM_MODEL | production | plain | ok | yes |
| TUTOR_LLM_PROVIDER | production | plain | ok | yes |

Read by the live code but not set in Vercel (most are optional with a default; listed for review): ANTHROPIC_API_KEY_FALLBACK, ANTHROPIC_BASE_URL, ANTHROPIC_FALLBACK_MODEL, ANTHROPIC_INTENT_MODEL, ANTHROPIC_TUTOR_MODEL, AVATAR_API_ENDPOINT, AVATAR_API_KEY, AVATAR_MODEL_ID, AVATAR_QUALITY, AVATAR_VOICE_ID, BACKEND_URL, BENCH_AUTHORIZED_BY, BENCH_PROBE, DEMO_MONTHLY_CAP_USD, ENARA_API_KEY, ENARA_EC_CHECK, ENARA_RESEARCH_ABLATE, ENARA_RESEARCH_IMPROVE, GEMINI_API_KEY, GITHUB_STEP_SUMMARY, HYBRID_LAILA_APPROVED_RUN, LMS_TEST_PASSWORD_FILE, MAINTENANCE_TOKEN_FILE, RENDER_EXTERNAL_URL, SEED_ADMIN_PASSWORD, SEED_INSTITUTION_ID, SEED_STUDENT_PASSWORD, SOURCE_MONGODB_URI, TARGET_MONGODB_URI, TUTOR_LLM_GRADE_REASONING, TUTOR_LLM_PRICE_IN, TUTOR_LLM_PRICE_OUT, TUTOR_LLM_WARM_MIN, VITE_API_URL

Running site: lms-test.enara.app/ready → 200 mongo=ok postgres=not_configured r2=configured anthropic=configured elevenlabs=not_configured anam=configured aiTestSpendCap=set anthropicKey=rejected anthropicFallbackKey=not_configured anthropicFallbackModel=not_set

## enara-staging-alpha (test.enara.app)
Live code: commit 894f3ee7

| Variable | Targets | Type | Value format | Read by live code |
|---|---|---|---|---|
| AI_PAUSED | production | encrypted | ok | yes |
| AI_TEST_SPEND_CAP_USD | production | encrypted | ok | yes |
| AI_TEST_SPEND_ID | production | encrypted | ok | yes |
| ANAM_API_KEY | production | sensitive | sensitive: cannot be read | yes |
| ANAM_AVATAR_ID | production | encrypted | ok | yes |
| ANAM_VOICE_ID_AR | production | encrypted | ok | yes |
| ANAM_VOICE_ID_EN | production | encrypted | ok | yes |
| ANTHROPIC_API_KEY | production | encrypted | ok | yes |
| API_DOCS_PASSWORD | production | encrypted | ok | yes |
| APP_URL | production | encrypted | ok | yes |
| CORS_ALLOWED_ORIGINS | production | encrypted | ok | yes |
| CRON_SECRET | production | encrypted | ok | yes |
| DEMO_MODE_ENABLED | production | encrypted | ok | yes |
| ELEVENLABS_API_KEY | production | sensitive | sensitive: cannot be read | yes |
| ENARA_STAGING | production | encrypted | ok | yes |
| FRONTEND_URL | production | encrypted | ok | yes |
| GOOGLE_CLIENT_ID | production | sensitive | sensitive: cannot be read | yes |
| INGEST_HMAC_SECRET | production | encrypted | ok | yes |
| JWT_EXPIRES_IN | production | encrypted | ok | yes |
| JWT_SECRET | production | encrypted | ok | yes |
| LMS_KEK | production | sensitive | sensitive: cannot be read | **not read by the live code** |
| LMS_TOOL_BASE_URL | production | plain | ok | **not read by the live code** |
| MONGODB_URI | production | sensitive | sensitive: cannot be read | yes |
| NODE_ENV | production | encrypted | ok | yes |
| R2_ACCESS_KEY_ID | production | sensitive | sensitive: cannot be read | yes |
| R2_ACCOUNT_ID | production | sensitive | sensitive: cannot be read | yes |
| R2_BUCKET | production | encrypted | ok | yes |
| R2_SECRET_ACCESS_KEY | production | sensitive | sensitive: cannot be read | yes |
| REGISTRATION_INVITE_ONLY | production | encrypted | ok | yes |
| REMINDERS_ENABLED | production | encrypted | ok | yes |
| RESEND_API_KEY | production | sensitive | sensitive: cannot be read | yes |
| RUN_MIGRATIONS_ON_START | production | encrypted | ok | yes |
| SERVE_LOCAL_UPLOADS | production | encrypted | ok | yes |
| TRUST_PROXY | production | encrypted | ok | yes |

Read by the live code but not set in Vercel (most are optional with a default; listed for review): ANTHROPIC_BASE_URL, ANTHROPIC_INTENT_MODEL, ANTHROPIC_TUTOR_MODEL, AVATAR_API_ENDPOINT, AVATAR_API_KEY, AVATAR_MODEL_ID, AVATAR_QUALITY, AVATAR_VOICE_ID, BACKEND_URL, BENCH_PROBE, DEMO_MONTHLY_CAP_USD, ENARA_API_KEY, ENARA_ENGINE_V2, ENARA_RESEARCH_ABLATE, ENARA_RESEARCH_IMPROVE, GEMINI_API_KEY, HYBRID_LAILA_APPROVED_RUN, RENDER_EXTERNAL_URL, SEED_ADMIN_PASSWORD, SEED_INSTITUTION_ID, SEED_STUDENT_PASSWORD, VITE_API_URL

Running site: test.enara.app/ready → 503 mongo=unavailable postgres=not_configured r2=configured anthropic=configured elevenlabs=configured anam=configured aiTestSpendCap=set

## lms-test health check
```
site up, mongo ok, 1 tool key(s) published
::warning::ALERT: anthropicKey on lms-test is rejected (tutor replies fail)
setup ok: platform lmsp_105b170f990d44549e980425c48a9dd3, deployment lmsd_ad11c2524cc7403eb51e92fa59630967, assessment LT-AS-HEALTH-CHECK
ok   setup_present 87ms 
ok   ready 74ms 
ok   tool_jwks 38ms 
ok   mock_jwks 509ms 
ok   teacher_lti_login 436ms 
ok   teacher_mock_auth 378ms 
ok   teacher_lti_launch 1647ms 
ok   teacher_launch_exchange 557ms 
ok   lti_login 383ms 
ok   mock_auth 377ms 
ok   lti_launch 2154ms 
ok   launch_exchange 991ms 
ok   lms_records 348ms 
ok   nrps_roster 2763ms 
ok   keep_assignment_open 87ms 
ok   submit_attempt 174ms attempts_used_resend_last
ok   grade_send 3640ms 
ok   grade_received 87ms 
```
