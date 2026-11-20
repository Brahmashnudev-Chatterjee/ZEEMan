# Testing evidence checklist

## Automated checks

Run `npm --prefix backend test` after installing dependencies. The included smoke test verifies the health endpoint. Extend this suite with isolated temporary database tests in CI.

## Manual acceptance checklist

- Register two regular users. Confirm both receive `role: user` even if a role is supplied in browser requests.
- Log in with seeded admin credentials; verify the Admin overview, member and category controls.
- Create, edit, complete, and delete a regular user's task.
- While signed in as user A, request user B's `/api/tasks/:id`; expect `404` without revealing the record.
- Request an `/api/admin/*` route as a regular user; expect `403`.
- Deactivate a user as admin; confirm their next API request is rejected.
- Create/drag a Kanban task and confirm the database status changes after reload.
- Run `docker compose config`, `docker compose up -d --build`, `docker compose ps`, and check `http://localhost:8080`.
- Add a task, `docker compose down`, run `docker compose up -d`, and confirm data persists. Do not add `-v`.
