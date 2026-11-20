# API documentation

All payloads are JSON. Protected routes require `Authorization: Bearer <JWT>`.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | Public | Register a regular user; accepts name, email, password (8+ chars) |
| POST | `/api/auth/login` | Public | Authenticate and receive token/user |
| POST | `/api/auth/logout` | Signed in | Records logout activity |
| GET | `/api/auth/me` | Signed in | Current user |
| GET/POST | `/api/tasks` | Signed in | List own tasks (admins see all); create task |
| GET/PUT/DELETE | `/api/tasks/:id` | Signed in | Owner-only for regular users; admins may manage any task |
| GET | `/api/categories` | Signed in | List categories |
| GET | `/api/analytics/user` | Signed in | Personal overview and deadlines |
| GET/POST | `/api/admin/users` | Admin | List/create users |
| GET/PUT/DELETE | `/api/admin/users/:id` | Admin | User management |
| GET/POST | `/api/admin/categories` | Admin | Category management |
| PUT/DELETE | `/api/admin/categories/:id` | Admin | Edit/delete category |
| GET | `/api/admin/analytics` | Admin | Application metrics/activity |
| GET | `/api/health` | Public | Container health status |

Task fields are `title`, `description`, `category_id`, `priority` (`low`, `medium`, `high`), `status` (`pending`, `in_progress`, `completed`, `cancelled`), and `due_date`. Admins can additionally set `user_id`.
