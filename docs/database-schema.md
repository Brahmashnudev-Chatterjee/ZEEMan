# Database schema

```text
users (1) ───< tasks >─── (0..1) categories
  │
  └────< activity_logs
```

| Table | Key fields |
| --- | --- |
| `users` | `id`, `name`, unique case-insensitive `email`, `password_hash`, `role`, `account_status`, timestamps |
| `tasks` | `id`, `title`, `description`, `user_id`, nullable `category_id`/`project_id`, `priority`, `status`, `start_date`, `due_date`, timestamps, `completed_at` |
| `categories` | `id`, unique `name`, `description`, `created_at` |
| `activity_logs` | `id`, nullable `user_id`, `action`, `description`, `created_at` |

Foreign keys are enabled. Deleting a user cascades to their tasks. Deleting a category sets attached task categories to `NULL`. WAL mode provides better controlled local write behavior but does not make SQLite a multi-replica database.
