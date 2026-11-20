# Docker architecture

The frontend and backend communicate over the private `zeeman-network`. Only the frontend publishes port 8080. SQLite is stored at `/app/data/zeeman.db` on the named `zeeman-data` volume. Docker secret files mount at `/run/secrets`.
