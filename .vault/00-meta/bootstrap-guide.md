---
title: CRM Orchestrator Bootstrap Guide
status: living
date: 2026-05-16
tags: [vault/meta, vault/operations]
---

# Bootstrap Guide

## Install

```bash
pnpm install
cp .env.example .env
```

Authenticate local tools:

```bash
claude login
codex login
gh auth login
```

## Start The CRM

```bash
pnpm dev
```

Open:

```text
http://127.0.0.1:3000/admin/orchestrator?project=crm-orchestrator
```

## Start The Orchestrator API

```bash
pnpm --filter @crm-orchestrator/orchestrator status
```

Expected health endpoint:

```text
http://127.0.0.1:4373/status
```

For a detached macOS session:

```bash
screen -dmS crm-orchestrator-status pnpm --filter @crm-orchestrator/orchestrator status
screen -ls
```

Stop it:

```bash
screen -S crm-orchestrator-status -X quit
```

## Open Obsidian

Open `.vault/` as a vault.

Recommended community plugins:

- Dataview
- Tasks
- Templater
- Excalidraw, optional

## Run One Manual Tick

```bash
pnpm tick
```

This scans backlog tasks and launches eligible agents.

## Full Automation

In CRM, use `Start auto` inside the `crm-orchestrator` project. Automation is process-local to the orchestrator status server. If the server restarts, start automation again.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## Common Failure Modes

| Symptom | Fix |
|---|---|
| CRM says orchestrator unavailable | Start `pnpm --filter @crm-orchestrator/orchestrator status` |
| Agent runs but no logs show | Open the task drawer and check artifacts, then inspect `worktrees/T-NNN/` |
| Claude route fails | Run `claude login` in the same OS user account |
| Codex route fails | Run `codex login` and confirm the model in model routing |
| Tasks do not launch | Check status, dependencies, `flagged`, model limits, and project selection |
