# API roadmap

## Implemented MVP

- Authentication: register, login, logout, current user, profile, password change.
- Tasks: list, detail, create, update, delete, filtered/sorted access.
- Projects: list, detail, create, update, delete, list/add/remove members.
- Categories and administrator user management.
- Personal and global analytics, health check.

## Next APIs

- Task comments and subtasks.
- Notification list/read/read-all endpoints.
- Project-specific analytics and activity history.
- Teams, checklists, dependencies, milestones, time entries and recurring schedules.
- Contact submissions and secure password-reset tokens.

All new protected routes must apply authentication, exact-origin validation for writes, role checks, and project/task ownership checks before reading or mutating data.
