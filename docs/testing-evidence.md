# Testing evidence

`npm test` uses a uniquely named temporary SQLite database. It does not read or mutate `data/tasks.db`.

Verified workflows:

- Health endpoint returns 200.
- Registration creates cookie-based sessions.
- A regular user can create a personal task.
- Another regular user receives 404 for that task.
- A regular user receives 403 for administrative routes.

Docker validation covers image build, backend/frontend health checks, Nginx API proxying, and named-volume persistence after a Compose recreation without `-v`.
