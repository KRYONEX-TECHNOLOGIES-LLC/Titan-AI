# SPRINT PLAN

> **LIFECYCLE:** QUEUED → IN PROGRESS → PENDING VERIFICATION → COMPLETE or FAILED
> **RULE:** FAILURE COUNT tracked per task. At 3 failures → HALT + escalate to human.
> **RULE:** No task is marked COMPLETE without a Verifier PASS verdict.

---

## Current Sprint: Governance v2.0 Implementation

| Task ID | Description | Agent | Status | Failure Count | Verifier Verdict |
|---------|-------------|-------|--------|---------------|------------------|
| GOV-001 | Write governance.mdc (Constitution) | Coder | COMPLETE | 0 | PASS |
| GOV-002 | Write governor.md (Supervisor spec) | Coder | COMPLETE | 0 | PASS |
| GOV-003 | Write executor.md (Tool agent spec) | Coder | COMPLETE | 0 | PASS |
| GOV-004 | Write coder.md (Worker spec) | Coder | COMPLETE | 0 | PASS |
| GOV-005 | Write ruthless-verifier.md (Verifier spec) | Coder | COMPLETE | 0 | PASS |
| GOV-006 | Write titan-agents.yaml (Config) | Coder | COMPLETE | 0 | PASS |
| GOV-007 | Wire SECTION 13 into system prompt | Coder | IN PROGRESS | 0 | — |
| GOV-008 | Add Titan Protocol to model selector | Coder | QUEUED | 0 | — |
| GOV-009 | Rebuild and verify | Executor | QUEUED | 0 | — |

## Blocked Tasks

| Task ID | Description | Blocked By | Reason | Escalated |
|---------|-------------|------------|--------|-----------|
| — | — | — | — | — |

## Sprint 2: Titan Protocol v2 (Parallel Lanes) Implementation

| Task ID | Description | Agent | Status | Failure Count | Verifier Verdict |
|---------|-------------|-------|--------|---------------|------------------|
| TPv2-001 | Lane model types (lane-model.ts, types/ide.ts) | Coder | COMPLETE | 0 | — |
| TPv2-002 | Lane state machine (lane-state-machine.ts) | Coder | COMPLETE | 0 | — |
| TPv2-003 | Lane store backend (lane-store.ts server) | Coder | COMPLETE | 0 | — |
| TPv2-004 | Task manifest DAG engine (task-manifest.ts) | Coder | COMPLETE | 0 | — |
| TPv2-005 | Worker agent per-lane (worker.ts) | Coder | COMPLETE | 0 | — |
| TPv2-006 | Worker API endpoint (/api/titan/worker) | Coder | COMPLETE | 0 | — |
| TPv2-007 | Verifier agent per-lane (verifier.ts) | Coder | COMPLETE | 0 | — |
| TPv2-008 | Verifier API endpoint (/api/titan/verifier) | Coder | COMPLETE | 0 | — |
| TPv2-009 | Merge arbiter (merge-arbiter.ts) | Coder | COMPLETE | 0 | — |
| TPv2-010 | Conflict resolver (conflict-resolver.ts) | Coder | COMPLETE | 0 | — |
| TPv2-011 | Supervisor orchestrator (supervisor.ts) | Coder | COMPLETE | 0 | — |
| TPv2-012 | Orchestration API (/api/titan/orchestrate) | Coder | COMPLETE | 0 | — |
| TPv2-013 | Lane REST + SSE APIs (/api/lanes/*) | Coder | COMPLETE | 0 | — |
| TPv2-014 | Frontend lane store (Zustand) | Coder | COMPLETE | 0 | — |
| TPv2-015 | useParallelChat hook | Coder | COMPLETE | 0 | — |
| TPv2-016 | Model registry v2 entry | Coder | COMPLETE | 0 | — |
| TPv2-017 | Lane Control Tower UI (LanePanel.tsx) | Coder | COMPLETE | 0 | — |
| TPv2-018 | ChatMessage v2 rendering | Coder | COMPLETE | 0 | — |
| TPv2-019 | useChat parallel routing | Coder | COMPLETE | 0 | — |
| TPv2-020 | titan-ide LanePanel integration | Coder | COMPLETE | 0 | — |
| TPv2-021 | titan-agents.yaml v2 config | Coder | COMPLETE | 0 | — |
| TPv2-022 | Governance docs (plan.md, memory.md) | Coder | COMPLETE | 0 | — |
| TPv2-023 | End-to-end verification | Executor | PENDING VERIFICATION | 0 | — |

## Completed Sprints

### Sprint 1: Governance v2.0 Documentation
Completed all governance documentation: constitution, agent specs, config, checklist.
