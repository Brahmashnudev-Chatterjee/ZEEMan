# ZeeMan architecture

ZeeMan serves a vanilla JavaScript dashboard and Express API. Authentication uses HttpOnly cookies backed by server-side session records. Administrators manage the workspace; users can access only their own tasks.

Projects introduce a second permission layer: an administrator can access every project, a project owner can manage its members, and a member can access that project’s shared tasks. Users cannot enumerate unrelated projects or read their tasks.

Local development uses Express on port 3000. Docker uses Nginx on port 8080, proxying API traffic to a private backend container.
