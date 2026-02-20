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

---
<!-- NEW ENTRIES BELOW THIS LINE -->
