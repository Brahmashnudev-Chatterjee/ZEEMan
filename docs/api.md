# ZeeMan API documentation

All payloads are JSON. Browser requests authenticate with the HttpOnly `zeeman_session` cookie; non-browser clients may send `Authorization: Bearer <JWT>`. State-changing browser requests must originate from `APP_ORIGIN`.

## Authentication and account recovery

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | Public | Create a regular user. Ignores any submitted role. Requires a 12+ character password with upper/lowercase letters and a number. |
| POST | `/api/auth/login` | Public | Create a cookie-backed session. |
| POST | `/api/auth/logout` | Signed in | Revoke the current server-side session. |
| GET | `/api/auth/me` | Signed in | Return the current user, email-verification state, and onboarding state. |
| PUT | `/api/auth/profile` | Signed in | Update name, bio, and notification preferences. |
| PUT | `/api/auth/password` | Signed in | Change password and revoke other sessions. |
| POST | `/api/auth/forgot-password` | Public | Request reset instructions. Always returns a generic response. |
| POST | `/api/auth/reset-password` | Public | Consume a one-time reset token; requires `token`, `password`, and `password_confirmation`. |
| POST | `/api/auth/verify-email` | Public | Consume a one-time email-verification token. |
| POST | `/api/auth/resend-verification` | Signed in | Replace an outstanding verification token and request another delivery. |

In development console-email mode, successful reset/resend responses include a clearly labelled `development_url`. SMTP mode only reports success after the configured provider accepts delivery. Production never returns verification or reset tokens.

## Onboarding

| Method | Path | Access | Body / behaviour |
| --- | --- | --- | --- |
| GET | `/api/auth/onboarding` | Signed in | Returns saved step, profile, first-project, and first-task summary. |
| PUT | `/api/auth/onboarding/profile` | Signed in | `name`, optional `bio`, optional `avatar_url`; advances to step 2. |
| POST | `/api/auth/onboarding/project` | Signed in | `name`, optional `description`, `start_date`, `due_date`; updates the saved onboarding project rather than duplicating it. Use `{ "skip": true }` to advance without a project. |
| POST | `/api/auth/onboarding/task` | Signed in | `title`, optional `description`, `priority`, `start_date`, `due_date`; updates the saved onboarding task rather than duplicating it. Use `{ "skip": true }` to advance without a task. |
| POST | `/api/auth/onboarding/complete` | Signed in | Marks onboarding complete. |

Date ranges require a start date on or before the due date. A task requires an onboarding project unless it is skipped.

## Work management

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET/POST | `/api/projects` | Signed in | List accessible projects / create a project. |
| GET/PUT/DELETE | `/api/projects/:id` | Authorised member / owner / admin | Read, update, or delete a project. |
| GET/POST | `/api/projects/:id/members` | Member / owner-admin | List members / add a member. |
| DELETE | `/api/projects/:id/members/:userId` | Owner or admin | Remove a non-owner member. |
| GET/POST | `/api/tasks` | Signed in | List accessible tasks / create a task. |
| GET/PUT/DELETE | `/api/tasks/:id` | Authorised access | Read, update, or delete a task. |
| GET | `/api/categories` | Signed in | List categories. |
| GET | `/api/analytics/user` | Signed in | Personal task metrics and deadlines. |
| GET | `/api/health` | Public | Service health status. |

Task fields are `title`, `description`, `category_id`, `project_id`, `priority`, `status`, `start_date`, and `due_date`. Administrators can additionally set `user_id`.

## Task collaboration

All collaboration endpoints require authentication and an authorised task/project membership. Their database records are shared by the Admin and Employee task-detail interfaces.

| Method | Path | Access | Behaviour |
| --- | --- | --- | --- |
| GET/POST | `/api/tasks/:taskId/comments` | Authorised member | List root comments/replies or create a comment/reply. `mention_ids` must be active project members. |
| PATCH/DELETE | `/api/comments/:id` | Author or Admin | Update/delete an own comment; Admin can moderate project comments. Deleted comments retain an audit-safe deleted state. |
| GET | `/api/tasks/:taskId/mentionable-users` | Authorised member | Active members eligible for a structured mention. |
| GET/POST | `/api/tasks/:taskId/attachments` | Authorised member | List/upload private attachments. Upload payload is `{ file: { name, mime_type, content_base64 } }`. |
| GET | `/api/attachments/:id/download` | Authorised member | Download a private attachment after task access is verified. |
| DELETE | `/api/attachments/:id` | Uploader or Admin | Soft-delete metadata and remove local content when present. |
| GET/POST | `/api/tasks/:taskId/subtasks` | Member read / Admin write | List subtasks or create an assigned subtask for a project member. |
| PATCH | `/api/subtasks/:id/status` | Subtask assignee or Admin | Update only a permitted subtask status. |
| DELETE | `/api/subtasks/:id` | Admin | Delete a subtask. |
| GET/POST | `/api/tasks/:taskId/checklists` | Member read / Admin write | List or create checklist items. |
| PATCH | `/api/checklist-items/:id/completion` | Item owner, parent-task assignee, or Admin | Toggle completion state. |
| GET | `/api/tasks/:taskId/activity` | Authorised member | Read task-relevant persisted collaboration activity. |

Accepted local attachment MIME types are PDF, PNG, JPEG, plain text, CSV, DOCX, XLSX, and ZIP. The server limits uploads to 5 MB, cleans filenames, validates selected signatures, stores opaque keys, and never accepts a client-supplied filesystem path.

## Administration

All endpoints below require the `admin` role.

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/api/admin/users` | List/create users |
| GET/PUT/DELETE | `/api/admin/users/:id` | Manage a user |
| GET/POST | `/api/admin/tasks` | Manage all tasks |
| PUT/DELETE | `/api/admin/tasks/:id` | Manage one task |
| GET/POST | `/api/admin/categories` | List/create categories |
| PUT/DELETE | `/api/admin/categories/:id` | Manage a category |
| GET | `/api/admin/analytics` | Global metrics and activity |
