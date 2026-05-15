---
id: T-002
title: Decompose F-001 CRM Dashboard into developer tasks
status: done
priority: P0
effort: S
assignee: pm
depends_on: []
spec: '[[F-001-multi-agent-crm]]'
labels:
  - crm
  - orchestration
created: '2026-05-14'
flagged: false
project_id: crm-orchestrator
---

## What
Read F-001-multi-agent-crm.md spec and decompose into 8-15 developer tasks in 04-tasks/backlog/. Each task max M effort.

## Why
Need live agent status visibility urgently. CRM is P0.

## Acceptance criteria
- [ ] 8-15 task files in 04-tasks/backlog/ with frontmatter
- [ ] All have assignee: developer, correct effort/priority
- [ ] First 3 tasks are backend/API (no UI dependency)
- [ ] T-003 = orchestrator status REST endpoint
- [ ] T-004 = /admin/orchestrator Next.js page skeleton
- [ ] Dependencies set correctly

## Reference materials
- [[F-001-multi-agent-crm]]
- [[ADR-001-crm-orchestrator-architecture]]
- [[ADR-003-agent-role-pipeline]]
