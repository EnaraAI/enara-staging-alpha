# Runtime errors — 4Level1

**4Level1-attributable server errors (5xx): none found** in the retained window (11:59:09–12:03:24 UTC). All 56 attributed requests returned 200, 204, 403, 404 or 409.

Error-level log entries: none. All 97 retained rows are level `info`. Non-request log lines were `mongodb_connected` (4) and `postgres_disabled_no_database_url` (4), both cold-start notices.

## Appendix — unattributed staging requests (not 4Level1 events)

These 35 requests carry no institution. 6 more belonged to another school and are counted only. All are on the current deployment, 11:57–12:07 UTC.

| Host | Request | Status | Count | Note |
|---|---|---|---|---|
| unpromoted build URL | `POST /api/auth/login` | 200 | 12 | Agent smoke logins |
| unpromoted build URL | various API requests without token | 401 | 9 | First smoke run sent no token (script bug, corrected); also docs without a password |
| unpromoted build URL | `GET /uploads/does-not-exist.pdf` | 403 | 2 | Unsigned link refused |
| unpromoted build URL | `GET /health`, `/ready` | 200 | 2 | Smoke |
| test.enara.app | `POST /api/auth/login` | 200 | 1 | Probably the interactive teacher session's sign-in (not provable) |
| test.enara.app / alias | `/health`, `/ready`, `/api/docs/ui` | 200 / 401 | 9 | Post-promotion checks |

No 5xx in the appendix either.
