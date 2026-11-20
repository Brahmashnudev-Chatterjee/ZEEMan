# ZeeMan permission matrix

| Capability | Admin | Project owner | Project member | Unrelated user |
| --- | --- | --- | --- | --- |
| View all users/projects/tasks | Yes | No | No | No |
| Create a project | Yes | Yes | Yes, owns created project | Yes, owns created project |
| Edit/delete a project | Any project | Owned project | No | No |
| Manage project members | Any project | Owned project | No | No |
| View a private task | Yes | Only own | Only own | No |
| View a shared project task | Yes | Yes | Yes | No, returns 404 |
| Assign a project task | Yes | To project members | Planned permission option | No |
| Manage categories/users/global reports | Yes | No | No | No |

Every entry is enforced by Express route/controller checks and SQL predicates. The client navigation is only a usability layer; it is not an authorization control.
