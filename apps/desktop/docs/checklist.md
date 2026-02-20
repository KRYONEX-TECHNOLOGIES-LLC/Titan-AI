# MASTER QUALITY CHECKLIST

> **Purpose:** The Ruthless Verifier's source of truth. Living document updated by Supervisor after every sprint.
> **Scope:** Specific to the Titan AI codebase and architecture.

---

## SECURITY CHECKS

- [ ] **S1: Input Validation** — All external inputs (user input, API params, file paths, URL params) are validated before use
- [ ] **S2: Credential Safety** — No API keys, tokens, passwords, or secrets hardcoded in source. All secrets in `.env` or secure storage
- [ ] **S3: Injection Prevention** — No SQL injection, XSS, command injection, or path traversal vulnerabilities. All dynamic values escaped/parameterized
- [ ] **S4: Sensitive Data** — No passwords, tokens, PII, or secrets logged to console, files, or external services

## CORRECTNESS CHECKS

- [ ] **C1: Solves the Problem** — Code actually implements what the subtask description specifies. Not a partial or adjacent solution
- [ ] **C2: Null Safety** — All function boundaries handle null/undefined inputs gracefully. No unguarded property access on nullable values
- [ ] **C3: Empty Collections** — Empty arrays, maps, sets, and strings handled correctly. No `.length` without existence check on nullable collections
- [ ] **C4: Boundary Inputs** — Maximum-size inputs, zero-length inputs, negative numbers (where applicable) do not cause overflow, OOM, or infinite loops
- [ ] **C5: Concurrency** — If concurrent access is possible (shared state, async operations, multi-user), proper synchronization is in place

## COMPLETENESS CHECKS

- [ ] **K1: No TODOs** — Zero TODO, FIXME, HACK, or XXX comments in submitted code
- [ ] **K2: No Stubs** — No functions returning hardcoded values, `null`, or `throw new Error('not implemented')`
- [ ] **K3: No Hardcoded Config** — URLs, ports, API endpoints, timeouts, and limits are configurable, not hardcoded
- [ ] **K4: Error Handling** — Every I/O boundary (network request, file read, DB query, IPC call) has try/catch or equivalent error handling

## ARCHITECTURE COMPLIANCE

- [ ] **A1: Memory Consistency** — Code does not contradict any ACTIVE decision in `memory.md`
- [ ] **A2: Approved Dependencies** — No new npm/pip/cargo dependencies introduced without Supervisor approval
- [ ] **A3: File Structure** — New files placed in correct directories per project conventions and Task Manifest

## PERFORMANCE CHECKS

- [ ] **P1: Algorithmic Efficiency** — No O(n^2) or worse operations where O(n) or O(n log n) is achievable
- [ ] **P2: No Redundant I/O** — No duplicate network calls, file reads, or DB queries for the same data in the same operation
- [ ] **P3: Resource Cleanup** — All opened file handles, network connections, event listeners, and timers are properly closed/removed

## TITAN-SPECIFIC CHECKS

- [ ] **T1: Electron IPC** — All IPC handlers have proper error handling and do not crash the main process
- [ ] **T2: Model Registry** — Any new model uses a valid ID from `MODEL_REGISTRY` in `model-registry.ts`
- [ ] **T3: System Prompt** — Changes to the system prompt do not break tool calling format or remove critical rules
- [ ] **T4: Inline Styles** — Chat UI components use inline styles (not Tailwind) to prevent class conflicts per ADR
- [ ] **T5: Path Resolution** — All file paths use `resolveToWorkspace()` or relative paths. No hardcoded absolute paths

---

**FAIL THRESHOLD:**
- Any CRITICAL finding → FAIL
- Any 2+ MAJOR findings → FAIL
- MINOR findings alone → PASS (but must be reported)

**Last Updated:** 2026-02-19
**Updated By:** Supervisor (Governance v2.0 Sprint)
