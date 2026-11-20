# Collaborative project MVP

## Data model

`projects` owns project metadata and an owner user ID. `project_members` is the access-control join table. Tasks may have a nullable `project_id`: a null value remains private to its assigned user; a project value is visible only to authorised project members or administrators.

The schema also contains Phase 2/3 foundations for task comments, subtasks, notifications, and task dependencies. Those tables are deliberately not exposed as incomplete UI features yet.

## API

- `GET/POST /api/projects`
- `GET/PUT/DELETE /api/projects/:id`
- `GET/POST /api/projects/:id/members`
- `DELETE /api/projects/:id/members/:userId`

Only an administrator or project owner may edit a project or manage membership. Project tasks can be assigned only to project members. A regular user querying an unrelated project or task receives `404`.
