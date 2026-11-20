# Admin Control Center testing evidence

Date: 2026-11-21

## Automated backend coverage

`npm test` runs an isolated SQLite database suite. It verifies authentication and logout, Origin protection, Admin-only project/task creation, membership-bound assignments, user data isolation, own-status-only updates, persisted project progress, audit history, allocation-only onboarding, dashboard data, filtered report and CSV data, user workload, notifications, settings persistence, and Admin API denial for regular users.

## Docker checks

`docker compose up -d --build` rebuilt the Nginx frontend and Node backend. The backend health check reached `/api/health`; both containers became healthy. The backend is behind one Nginx proxy hop and Express is configured accordingly for rate limiting.

## Browser workflow

`npm run test:e2e` targets `http://localhost:8080` and covers public routes, registration, invalid login, email resend/verification, allocation onboarding, password reset, login/logout, and authenticated rendering of every Admin Control Center module. The complete allocation scenario is exercised deterministically in the isolated backend workflow suite; the older end-to-end duplicate remains explicitly skipped because persistent local demo data makes it timing-sensitive.

## Persistence

The Compose setup uses the named `zeeman-data` volume. Stopping/recreating containers without `-v` keeps SQLite records. Application preferences and task/project records are stored in that database, not in browser state.

## Deployment note

SQLite must remain single-writer/single-replica. The optional Netlify/PostgreSQL path has an additive `0004_admin_dashboard.sql` migration; it requires a provisioned production database and is not a substitute for local Docker SQLite.
