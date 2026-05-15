---
title: CRM Orchestrator Beta Import
status: living
date: 2026-05-16
author: codex
tags: [vault/progress, vault/handoff]
---

# CRM Orchestrator Beta Import

## Imported From

Source repo: `pulse_terminal`

Source commit: `40e11dd feat: add project-scoped orchestrator CRM controls`

## Scope

This standalone beta contains only the CRM Orchestrator project:

- CRM UI
- orchestrator status/control API
- project-scoped vault task model
- human request pipeline
- automation controls
- live-agent rail
- task controls and task editing
- PR queue and reviewer merge-ready action
- Obsidian vault memory

The Terminal frontend project workspace was removed.

## Current Task State

- `done`: T-001 through T-018
- `review`: T-025
- `backlog`: empty at import

## How To Continue

1. Open `.vault/` in Obsidian.
2. Start CRM with `pnpm dev`.
3. Start orchestrator status server with `pnpm --filter @crm-orchestrator/orchestrator status`.
4. Open `/admin/orchestrator?project=crm-orchestrator`.
5. Review T-025 and decide whether to convert its architecture output into follow-up tasks.
6. Use the CRM human request form for new work.

## Verification Expected

```bash
pnpm lint
pnpm typecheck
pnpm test
```
