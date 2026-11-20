# ZeeMan — Smart Project & Task Manager

ZeeMan is a role-based project and task management application. The frontend uses HTML5, CSS3, and vanilla JavaScript. The backend is Node.js, Express, and SQLite. Nginx and Docker Compose run the application locally.

## What is built

- Public website: Home, Features, How it works, About, Contact, Privacy, and Terms.
- Separate Admin and User dashboards.
- Registration, login, logout, password change, JWT cookie sessions, and server-side session revocation.
- Admin/user role-based access control, protected APIs, and exact-origin protection for API writes.
- User, category, project, project-member, and task CRUD APIs.
- Private tasks and securely shared project tasks with backend membership checks.
- Task priorities, statuses, deadlines, search/filtering, Kanban updates, calendar, and core analytics.
- Password reset request/reset with one-time hashed tokens and session revocation.
- Email verification UI with resend cooldown, development/SMTP delivery feedback, and invalid/expired-link states.
- A responsive five-step onboarding wizard with profile, project, task, date validation, skip/back controls, and duplicate-safe persistence.
- SQLite persistence, Docker secrets, a private Docker network, Nginx proxying, and health checks.

## How it works

1. The public site at `/` links to `/login` and `/register`.
2. Public registration always creates a `user`; a browser payload cannot create an administrator.
3. Login issues an HttpOnly, SameSite=Strict JWT cookie linked to a session record in SQLite.
4. Every protected API call validates the JWT, session status, account status, role, and ownership/project membership.
5. Users access only their private tasks plus authorised shared-project tasks. Admins manage all records.
6. New users are sent to `/onboarding`; revisiting onboarding updates the saved onboarding project/task instead of duplicating them.
7. Nginx serves the frontend at port `8080` and proxies `/api/*` to the private Express backend.

## Architecture

```text
Browser → Nginx frontend container → Express backend container → SQLite database
          localhost:8080              private network             zeeman-data volume
```

## Project structure

```text
ZeeMan/
├── frontend/
│   ├── index.html, login.html
│   ├── admin/dashboard.html, user/dashboard.html
│   ├── assets/zeeman-logo.png
│   ├── css/styles.css
│   ├── js/public.js, js/app.js
│   ├── nginx.conf
│   └── Dockerfile
├── backend/
│   ├── src/
│   │   ├── config/                 # env and SQLite migrations
│   │   ├── controllers/            # auth, tasks, projects, admin, onboarding
│   │   ├── middleware/auth.js      # JWT/session/RBAC checks
│   │   ├── routes/index.js         # REST API
│   │   ├── services/email.service.js
│   │   └── app.js, server.js
│   ├── tests/health.test.js
│   └── Dockerfile
├── docs/
├── scripts/
├── compose.yaml
├── .env.example
└── README.md
```

## Run the application

### Docker (recommended)

```powershell
npm install
npm run docker:secrets
docker compose up -d --build
docker compose ps
```

Open http://localhost:8080.

```powershell
docker compose logs -f
docker compose down
```

`docker compose down` keeps the named `zeeman-data` volume. Do not run `docker compose down -v` unless you deliberately want to delete the database.

### Local Node development

```powershell
npm install
npm run setup
npm start
```

Open http://localhost:3000.

## Environment variables

Copy `.env.example` for local Node development. Docker uses local secret files for the JWT secret and initial administrator account.

| Variable | Purpose |
| --- | --- |
| `DATABASE_PATH` | SQLite location |
| `APP_ORIGIN` | Browser origin allowed to write to the API |
| `COOKIE_SECURE` | Set `true` when HTTPS is enabled |
| `JWT_SECRET` / `JWT_SECRET_FILE` | JWT signing secret |
| `ADMIN_*` / `ADMIN_*_FILE` | Initial administrator bootstrap values |
| `EMAIL_TRANSPORT` | `console` locally or `smtp` for actual delivery |
| `DEVELOPMENT_EMAIL_TRANSPORT` | Explicitly enables localhost console mail links |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | SMTP configuration |
| `EMAIL_FROM` | Sender address |

### Local email testing

Compose uses an explicitly labelled console transport. Reset/verification URLs appear in backend logs and as labelled local-only links in the UI. SMTP responses are described as accepted only after the provider accepts them; a delivery failure is shown as an error. Configure SMTP before public deployment, and never enable `DEVELOPMENT_EMAIL_TRANSPORT` publicly.

## Browser routes

| Route | Purpose |
| --- | --- |
| `/` | Public ZeeMan website |
| `/login` | Sign in |
| `/register` | Register a regular user |
| `/forgot-password` | Password-reset request |
| `/reset-password?token=...` | Set new password |
| `/verify-email?token=...` | Verify email |
| `/onboarding` | First-user setup |
| `/admin/dashboard` | Administrator workspace |
| `/user/dashboard` | User workspace |

## REST API

All request bodies are JSON. Browsers use the secure cookie session; non-browser clients may use `Authorization: Bearer <JWT>`.

### Public and authentication

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Health status |
| `POST` | `/api/contact` | Save contact form |
| `POST` | `/api/auth/register` | Create regular user |
| `POST` | `/api/auth/login` | Create session |
| `POST` | `/api/auth/logout` | Revoke current session |
| `GET` | `/api/auth/me` | Current user |
| `PUT` | `/api/auth/profile` | Update own profile |
| `PUT` | `/api/auth/password` | Change password |
| `POST` | `/api/auth/forgot-password` | Request reset instructions |
| `POST` | `/api/auth/reset-password` | Consume reset token |
| `POST` | `/api/auth/verify-email` | Consume verification token |
| `POST` | `/api/auth/resend-verification` | Create verification token |

