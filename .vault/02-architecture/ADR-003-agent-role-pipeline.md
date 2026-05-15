---
id: ADR-003
title: Agent Role Pipeline
status: accepted
date: 2026-05-16
deciders: [yaroslav, codex]
tags: [vault/adr, vault/agents]
---

# ADR-003 - Agent Role Pipeline

## Context

The user wants to describe a high-level request in the CRM and have it move through architect, PM, designer, developer, reviewer, and tester roles.

## Decision

The default role pipeline is:

```text
Architect -> PM -> Designer -> Developer -> Reviewer -> Tester
```

Model routing defaults:

| Role | Runner | Model |
|---|---|---|
| Architect | Claude | Opus |
| PM | Claude | Sonnet |
| Designer | Claude | Sonnet |
| Developer | Codex | GPT-5.5 |
| Reviewer | Claude | Opus |
| Tester | Codex | GPT-5.5 |

The CRM can change model routing per role. Per-task `model` frontmatter can override defaults.

## Consequences

- Architecture and product intent happen before implementation.
- Reviewer and tester are separate from developer.
- The user can manually run a task, start project automation, or stop automation at any time.
- Provider usage limits are represented as console hints and may be adjusted through env/config.
