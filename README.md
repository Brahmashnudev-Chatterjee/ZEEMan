# ZeeMan — Admin-Controlled Project & Task Management

ZeeMan is a responsive project-management application built with HTML, CSS, vanilla JavaScript, Node.js, Express, SQLite, Docker, and Docker Compose. Its workflow is intentionally admin-controlled:

```text
Admin creates project → adds members → creates project tasks → assigns members
→ members execute assigned tasks and update status → admin monitors progress
```

## What is implemented

- Cookie-based JWT authentication, server-side session revocation, bcrypt passwords, login, registration, logout, password reset, and email verification.
- Two global roles: `admin` and `user`; public registration only creates regular users.
- Admin project CRUD, archive action, member allocation, task CRUD, task reassignment, priority/date/status editing, Kanban, calendar/deadline list, activity history, analytics, and user management.
- User dashboard, allocated-project list/detail, My Tasks, task detail, Kanban, and calendar/deadline list.
- Phase 5 collaboration: task comments and threaded replies, member-only @mentions, private attachments, admin-managed subtasks/checklists, task activity timelines, and persisted collaboration notifications in both Admin and Employee task details.
- Phase 6 Stage 1 milestones: Admin-created, editable and archive-safe project milestones; project-task linking; calculated milestone progress; deadline/overdue indicators; milestone activity and member notifications; and read-only milestone visibility for allocated employees.
- Backend membership checks: users see only allocated projects; they can see project tasks but may PATCH only the `status` of a task assigned to them.
- Allocation onboarding. A regular user completes a profile then waits for an administrator allocation; onboarding never creates projects or tasks.
- Dockerized Nginx frontend, private Express backend, named persistent SQLite volume, bridge network, health checks, and Docker secrets.

## Permission model

| Capability | Admin | Regular user |
| --- | --- | --- |
| Create/edit/archive/delete project | Yes | No |
| Add/remove project members | Yes | No |
| Create/edit/delete/reassign task | Yes | No |
| Change task priority/dates/project | Yes | No |
| View allocated project and its tasks | Yes | Yes |
| Change task status | Any task | Own assigned task only |
| View unrelated project/task | Yes | No (404) |

The API enforces these rules. The client hides unavailable controls only for usability.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Public website |
| `/login`, `/register` | Authentication |
| `/forgot-password`, `/reset-password`, `/verify-email` | Account recovery/verification |
| `/onboarding` | Regular-user allocation onboarding |
| `/admin/dashboard`, `/admin/projects/:id` | Admin control center |
| `/admin/kanban`, `/admin/calendar` | Admin-wide project work views |
| `/user/dashboard`, `/user/projects/:id` | Allocated project workspace |
| `/user/my-tasks`, `/user/tasks/:id` | A user's assigned work |

## API summary

All APIs live under `/api` and use the HttpOnly session cookie.

| Method | Endpoint | Access |
| --- | --- | --- |
| `GET` | `/health` | Public |
| `POST` | `/auth/register`, `/auth/login` | Public |
| `POST` | `/auth/logout` | Authenticated |
| `GET` | `/projects` | Admin: all; user: allocated |
| `POST` | `/projects` | Admin |
| `GET` | `/projects/:id`, `/projects/:id/tasks`, `/projects/:id/members` | Admin or allocated member |
| `POST/DELETE` | `/projects/:id/members[/:userId]` | Admin |
| `GET` | `/projects/:id/milestones`, `/projects/:id/milestones/:milestoneId`, `/projects/:id/progress` | Admin or allocated member |
| `POST/PATCH/DELETE` | `/projects/:id/milestones[/:milestoneId]` | Admin |
| `POST/DELETE` | `/projects/:id/milestones/:milestoneId/tasks[/:taskId]` | Admin |
| `PATCH/DELETE` | `/projects/:id` | Admin |
| `POST` | `/projects/:id/archive` | Admin |
| `GET` | `/tasks`, `/tasks/:id` | Admin or authorised project member |
| `POST/PATCH/DELETE` | `/tasks[/:id]` | Admin |
| `PATCH` | `/tasks/:id/status` | Admin or task assignee; body is exactly `{ "status": "..." }` |
| `GET/POST` | `/tasks/:id/comments` | Authorised project member; create comments/replies and structured mentions |
| `PATCH/DELETE` | `/comments/:id` | Comment author; Admin may moderate any project comment |
| `GET` | `/tasks/:id/mentionable-users` | Authorised project member; active project members only |
| `GET/POST` | `/tasks/:id/attachments` | Authorised project member; private validated file upload/list |
| `GET/DELETE` | `/attachments/:id/download`, `/attachments/:id` | Authorised member download; uploader or Admin deletion |
| `GET/POST` | `/tasks/:id/subtasks` | Member read; Admin create/assign |
| `PATCH/DELETE` | `/subtasks/:id/status`, `/subtasks/:id` | Assignee/Admin status; Admin deletion |
| `GET/POST` | `/tasks/:id/checklists` | Member read; Admin create |
| `PATCH` | `/checklist-items/:id/completion` | Assigned checklist owner, parent-task assignee, or Admin |
| `GET` | `/tasks/:id/activity` | Authorised project member |
| `GET` | `/analytics/user`, `/admin/analytics` | User own metrics / admin global metrics |

