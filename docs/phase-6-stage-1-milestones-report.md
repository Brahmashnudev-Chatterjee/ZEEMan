# Phase 6 Stage 1 — Milestones & Project Progress Management

Date: 2026-11-22

## Delivered

- Additive SQLite schema upgrade and PostgreSQL migration `0006_milestones.sql`.
- Admin-only milestone creation, editing, status changes, archive-safe deletion, task linking/unlinking, activity records, and member notifications.
- Membership-protected milestone list/detail and project-progress APIs.
- Dynamic milestone progress from linked parent tasks. Empty milestones stay at `0%`; milestone workflow status is intentionally separate from calculated task progress.
- Dynamic project-progress endpoint showing active parent-task progress, milestone counts, overdue milestones, and average milestone task progress.
- Responsive Admin project-detail milestone panel with loading/error/empty states and real API-backed forms.
- Responsive employee read-only milestone cards within allocated project details. Employees can open linked tasks but cannot mutate milestones.

## Authorisation matrix

| Operation | Admin | Allocated employee | Unrelated employee |
| --- | --- | --- | --- |
| Read milestones/progress | Yes | Yes | 404 |
| Create/edit/archive milestone | Yes | 403 | 403/404 |
| Link/unlink task | Yes | 403 | 403/404 |
| Update assigned parent task status | Yes | Own task only | 404/403 |

## Progress rules

- Milestone task progress: completed linked parent tasks ÷ all linked parent tasks.
- Project endpoint task progress: completed active parent tasks ÷ active parent tasks; it does not double-count a task linked to a milestone.
- A milestone is overdue only if non-completed, non-archived, and its due date is before the current UTC date.
- Existing project-detail/dashboard progress semantics were not silently changed; `/api/projects/:id/progress` is the explicit Stage 1 milestone-aware summary.

## Local verification

- Backend: `npm test --prefix backend` — **12 passed, 0 failed, 0 skipped**.
- Browser: 4 Docker-hosted Playwright tests — **4 passed, 0 failed, 0 skipped**.
- Docker: frontend and backend rebuilt and reported healthy; an isolated milestone fixture survived a backend restart and was then cleaned up.
- PostgreSQL: migration syntax/schema reviewed, but not run against a live provisioned PostgreSQL/Netlify Database instance.

## Production prerequisite

Provision PostgreSQL, apply migrations in numeric order through `0006_milestones.sql`, and verify the production connection before enabling the feature in a multi-instance deployment. No database URL or credentials are stored in this repository.
