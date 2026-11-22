# Database schema

ZeeMan uses SQLite for local/Docker development with foreign keys enabled and WAL mode. The production companion schema is PostgreSQL through the ordered Netlify migrations.

```text
users ──< project_members >── projects ──< tasks
  │                                │          │
  ├──< sessions                     │          ├──< task_comments ──< comment_mentions
  ├──< notifications                │          ├──< task_attachments
  └──< activity_logs                │          ├──< subtasks
                                   └──────────└──< checklist_items
```

| Table | Phase 5 fields / relationships |
| --- | --- |
| `task_comments` | `task_id`, `user_id`, `body`, optional `parent_id`, `updated_at`, `deleted_at`; task/user foreign keys cascade. |
| `comment_mentions` | Composite `comment_id`, `user_id` key; links comments to authorised mention recipients. |
| `task_attachments` | `task_id`, uploader `user_id`, `original_name`, unique opaque `storage_key`, MIME type, size, create/delete timestamps. |
| `subtasks` | Parent `task_id`, title/description, assigned `user_id`, status, creator, completion and update timestamps. Priority and due date are intentionally not schema fields. |
| `checklist_items` | Parent `task_id`, title, optional owner `user_id`, creator, ordering, and completion timestamp. |
| `activity_logs` | Actor, action, description, optional `entity_type`, `entity_id`, `project_id`, metadata, and timestamp. |
| `milestones` | Project-scoped title/description, Admin-controlled status, optional start/due/completion/archive timestamps, creator, and audit timestamps. |
| `tasks.milestone_id` | Nullable foreign key to `milestones`; `ON DELETE SET NULL` preserves task history if a migration/database operation removes a milestone. A task can be linked to one milestone only. |

## Migration safety

SQLite initializes missing Phase 5 tables with `CREATE TABLE IF NOT EXISTS` and adds pre-existing columns only after `PRAGMA table_info` checks. Existing collaboration/project/task records are not dropped.

`netlify/database/migrations/0005_task_collaboration.sql` is additive PostgreSQL SQL: it uses `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, foreign keys, and an attachment lookup index. Apply it only after the prerequisite base migrations. It was statically reviewed during Phase 5 QA; no live PostgreSQL/Netlify database was available in this local environment to execute it.

`netlify/database/migrations/0006_milestones.sql` is the Phase 6 additive companion migration. It creates `milestones`, adds nullable `tasks.milestone_id`, and adds project/deadline and task-link indexes. SQLite performs the equivalent changes through guarded `PRAGMA table_info` checks. Neither migration removes or rewrites existing project/task/collaboration records. The PostgreSQL migration has been statically reviewed only; a provisioned PostgreSQL database is still required for live execution.
