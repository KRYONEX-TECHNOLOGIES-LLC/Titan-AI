// ── DEPRECATED — Plan Sniper V2 ──────────────────────────────────────────────
// The EXECUTOR role has been eliminated in Plan Sniper V2.
// CODER now uses native tool/function calling via callModelWithTools,
// executing create_file, edit_file, run_command, etc. directly.
// This file is kept only for backward compatibility — it is NOT imported
// by the V2 orchestrator or any active code path.
//
// See: sniper-worker.ts for the V2 CODER with direct tool calling.
// See: sniper-orchestrator.ts for the V2 pipeline (SCANNER -> ARCHITECT -> CODER -> SENTINEL -> JUDGE).

export {};
