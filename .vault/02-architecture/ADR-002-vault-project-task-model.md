---
id: ADR-002
title: Vault Project Task Model
status: accepted
date: 2026-05-16
deciders: [yaroslav, codex]
tags: [vault/adr, vault/projects, vault/tasks]
---

# ADR-002 - Vault Project Task Model

## Context

The CRM must support multiple isolated projects. A task from one project must not accidentally launch inside another project.

## Decision

Projects live in:

```text
.vault/03-projects/<project-id>.md
```

Tasks live in:

```text
.vault/04-tasks/<project-id>/<status>/T-NNN-*.md
```

Every project-scoped task includes:

```yaml
project_id: crm-orchestrator
```

The CRM and orchestrator still tolerate legacy paths for compatibility, but new beta work should use project-scoped paths.

## Consequences

- The CRM can filter Kanban, PR queue, automation, and stats by project.
- Human request intake can create tasks directly in the selected project.
- Moving task status moves the markdown file to the matching status folder.
- Obsidian folder structure remains readable without the app.
