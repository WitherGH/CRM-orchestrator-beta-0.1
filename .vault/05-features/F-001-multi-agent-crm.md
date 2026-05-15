---
id: F-001
title: Multi-Agent CRM Dashboard
status: beta
date: 2026-05-16
owner: yaroslav
tags: [vault/feature, vault/crm, vault/orchestrator]
---

# F-001 - Multi-Agent CRM Dashboard

## Problem

Running agents from terminal windows is opaque. The user needs one surface that shows what exists, what is running, what changed, what is blocked, and what can be merged.

## Goals

- Project switcher with isolated task state.
- Human request composer that creates role-specific tasks.
- Kanban with manual status control and drag-and-drop.
- Task drawer with run, status, delete, edit, artifacts, and log links.
- Live agent rail with status, elapsed time, model, last output, kill, pause, and view-log controls.
- Automation panel with run tick, start auto, stop, recent movement summaries, and model limit hints.
- PR queue with human-triggered reviewer merge-ready action.
- Vault explorer for reading Obsidian markdown from the CRM.
- Cost dashboard and daily log views.

## Out Of Scope

- Terminal frontend product development.
- Multi-user SaaS.
- Autonomous merges without human action.

## Acceptance Criteria

- [x] CRM opens at `/admin/orchestrator`.
- [x] Root route redirects to the CRM.
- [x] `crm-orchestrator` project exists.
- [x] Terminal frontend project tasks are not present in this beta repo.
- [x] Kanban, PR queue, Vault, Daily log, and Cost tabs are clickable.
- [x] Task drawer supports task editing.
- [x] Project-scoped controls pass `projectId`.
- [x] Orchestrator status endpoint returns task, agent, cost, and runtime data.
- [x] Reviewer merge-ready process can be launched manually.

## Related

- [[ADR-001-crm-orchestrator-architecture]]
- [[ADR-002-vault-project-task-model]]
- [[ADR-003-agent-role-pipeline]]
