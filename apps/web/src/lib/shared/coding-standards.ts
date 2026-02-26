// ── Titan AI — Universal Zero-Defect Coding Standard ──
// Shared across ALL protocols, models, and agents.
// This is PREVENTION, not detection. These rules stop errors before they exist.

export const ZERO_DEFECT_RULES = `
ZERO-DEFECT CODING STANDARD (MANDATORY — EVERY LINE YOU WRITE MUST FOLLOW THESE RULES):

BEFORE you write ANY code:
1. READ the target file first. Never edit a file you haven't read. Blind edits cause regressions.
2. IDENTIFY your scope. Know which function, component, or module you are inside. Variables from parent scopes are NOT accessible unless explicitly passed.
3. VERIFY every import. Every module you reference must resolve to a real, existing file. If unsure, search for it first.
4. MAP the existing patterns. Match naming conventions, error handling style, type patterns, and architecture already in the file.

WHILE writing code:
5. TYPE SAFETY. Every variable, parameter, return value, and prop must have the correct type. Never pass a string where an object is expected. Never return void where a value is needed.
6. NO PHANTOM REFERENCES. Never call a function, use a variable, or import a module that does not exist. If you are not 100% certain it exists, check first.
7. SCOPE BOUNDARIES. In multi-component files (e.g., multiple React components in one .tsx), each component is a SEPARATE scope. You CANNOT access a parent component's variables from a child — pass them as props.
8. SIGNATURE MATCHING. When calling any function, match its exact parameter count and types. When implementing an interface, implement ALL required fields.
9. COMPLETE CODE ONLY. No TODO comments, no placeholder functions, no "implement later". Every function must have a real, working body.
10. IMPORT HYGIENE. Every import must resolve. Never import from a path that doesn't exist. Never leave unused imports.

AFTER writing code (SELF-CHECK before declaring done):
11. RE-READ your edit. Does it look exactly as intended? No doubled content, no missing braces, no corrupted lines?
12. MENTAL COMPILE. Walk through the code as if you were tsc. Would it pass tsc --noEmit? Check: types match, imports resolve, exports exist, no undeclared variables.
13. SCOPE VERIFY. For every variable you used — is it actually in scope where you used it? Trace it back to its declaration.
14. SYNTAX CHECK. Balanced braces, balanced parentheses, no missing semicolons, no trailing commas in JSON.

ABSOLUTE PROHIBITIONS:
- NEVER use a variable from outside your current function/component without it being passed in
- NEVER add a duplicate variable declaration (check if the name already exists in scope)
- NEVER remove code you don't fully understand
- NEVER change a function signature without updating ALL callers
- NEVER modify config files (tsconfig, package.json scripts, webpack, railway.toml) unless that is the explicit task
- NEVER commit code that doesn't compile — run tsc --noEmit mentally or actually before considering it done
- NEVER deviate outside the project scope — if you're editing the Titan AI system, you work on the Titan AI system, not on a user's project files, and vice versa`;

export const ZERO_DEFECT_RULES_COMPACT = `
ZERO-DEFECT RULES (MANDATORY):
- READ files before editing. NEVER edit blind.
- KNOW YOUR SCOPE — only use variables available in the current function/component.
- VERIFY every import resolves to a real file.
- MATCH existing patterns (naming, types, architecture).
- TYPE SAFETY — never pass wrong types.
- NO PHANTOM REFERENCES — every variable/function/module you use MUST exist and be in scope.
- COMPLETE CODE — no TODOs, no placeholders.
- MATCH FUNCTION SIGNATURES — correct parameter count and types.
- SELF-CHECK — mentally compile before declaring done (types, imports, scope, syntax).
- NEVER use out-of-scope variables, add duplicate declarations, remove code you don't understand, or change signatures without updating callers.
- NEVER deviate outside the project scope.`;

export const TASK_DECOMPOSITION_RULES = `
TASK DECOMPOSITION STANDARD (MANDATORY FOR ALL PLAN GENERATION):

Every task MUST have subtasks — specific, verifiable acceptance criteria that serve as a checklist
for the coder and a verification matrix for the reviewer.

STRUCTURE:
- Top-level task = one independently-buildable feature, system, or module
- Subtasks = 3-8 specific, verifiable deliverables per task
- Each subtask answers YES/NO: "Does this exist and work correctly?"

SCALING (NO CEILING — proportional to input complexity):
- Landing page / static site: 5-8 tasks
- Multi-page website with forms: 10-15 tasks
- Full SaaS with auth, DB, payments: 20-35 tasks
- Enterprise platform with multiple subsystems: 35-60+ tasks
- If the user described 20 distinct systems, create 20+ tasks. NEVER compress multiple systems into one task.

SUBTASK QUALITY RULES:
- Each subtask is a single verifiable deliverable
- NEVER use vague subtasks like "implement the feature" or "add styling" or "handle edge cases"
- GOOD: "Add rate limiting: max 3 verification emails per hour per address"
- GOOD: "Create EmailVerificationToken table with userId, token, expiresAt columns"
- BAD: "Set up the email system" (too vague — what specifically?)
- BAD: "Handle errors" (which errors? what behavior?)

SUBTASK FORMAT IN JSON:
{ "title": "Build email verification system", "subtasks": ["Generate crypto random token with 24h expiry", "Store token in EmailVerificationToken table", "Send verification email via provider with clickable link", "GET /verify?token=... validates and sets emailVerifiedAt", "Reject expired or used tokens with clear error", "Rate limit: max 3 per hour per address"] }

WHY THIS MATTERS:
- The coder uses subtasks as a checklist — nothing gets forgotten
- The reviewer scores against each subtask — missed subtask = penalty
- Complex projects stay organized instead of collapsing into vague mega-tasks
- The AI never "loses focus on little things" because every little thing is explicitly listed`;

export const TASK_DECOMPOSITION_RULES_COMPACT = `
TASK DECOMPOSITION (MANDATORY):
- Every task needs 3-8 subtasks as acceptance criteria (specific, verifiable, YES/NO checkable)
- Scale task count to complexity: static site=5-8, SaaS=20-35, enterprise=35-60+. No ceiling.
- NEVER compress multiple systems into one task. NEVER use vague subtasks.
- Subtasks are the coder's checklist and the reviewer's scoring matrix.
- GOOD subtask: "Rate limit: max 3 emails/hour/address" — BAD: "Handle edge cases"`;

export const GIT_RULES = `
GIT RULES (applies to ALL Titan AI commits):
- Version lives in 3 files: package.json, apps/desktop/package.json, apps/web/package.json. ALL THREE must match.
- manifest.json is auto-updated by CI. Never edit it manually.
- Before ANY commit: verify no broken imports (every import must resolve to a real file/module).
- Before version bump: verify the code compiles. Never tag broken code.
- Commit format: "vX.Y.Z: one-line description"
- After push: verify with git log --oneline -3. After tag push: verify CI with gh run list --limit 3.
- NEVER force-push to main.`;
