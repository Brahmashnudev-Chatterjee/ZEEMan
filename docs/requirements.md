# ZeeMan product requirements

## Product scope

ZeeMan is a vanilla JavaScript, Express, and SQLite project-management SaaS with two global roles: `admin` and `user`. It supports private tasks, shared project tasks, project ownership, project membership, task lifecycle management, and containerized local deployment.

## Delivery phases

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Architecture, permissions, schema, API design | Documented |
| 2 | Public website, responsive navigation, legal/contact pages | Complete: public routes, responsive navigation, legal pages, and persisted contact form verified |
| 3 | Authentication, setup, onboarding, reset/verification flows | Complete and locally validated: reset/verification UI, resend cooldown, five-step onboarding, API regression tests, and Docker-hosted Playwright journeys |
| 4 | Application shell and dashboards | Core dashboard complete |
| 5 | Users, projects, memberships and permissions | MVP complete |
| 6 | Tasks, search, filters, categories and assignments | MVP complete |
| 7 | Kanban, calendar, deadlines | MVP complete |
| 8 | Teams, comments, subtasks, notifications | Schema foundations complete; UI/API planned |
| 9 | Reports, settings, exports and advanced analytics | Core analytics complete; advanced reporting planned |
| 10–12 | Docker, Docker Hub, Azure | Docker complete; Hub/Azure release work planned |
| 13 | Browser QA, accessibility, documentation and release evidence | Planned |

## Architectural decisions

- Keep vanilla HTML/CSS/JavaScript and Express; no frontend framework is introduced.
- Keep SQLite with one backend replica. PostgreSQL is the migration path for multi-instance Azure production.
- Browser authentication is an HttpOnly JWT cookie plus database-backed session record; no token is stored in localStorage.
- A project owner is a project-level permission, not a global role. Administrators bypass project scope; members never do.
- Phase 2/3 database tables can be migrated before their UI is exposed, but a feature is documented as complete only after API and interface tests exist.
