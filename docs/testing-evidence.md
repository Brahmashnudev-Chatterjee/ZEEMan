# Phase 6 Stage 1 testing evidence

Date: 2026-11-22

## Automated backend suite

Command: `npm test --prefix backend`

Result: **12 passed, 0 failed, 0 skipped**.

The isolated SQLite suite verifies authentication/session revocation/Origin protection, Admin project and task controls, project membership boundaries, employee status-only restrictions, analytics/activity persistence, Phase 5 collaboration controls, allocation onboarding, and Phase 6 milestone creation/edit/archive/link/unlink, cross-project linking denial, progress, overdue state, employee read-only access, and mutation denial.

## Browser suite

Command: `npm run test:e2e -- --timeout=25000`

Result: **4 passed, 0 failed, 0 skipped** (run as focused Docker-hosted commands to stay inside the local command timeout).

- Public authentication, verification, reset, and allocation onboarding.
- Browser-only Admin project allocation and two independent employee assignments. The same journey creates a milestone, links both tasks, verifies employee read-only milestone visibility and denied milestone creation, and verifies the Admin sees calculated 50% milestone task progress after employee updates.
- Admin Control Center route smoke coverage.
- Cross-portal collaboration: Admin-created comment/mention/file/subtask/checklist; Employee reply/edit/upload/download/status updates; Admin visibility; notification presence; and denied employee priority/other-user attachment operations.

Each collaboration and allocation browser test uses unique fixture data and performs cleanup of the created project and users.

## UI and syntax checks

`node --check backend/src/controllers/milestone.controller.js`, `node --check frontend/js/admin-milestones.js`, `node --check frontend/js/user-milestones.js`, and the existing dashboard/collaboration scripts passed. `git diff --check` passed without whitespace errors.

## Docker and persistence checks

`docker compose up -d --build` rebuilt both images. `docker compose ps` reported both `zeeman-backend-1` and `zeeman-frontend-1` as healthy. An isolated milestone fixture survived a real backend container restart, then was deleted and verified absent; SQLite data lives in the named `zeeman-data` volume.

## PostgreSQL / Netlify note

The Phase 5 PostgreSQL migration was statically reviewed. It was not executed because this workspace has no provisioned PostgreSQL or linked Netlify Database test environment. Netlify must provision/link its database and apply migrations before production collaboration data can be used.
