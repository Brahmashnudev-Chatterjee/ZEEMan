# Phase 3 testing

## Backend regression suite

```powershell
npm test
```

The Node test suite creates an isolated temporary SQLite database. It verifies registration/login/logout, password-reset token hashing/expiry/single use, email-verification token hashing/expiry/single use, role-forging prevention, RBAC, private-task isolation, project membership, onboarding persistence, and duplicate-safe onboarding project/task updates.

## Docker-hosted browser suite

```powershell
docker compose up -d --build
$env:E2E_ADMIN_EMAIL = (Get-Content secrets/admin_email.txt -Raw).Trim()
$env:E2E_ADMIN_PASSWORD = (Get-Content secrets/admin_password.txt -Raw).Trim()
npx playwright install chromium
npm run test:e2e
```

Playwright runs against `http://localhost:8080`, so each journey traverses Nginx, the cookie-based API, and the persistent Docker SQLite volume. Tests use unique `@example.test` records and do not alter existing records. The administrator test receives credentials only through process environment variables; test source never includes them.

The browser suite verifies public routes, invalid and valid login, registration, user/admin dashboard redirects, protected-route redirect, resend verification, verification confirmation, onboarding, project creation, task creation, Kanban drag-and-drop persistence after reload, password reset, and logout.

## Persistence check

Do not use `-v` for this check:

```powershell
docker compose down
docker compose up -d
docker compose ps
```

Sign in with a previously created account and confirm its project/task remains. The named `zeeman-data` volume must still be present.
