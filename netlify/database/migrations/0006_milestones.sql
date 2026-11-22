-- Phase 6 Stage 1: additive milestone and project-progress support.
-- Apply through the provisioned Netlify/PostgreSQL migration workflow.
CREATE TABLE IF NOT EXISTS milestones (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'on_hold')),
  start_date TEXT,
  due_date TEXT,
  completed_at TIMESTAMPTZ,
  created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS milestone_id BIGINT REFERENCES milestones(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_milestone ON tasks(milestone_id);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id, archived_at, due_date);