### Onboarding, projects, tasks

| Method | Endpoint | Access |
| --- | --- | --- |
| `GET` | `/api/auth/onboarding` | Signed-in user |
| `PUT` | `/api/auth/onboarding/profile` | Signed-in user |
| `POST` | `/api/auth/onboarding/project` | Signed-in user |
| `POST` | `/api/auth/onboarding/task` | Signed-in user |
| `POST` | `/api/auth/onboarding/complete` | Signed-in user |
| `GET/POST` | `/api/projects` | Accessible projects / create |
| `GET/PUT/DELETE` | `/api/projects/:id` | Authorised member/owner/admin |
| `GET/POST` | `/api/projects/:id/members` | Read / owner-admin management |
| `DELETE` | `/api/projects/:id/members/:userId` | Owner or admin |
| `GET/POST` | `/api/tasks` | Accessible tasks / create |
| `GET/PUT/DELETE` | `/api/tasks/:id` | Authorised access |
| `GET` | `/api/categories` | Signed-in user |
| `GET` | `/api/analytics/user` | Personal analytics |

### Administration

All endpoints below require the `admin` role.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET/POST` | `/api/admin/users` | List/create users |
| `GET/PUT/DELETE` | `/api/admin/users/:id` | Manage a user |
| `GET/POST` | `/api/admin/tasks` | Manage all tasks |
| `PUT/DELETE` | `/api/admin/tasks/:id` | Manage one task |
| `POST` | `/api/admin/categories` | Create category |
| `PUT/DELETE` | `/api/admin/categories/:id` | Manage category |
| `GET` | `/api/admin/analytics` | Global analytics and activity |

## Security

- bcrypt password hashing; plaintext passwords are never saved.
- Passwords require 12+ characters with uppercase, lowercase, and a number.
- HttpOnly, SameSite=Strict cookies and server-side session validation/revocation.
- One-time random reset/verification tokens are SHA-256 hashed before storage and expire after one hour.
- A successful password reset revokes every existing session and outstanding reset token.
- Role checks, parameterised queries, protected admin routes, rate limits, Helmet, and exact-Origin write checks.
- Backend checks task ownership and project membership; hiding a button never grants access.

## Testing

```powershell
npm test
```

The current suite has **9 passing API tests**. It verifies health, PostgreSQL SQL translation, contact validation and origin protection, registration/login/logout, role-forging prevention, dashboard RBAC, SQLite writes, private-task isolation, project-member access, single-use password resets, expired/single-use email verification tokens, and duplicate-safe onboarding persistence.

Run the Docker-hosted browser suite after the services are healthy:

```powershell
$env:E2E_ADMIN_EMAIL = (Get-Content secrets/admin_email.txt -Raw).Trim()
$env:E2E_ADMIN_PASSWORD = (Get-Content secrets/admin_password.txt -Raw).Trim()
npx playwright install chromium
npm run test:e2e
```

The Playwright suite uses unique test accounts and exercises the public routes, login/registration, protected-route redirect, verification resend/confirmation, onboarding, project and task creation, Kanban persistence after refresh, password reset, logout, and administrator redirect.

Docker persistence was verified by restarting the backend with its named volume intact; stored contact records remained available.

## Netlify deployment

ZeeMan can be deployed as a full-stack Netlify site. The included `netlify.toml` publishes `frontend/`, rewrites browser routes to their matching static shell, and rewrites `/api/*` to `netlify/functions/api.js`. The function wraps the existing Express application with `serverless-http`.

For durable Netlify data, ZeeMan switches from local SQLite to PostgreSQL whenever it runs in a Netlify Function or receives `DATABASE_URL`. It never silently uses SQLite in a Netlify Function. The production schema is in `netlify/database/migrations/0001_zeeman_schema.sql`; Netlify tracks and applies this migration before publishing a deploy only after a database has been provisioned and linked.

1. Push this repository to GitHub and import it into Netlify.
2. Keep the base directory empty, publish directory as `frontend`, and functions directory as `netlify/functions` (the checked-in `netlify.toml` sets these values).
3. In **Data & Storage**, create and link a Netlify Database to this site. A migration file by itself does not create a database. Netlify Database requires a credit-based Netlify plan; check the Dashboard for the current Free-plan credit allowance and whether your account needs billing setup before enabling it.
4. Let the Function use Netlify's managed connection automatically, or set `DATABASE_URL` in the Netlify UI with **Functions** scope to a supported PostgreSQL connection string. Do not set it in `netlify.toml`, commit it, or expose it to the browser. Do not set `DATABASE_URL` for local SQLite/Docker development.
5. Add production environment variables in Netlify with **Functions** scope: `JWT_SECRET`, `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `APP_ORIGIN` (your exact Netlify URL/custom domain), `COOKIE_SECURE=true`, `EMAIL_TRANSPORT=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM`.
6. Redeploy after changing environment variables. Confirm the database migration completed in the deploy log, then test `/api/health`, registration, login, and a task creation with a new test account.

Do not set `DEVELOPMENT_EMAIL_TRANSPORT=true` in Netlify production. The Netlify database migration is PostgreSQL-specific; Docker/local development continues to use SQLite.

## Current limitations / next work

- SMTP must be configured for real production email delivery.
- Comments, subtasks, notification inbox, milestones, dependencies, recurring tasks, time tracking, Gantt charts, exports, Docker Hub publishing, and Azure deployment are future phases.
- SQLite is appropriate for one backend replica; move to PostgreSQL before scaling to multiple backend replicas.

Never commit `.env`, Docker secret files, reset URLs, or SMTP credentials.
