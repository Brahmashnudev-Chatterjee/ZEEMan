# Phase 3 testing evidence

Validated locally on 2026-11-20.

| Check | Result | Evidence |
| --- | --- | --- |
| Backend regression suite | Passed | `npm test`: 9 tests passed, 0 failed |
| CSRF / Origin protection | Passed | State-changing request from an unapproved `Origin` returned 403 |
| Password reset security | Passed | Expired/reused token rejected; successful reset revoked old sessions |
| Email verification security | Passed | Stored token is hashed; expired and reused tokens returned 400 |
| Role and ownership isolation | Passed | Regular users received 403 for admin APIs and 404 for unrelated tasks/projects |
| Onboarding persistence | Passed | Profile, first project, and first task saved; revisiting updated one record instead of creating duplicates |
| Docker health | Passed | Backend and Nginx frontend both reported `healthy`; proxied `/api/health` returned 200 |
| Playwright browser suite | Passed | 5 Docker-hosted Chromium journeys passed |
| Browser persistence | Passed | Kanban status remained in `In progress` after browser refresh |
| Browser account flows | Passed | Registration, verification resend/confirmation, onboarding, password reset, login, logout, and admin redirect passed |

The browser test suite creates isolated account emails and leaves only those test records in the local named Docker volume. It does not delete or rewrite existing user data.
