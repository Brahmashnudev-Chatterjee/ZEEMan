# Employee Workspace audit — Phase 5 final QA (2026-11-22)

The Employee Workspace uses the same projects, tasks, comments, attachments, notifications, activity logs, and sessions as the Admin Control Center. It never copies Admin data into a separate employee store.

| Module | Status | Phase 5 evidence |
| --- | --- | --- |
| Dashboard, My Projects, My Tasks | Complete | Membership-scoped project and assigned-task APIs; browser allocation workflow passed. |
| Task detail | Complete | Read-only task metadata; only the parent-task assignee receives the status control. |
| Collaboration | Complete | Comments, replies, own-comment edit/delete, searchable member mentions, attachments, subtasks, checklists, and task activity timeline. |
| Kanban, Calendar, Notifications | Complete | Each can open the authorised task detail; Kanban has an accessible Open task button. |
| My Progress, Profile, Settings | Complete | Employee-scoped reports, preferences, password change, and session revocation remain available. |

## Enforced restrictions

- An employee cannot create or edit projects, parent tasks, subtasks, checklist definitions, task priorities, dates, assignees, or project membership.
- A parent task status may be changed only by that task's assigned employee.
- A subtask status may be changed only by its assigned employee.
- A checklist item may be completed only by its owner, the parent-task assignee, or an administrator.
- Employees can edit/delete only their own comments and attachments. Other members' records are read-only.
- Direct URLs and API calls are scoped by authenticated project membership; unrelated projects/tasks return no accessible record.

## Phase 6 Stage 1 — milestones

Allocated project details now include read-only milestone cards with description, workflow status, deadline/overdue state, calculated progress, and linked tasks. The interface does not render milestone-management controls for employees, and direct milestone mutation requests are rejected by backend Admin-only authorization.

## Phase 5 QA evidence

`e2e/employee-collaboration.spec.js` creates isolated Admin and Employee records, verifies all task-entry paths, comments, edited replies, mentions, attachment upload/download, deliverable visibility, subtask/checklist completion, parent task status synchronization, Admin visibility, notifications, and denied employee priority/attachment deletion attempts. The fixture is cleaned up after each run.

Subtasks currently do not have priority or due-date columns. The UI explicitly reports those values as unset instead of fabricating them.
