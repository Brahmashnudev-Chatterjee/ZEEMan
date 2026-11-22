# Phase 5 final testing evidence

Date: 2026-11-22

## Automated backend suite

Command: `npm test --prefix backend`

Result: **11 passed, 0 failed, 0 skipped**.

The isolated SQLite suite verifies authentication/session revocation/Origin protection, Admin project and task controls, project membership boundaries, employee status-only restrictions, analytics/activity persistence, Phase 5 comments/replies/mentions, subtask/checklist authorisation, private attachment upload/download/delete controls, and allocation onboarding.

## Browser suite

Command: `npm run test:e2e -- --timeout=25000`

Result: **4 passed, 0 failed, 0 skipped**.

- Public authentication, verification, reset, and allocation onboarding.
- Browser-only Admin project allocation and two independent employee assignments. Each user saw only their own My Tasks record and persisted an allowed status update.
- Admin Control Center route smoke coverage.
- Cross-portal collaboration: Admin-created comment/mention/file/subtask/checklist; Employee reply/edit/upload/download/status updates; Admin visibility; notification presence; and denied employee priority/other-user attachment operations.

Each collaboration and allocation browser test uses unique fixture data and performs cleanup of the created project and users.

## UI and syntax checks

`node --check frontend/js/admin-console.js`, `node --check frontend/js/admin-task-collaboration.js`, `node --check frontend/js/workflow.js`, and `node --check frontend/js/user-task-collaboration.js` passed. `git diff --check` passed without whitespace errors.

## Docker and persistence checks

`docker compose up -d --build` rebuilt both images. `docker compose ps` reported both `zeeman-backend-1` and `zeeman-frontend-1` as healthy. A subsequent backend restart retained the authenticated session and identical Admin dashboard project/task counts. The backend database and local attachment directory are under `/app/data`, which is backed by the named `zeeman-data` volume. Phase 5 data is persisted in SQLite rather than browser state.

## PostgreSQL / Netlify note

The Phase 5 PostgreSQL migration was statically reviewed. It was not executed because this workspace has no provisioned PostgreSQL or linked Netlify Database test environment. Netlify must provision/link its database and apply migrations before production collaboration data can be used.
