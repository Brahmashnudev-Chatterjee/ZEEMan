# Deployment roadmap

Docker Compose provides the supported local container deployment. Docker Hub publishing is optional: run `docker login` and `docker compose push` after setting a release tag. Azure deployment is deliberately deferred until the application moves from SQLite to a managed multi-user database for scalable production use.
