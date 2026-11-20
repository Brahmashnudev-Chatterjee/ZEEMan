# Admin-controlled workflow testing evidence

Validated locally on 2026-11-20.

| Check | Result | Evidence |
| --- | --- | --- |
| Backend workflow suite | Passed | `npm test`: 7 passed, 0 failed |
| Auth/session/Origin protection | Passed | Valid and invalid login, logout revocation, and unapproved write origin were tested |
| Admin project enforcement | Passed | Regular user project creation returned 403; admin project creation succeeded |
| Member-constrained assignment | Passed | Task assignment to a non-member returned 400; assignments to members succeeded |
| User project scope | Passed | Allocated user received project/tasks; unrelated user received 404 |
| Status-only task update | Passed | Own status PATCH succeeded; another user's status returned 403; extra priority field returned 400 |
| Progress and activity | Passed | One completed of two project tasks produced 50% progress and a completion activity record |
| Allocation onboarding | Passed | Profile/completion persisted; old project/task onboarding routes are unavailable to regular users |
| Docker health | Passed | Backend and frontend containers reported healthy; proxied `/api/health` returned 200 |
| Playwright account journey | Passed | Public pages, invalid login, registration, verification resend/confirmation, onboarding, reset, login, and logout passed |
| Playwright allocation journey | Passed | Admin allocated two users, created two tasks, users updated their own work, and admin observed 50% progress |

The browser suite uses unique test accounts and leaves its generated data in the local named Docker volume. It does not delete existing records.
