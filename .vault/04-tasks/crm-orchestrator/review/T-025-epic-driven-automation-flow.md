---
id: T-025
title: Epic-driven automation flow from architect task to execution pipeline
status: review
priority: P0
effort: L
assignee: architect
depends_on: []
labels:
  - crm
  - orchestrator
  - automation
  - epic-flow
created: '2026-05-15'
flagged: false
project_id: crm-orchestrator
model: opus
artifact_files:
  - kind: stdout_log
    label: T-025 stdout log
    path: worktrees/T-025/.orchestrator-stdout.log
  - kind: live_log
    label: T-025 live log
    path: worktrees/T-025/.orchestrator-live.log
  - kind: worktree
    label: T-025 worktree
    path: worktrees/T-025
---
## What

Design the next orchestrator capability where a human selects or creates one epic-level task, usually for the architect, and the system turns that epic into an automated role pipeline.

## Desired Flow

1. Human creates or selects an epic task in CRM.
2. Architect clarifies constraints, files, risks, feature boundaries, and acceptance criteria.
3. Architect output creates or updates downstream PM tasks in the vault.
4. PM decomposes implementation work into explicit developer, designer, reviewer, and tester tasks.
5. Orchestrator launches eligible tasks by dependency order and role capacity.
6. CRM shows epic progress, spawned tasks, blocked questions, failed tasks, PRs, and summaries for 1h/2h/4h.
7. Human can pause, resume, delete, reroute, or manually run any task.

## Acceptance Criteria

- Define the vault schema needed to connect tasks to an epic/root task.
- Define how agents are allowed to create downstream tasks without duplicate IDs.
- Define the status transitions for epic, child tasks, blocked questions, failed tasks, and completed tasks.
- Define the CRM controls for starting, pausing, resuming, and inspecting an epic run.
- Define safeguards against duplicate tasks and hallucinated scope.
- Produce follow-up implementation tasks for PM/developer/tester after the architecture is accepted.

## Notes

- This is not the final product frontend task. This is a CRM/orchestrator capability needed to make the frontend project development flow autonomous and controllable.
- Current manual controls already support run, delete, status changes, automation start/stop, and model routing.
- This task should reuse those controls rather than inventing a separate workflow.
