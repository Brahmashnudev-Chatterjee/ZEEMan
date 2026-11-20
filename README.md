# ZeeMan — Smart Task Manager

ZeeMan is a responsive role-based task manager built with HTML5, CSS3, vanilla JavaScript, Node.js, Express, and SQLite. It provides separate administrator and user dashboards with backend-enforced access control.

## Collaborative project MVP

- Projects with owners, deadlines, statuses, progress, and secure project membership.
- Private tasks plus shared project tasks, with membership checks enforced by Express and SQLite queries.
- Project-aware task assignment, Kanban, calendar, search, categories, dashboards, and analytics.
- Project membership creates in-app assignment/membership notifications and activity records.

Phase 2 delivers the public ZeeMan website and will next add comments, subtasks, and notification UI. Phase 3 will add milestones, dependencies, recurring tasks, time tracking, and Gantt planning.

## Public website

The public site is available at `/` with dedicated Features, How it works, About, Contact, Privacy, and Terms pages. The responsive navigation links to the existing secure sign-in and registration flows.

The contact form sends validated messages to `POST /api/contact`; submissions are stored in the SQLite database rather than shown as a dummy success state.

## Start locally

```powershell
npm install
npm run setup
npm start
```

Open `http://localhost:3000`. Setup creates local configuration, generates a JWT secret if needed, and provisions an administrator.

## Docker

ZeeMan uses Nginx, Express, a private `zeeman-network`, a persistent `zeeman-data` volume, and locally mounted Docker secrets.

```powershell
npm run docker:secrets
docker compose up -d --build
docker compose ps
```

Open `http://localhost:8080`. The backend stays private to the Compose network, while Nginx proxies browser API requests.

Use `docker compose down` to stop containers without deleting data. Avoid `docker compose down -v` unless you intentionally want to erase the SQLite database.

## Security

- bcrypt password hashes and 12-character password policy
- HttpOnly, SameSite=Strict cookie sessions with server-side revocation
- RBAC and SQL ownership checks
- Exact allowed-origin checks on API writes
- Helmet, parameterized SQL, rate-limited authentication, and Docker Secrets
- One-time, hashed password-reset and email-verification tokens with a one-hour expiry
- SMTP configuration through environment variables; local Compose uses an explicitly labelled console-only development mail transport

## Account recovery and onboarding

Use `/forgot-password` to request a reset link and `/reset-password?token=...` to choose a new password. In local Docker development, verification and reset URLs are emitted by the console transport; configure `EMAIL_TRANSPORT=smtp` and the `SMTP_*` variables before any public deployment.

New accounts are directed to `/onboarding`, where profile, first project, and first task records are saved without duplicating them when a step is revisited.

## Tests

```powershell
npm test
```

The test suite uses a temporary database and validates health, authentication, role boundaries, and task ownership.
