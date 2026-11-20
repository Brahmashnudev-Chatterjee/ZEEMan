# ZeeMan permission matrix

| Capability | Admin | Allocated project member | Unrelated user |
| --- | --- | --- | --- |
| View all users, projects, and tasks | Yes | No | No |
| Create/edit/archive/delete projects | Yes | No | No |
| Add/remove project members | Yes | No | No |
| Create/edit/delete/reassign project tasks | Yes | No | No |
| Change task priority, dates, or project | Yes | No | No |
| View an allocated project and its tasks | Yes | Yes | No (404) |
| View an allocated project member list | Yes | Yes | No (404) |
| Update task status | Any project task | Only task assigned to self | No (404/403) |
| Manage users, categories, reports | Yes | No | No |

All constraints are enforced through Express authentication, role middleware, project-membership SQL predicates, and task-assignee checks. The frontend is not relied on for authorisation.