## Project structure

```text
ZeeMan/
├── frontend/
│   ├── admin/dashboard.html, user/dashboard.html
│   ├── js/auth.js, js/workflow.js, js/public.js
│   ├── css/
│   ├── assets/zeeman-logo.png
│   └── nginx.conf
├── backend/
│   ├── src/controllers/       # auth, project, task, admin, onboarding
│   ├── src/middleware/auth.js # JWT/session/RBAC enforcement
│   ├── src/config/database.js # SQLite schema and additive migrations
│   └── tests/workflow.test.js
├── e2e/admin-workflow.spec.js
├── docs/
├── compose.yaml
└── netlify/database/migrations/
```

## Run locally with Docker

```powershell
npm install
npm run docker:secrets
docker compose up -d --build
docker compose ps
```

Open http://localhost:8080. The seeded administrator comes from local Docker secret files created by `npm run docker:secrets`; do not commit them.

```powershell
docker compose logs -f
docker compose down
```

`docker compose down` preserves the named `zeeman-data` volume. Do not use `docker compose down -v` unless you deliberately intend to delete local data.

## Environment

Copy `.env.example` for non-Docker local development. Required production values include:

| Variable | Purpose |
| --- | --- |
| `DATABASE_PATH` | SQLite database location |
| `APP_ORIGIN` | Exact browser origin permitted to write APIs |
| `JWT_SECRET` / `JWT_SECRET_FILE` | JWT signing secret |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (or `*_FILE`) | Initial admin bootstrap |
| `COOKIE_SECURE` | `true` for HTTPS |
| `EMAIL_TRANSPORT` | `console` locally or `smtp` in production |
| `SMTP_*`, `EMAIL_FROM` | SMTP configuration |

Console email mode is explicitly for local development and produces local verification/reset links. Use SMTP in production and never publish reset links, SMTP credentials, Docker secret files, or `.env`.

## Test

```powershell
npm test
```

The backend suite contains 12 passing workflow tests covering authentication, Origin protection, membership validation, employee field restrictions, status ownership, collaboration APIs, private attachments, notifications, onboarding, Admin-only operations, and milestone/project-progress security.

With Docker services healthy:

```powershell
$env:E2E_ADMIN_EMAIL = (Get-Content secrets/admin_email.txt -Raw).Trim()
$env:E2E_ADMIN_PASSWORD = (Get-Content secrets/admin_password.txt -Raw).Trim()
npx playwright install chromium
npm run test:e2e
```

The Docker-hosted Playwright suite covers account/verification/reset/onboarding, the Admin allocation flow, milestone creation/linking/read-only employee visibility/progress synchronization, all Admin Control Center modules, and the cross-portal Employee collaboration flow. Tests create isolated records and clean them up. The final local Phase 6 Stage 1 run completed with 4 passing browser tests and no skips.

## Database and deployment notes

