# Database ER overview

```mermaid
erDiagram
  USERS ||--o{ PROJECTS : owns
  USERS ||--o{ PROJECT_MEMBERS : joins
  PROJECTS ||--o{ PROJECT_MEMBERS : contains
  PROJECTS ||--o{ TASKS : groups
  USERS ||--o{ TASKS : assigned
  CATEGORIES ||--o{ TASKS : classifies
  TASKS ||--o{ SUBTASKS : contains
  TASKS ||--o{ TASK_COMMENTS : receives
  USERS ||--o{ TASK_COMMENTS : writes
  USERS ||--o{ NOTIFICATIONS : receives
  TASKS ||--o{ TASK_DEPENDENCIES : depends_on
  USERS ||--o{ ACTIVITY_LOGS : performs
  USERS ||--o{ SESSIONS : owns
```

Private tasks have a nullable `project_id` and are restricted to their assigned user. Project tasks use `project_members` for shared access. Foreign keys, checks, and indexes are created by the database initialization migration routine.
