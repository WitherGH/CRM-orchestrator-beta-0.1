---
title: CRM Orchestrator Vault Index
project: crm-orchestrator
status: living
created: 2026-05-16
tags: [vault/meta, vault/index]
---

# CRM Orchestrator Vault

This vault is the durable memory and task state for `CRM-orchestrator-beta-0.1`.

## Folder Map

| Folder | Purpose |
|---|---|
| `00-meta/` | Operating docs, glossary, open questions |
| `02-architecture/` | ADRs for CRM/orchestrator decisions |
| `03-projects/` | Project workspace definitions |
| `04-tasks/` | Project-scoped task lifecycle |
| `05-features/` | Durable feature specs |
| `06-progress/` | Progress logs and handoff notes |
| `07-agents-state/` | Generated state snapshots, if enabled |
| `skills/` | Local working notes for agents |

## Active Project

`[[crm-orchestrator]]`

Task paths use:

```text
04-tasks/crm-orchestrator/<status>/T-NNN-*.md
```

Statuses:

```text
backlog -> in-progress -> review -> merge-ready -> done
failed
blocked-question
```

## Reading Order For Agents

1. This file
2. `[[crm-orchestrator]]`
3. `[[F-001-multi-agent-crm]]`
4. `[[ADR-001-crm-orchestrator-architecture]]`
5. `[[ADR-002-vault-project-task-model]]`
6. Latest progress file in `06-progress/`
7. Assigned task file

## Dataview: Active CRM Tasks

```dataview
TABLE status, assignee, priority, effort
FROM "04-tasks/crm-orchestrator"
WHERE id
SORT priority ASC, id ASC
```

## Rules

- The vault is the source of truth.
- Every task must have `project_id: crm-orchestrator`.
- Human requests are allowed to create new tasks, but they must stay inside this project unless a new project is explicitly created.
- Task descriptions may be edited in CRM or Obsidian; both are the same filesystem.
- Logs, PRs, changed files, and other artifacts should be attached to task frontmatter when available.
