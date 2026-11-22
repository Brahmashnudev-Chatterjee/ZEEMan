# ZeeMan Docker operations and collaboration storage

Run `npm run docker:secrets`, then start the stack with `docker compose up -d --build`. Visit `http://localhost:8080`; `docker compose ps` must show healthy frontend and backend services.

The named `zeeman-data` volume is mounted at `/app/data`. SQLite and the Phase 5 private attachment directory (`/app/data/uploads` unless `UPLOAD_PATH` is supplied) persist across `docker compose down` and recreation. Do not use `docker compose down -v` unless deleting all local application and attachment data is intentional.

The attachment APIs use private backend storage and authorisation checks; Nginx only proxies `/api`. Do not publish the attachment directory as a frontend static directory.

For production, mount an equivalent private persistent path for a single-replica backend or implement a private object-storage adapter before enabling uploads. Netlify Function filesystems are ephemeral and therefore are not a production attachment store.