SQLite is suitable for this single backend replica. The named Docker volume persists it across container recreation. Legacy personal tasks are preserved but deliberately excluded from the regular-user allocation workspace; migrate them explicitly rather than silently deleting them.

The repository also retains optional Netlify/PostgreSQL support. Apply every provisioned migration, including `0005_task_collaboration.sql` and `0006_milestones.sql`, before enabling collaboration/milestones in PostgreSQL. For multi-instance Azure or other production scaling, migrate fully to a managed PostgreSQL service.

## Remaining limitations

- Local/Docker attachments are private files below `UPLOAD_PATH` (or the database directory's `uploads/` folder) and persist only when that path is mounted on persistent storage. The Compose data volume provides this locally. The API accepts base64 transport overhead but still enforces a 5 MB decoded-file limit and returns HTTP 413 for oversized requests.
- Netlify Function storage is ephemeral. Production attachments require a configured private object-storage adapter, a bucket/container, service credentials injected as environment variables, and signed/authorised download handling. Uploads must not be considered production-ready on Netlify until that adapter is implemented and tested.
- Subtasks currently have title, description, assignee, and status. Priority and due-date fields are deliberately not fabricated because the current schema does not contain them.
- Dependencies, recurring tasks, time tracking, and Gantt views remain later phases. Milestone records are implemented; their task progress is calculated dynamically and is not a historical snapshot.

## Admin Control Center (current implementation)

The Admin Control Center is available at `/admin/dashboard` and is entirely backed by live API data. Its ten working modules are Dashboard, Projects, Tasks, Users, Kanban, Calendar, Reports, Notifications, Activity Logs, and Settings/Profile.

| Module | Implemented capabilities |
| --- | --- |
| Dashboard | Live user/project/task counts, completion rate, recent tasks, deadline groups, activity, status/workload charts, linked quick actions |
| Projects | Create, edit, archive, restore, delete, membership allocation, details and activity |
| Tasks | Project-bound creation, member-only assignment, edit/reassign/delete, filters, urgent/on-hold values |
| Users | Search, workload/profile view, secure account creation, activation/deactivation and deletion safeguards |
| Kanban | Four-column drag/drop board plus select-based keyboard alternative, persisted status updates |
| Calendar | Month/week/day views, navigation and project/user/priority/status filters |
| Reports | Filtered project/task/workload data and filtered Admin-only CSV export |
| Notifications | Per-user inbox, unread count, read/unread controls, mark-all-read and deep links |
| Activity | Persisted audit events, filtering and detail dialog |
| Settings/Profile | Persisted defaults, administrator profile/password, and logout-other-sessions |

New and verified Admin endpoints include:

```text
GET  /api/admin/dashboard
GET  /api/admin/reports
GET  /api/admin/reports/export.csv
GET/PATCH/POST /api/admin/notifications[/:id]
GET  /api/admin/activity-logs[/:id]
GET/PUT /api/admin/settings
PUT  /api/admin/profile
POST /api/admin/sessions/logout-others
POST /api/projects/:id/restore
```

The current automated suite validates dashboard/report/CSV data, user workload, notification handling, settings persistence and that regular users are denied Admin dashboard/report APIs, in addition to the existing allocation workflow. Docker/Nginx is configured as one trusted reverse-proxy hop so rate limiting operates correctly for browser requests.

`netlify/database/migrations/0004_admin_dashboard.sql` is an additive PostgreSQL companion migration for the new admin metadata. SQLite remains the local and Docker default.

## Employee Workspace

The Employee Workspace uses the same project, task, notification, activity, and session records as the Admin Control Center; it does not duplicate data. Employees have Dashboard, My Projects, My Tasks, Kanban, Calendar, My Progress, Notifications, My Profile, and Settings & Security routes under `/user`.

Employee-only additions are `GET /api/reports/user`, `GET/PATCH /api/notifications[/:id]`, `POST /api/notifications/read-all`, `PUT /api/preferences`, and `POST /api/sessions/logout-others`. All are scoped to the authenticated employee. Employees cannot access Admin APIs or modify project/task fields beyond the status of their own assignment. See [Employee Workspace audit](docs/employee-dashboard-audit.md).
