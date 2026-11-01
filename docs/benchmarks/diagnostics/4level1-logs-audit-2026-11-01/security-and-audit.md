# Security and audit — 4Level1

## Persisted audit trail (`audit_events`)

**Not accessed.** MongoDB was unavailable in this session. The release writes audit rows for:
- permission changes;
- user, institution and AI-control changes;
- feature flags and learning settings;
- document delete and retry;
- assignment creation and release-policy changes.

The retained request logs show **no** request to any of those routes by a 4Level1 actor in the window. So there is no matching retained evidence of an admin change in that period.

## Recorded access denials (4Level1-attributed)

| Time (UTC) | Actor | Request | Outcome | Interpretation |
|---|---|---|---|---|
| 11:59:09 | U01 (academic manager, inferred) | `POST /api/analytics/assistant` | 403 | Agent smoke check: assistant refused for a non-admin role (expected) |
| 11:59:15 | U03 (teacher) | `GET /api/workspace/users` | 403 | Agent smoke check: teacher refused the People page (expected) |
| 11:59:22 | U03 (teacher) | `GET /api/curriculums/:id` (another school's) | 404 | Agent smoke check: cross-tenant read refused (expected) |
| 12:02–12:03 | U03 (teacher, interactive) | `DELETE /api/assessments/:id` | 409 | Business-rule conflict, not a security denial |

These are **recorded denials from deliberate verification, not attacks**. No suspicious pattern was observed: no repeated failures, enumeration or bursts.

## Session events

- **Sign-in:** the interactive session's login request appears unauthenticated (login requests carry no institution). It sits in the unattributed appendix: `test.enara.app POST /api/auth/login 200`, 1 event.
- **Sign-out:** at 12:03:24 UTC (204). Logout revokes that account's open tokens.
- **Tour completion:** by the teacher (self-only preference).

## Document access

No original-file download (`/uploads/…`) by a 4Level1 actor appears in the window. Two unauthenticated `/uploads/does-not-exist.pdf` requests returned 403; these were agent checks.
