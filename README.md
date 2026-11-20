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
| `PATCH/DELETE` | `/projects/:id` | Admin |
| `POST` | `/projects/:id/archive` | Admin |
| `GET` | `/tasks`, `/tasks/:id` | Admin or authorised project member |
| `POST/PATCH/DELETE` | `/tasks[/:id]` | Admin |
| `PATCH` | `/tasks/:id/status` | Admin or task assignee; body is exactly `{ "status": "..." }` |
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

The backend suite contains 7 passing workflow tests covering admin-only project/task operations, membership validation, user scope, own-status-only updates, progress, activity, onboarding, session/logout, and Origin protection.

With Docker services healthy:

```powershell
$env:E2E_ADMIN_EMAIL = (Get-Content secrets/admin_email.txt -Raw).Trim()
$env:E2E_ADMIN_PASSWORD = (Get-Content secrets/admin_password.txt -Raw).Trim()
npx playwright install chromium
npm run test:e2e
```

The Docker-hosted Playwright suite contains two journeys: account/verification/reset/onboarding, and the complete admin allocation workflow through 50% project progress.

## Database and deployment notes

SQLite is suitable for this single backend replica. The named Docker volume persists it across container recreation. Legacy personal tasks are preserved but deliberately excluded from the regular-user allocation workspace; migrate them explicitly rather than silently deleting them.

The repository also retains optional Netlify/PostgreSQL support. The additive migration `0003_add_project_archived_at.sql` keeps its schema aligned with the SQLite archive field. For multi-instance Azure or other production scaling, migrate fully to a managed PostgreSQL service.

## Remaining limitations

- The current calendar is a deadline list, not a full month/week grid.
- Task priority is currently Low, Medium, or High; the existing SQLite constraint does not yet include Urgent.
- Comments, subtasks, richer notifications, milestones, dependencies, recurring tasks, time tracking, Gantt, export, Docker Hub release publishing, and Azure deployment remain future work.
