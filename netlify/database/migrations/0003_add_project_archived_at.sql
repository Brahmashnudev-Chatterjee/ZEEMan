-- Keeps the PostgreSQL schema aligned with the SQLite project archive field.
-- This migration is additive and does not alter or remove existing records.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
