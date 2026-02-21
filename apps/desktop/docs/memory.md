# PROJECT MEMORY (Architectural Decision Records)

> **RULES:** This file is APPEND-ONLY. Nothing is ever deleted or edited.
> Superseded decisions get a new entry referencing the old one.
> Only the Supervisor can write to this file via MEMORY UPDATE command.

---

## ADR-001: Electron Desktop-First Architecture
- **Decision:** Titan AI is built as a full Electron desktop application. The web version serves only as a download landing page.
- **Rationale:** Desktop provides native filesystem access, real PTY terminal, git integration, and Cursor AI parity that web cannot achieve.
- **Date:** 2026-02-01
- **Task ID:** INIT
- **Status:** ACTIVE

## ADR-002: OpenRouter as Primary LLM Gateway
- **Decision:** All LLM API calls route through OpenRouter with LiteLLM as fallback.
- **Rationale:** OpenRouter provides access to all major model providers through a single API key. LiteLLM allows self-hosted proxy for cost control.
- **Date:** 2026-02-01
- **Task ID:** INIT
- **Status:** ACTIVE

## ADR-003: Multi-Agent Governance Protocol v2.0
- **Decision:** Implement the Titan Governance Protocol with 4 specialized agents (Supervisor, Executor, Coder, Verifier) operating under constitutional rules.
- **Rationale:** Single-agent systems lack the adversarial verification and role separation needed for production-grade autonomous coding. Multi-agent with mandatory verification catches errors that single-agent misses.
- **Date:** 2026-02-19
- **Task ID:** GOVERNANCE-V2
- **Status:** ACTIVE

## ADR-004: Titan Protocol v2 — Parallel Lane Architecture
- **Decision:** Extend the governance system from sequential single-agent execution to parallel lane-based execution with DAG-scheduled subtasks, per-lane Worker/Verifier agents, and Supervisor-only merge authority. The original sequential Titan Protocol remains unchanged as a separate model option.
- **Rationale:** Sequential execution is a throughput bottleneck for complex multi-file tasks. Parallel lanes allow independent subtasks to execute concurrently (up to 4 workers, 4 verifiers) while preserving all 10 governance laws through lane isolation, zero-trust verification per lane, and centralized merge authority. The Supervisor decomposes goals into a DAG, dispatches ready nodes as isolated lanes, each flowing through the full Worker → Verifier → Merge pipeline. Conflict detection at merge time prevents inconsistent states.
- **Date:** 2026-02-20
- **Task ID:** TPv2
- **Status:** ACTIVE
- **References:** ADR-003 (extends, does not replace)

## ADR-005: In-Memory Lane State Store
- **Decision:** Lane and manifest state is stored in-memory on the server (Node.js singleton Map). No external database required for v2.0.
- **Rationale:** The Electron desktop architecture means single-user, single-process operation. In-memory state is sufficient for the initial release. The store interface is abstracted behind a class that can be swapped for PostgreSQL/SQLite if persistent state is needed later. All lane state is ephemeral per session.
- **Date:** 2026-02-20
- **Task ID:** TPv2-003
- **Status:** ACTIVE

---
<!-- NEW ENTRIES BELOW THIS LINE -->
