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

export const UNIVERSAL_COMPLETION_CHECKLIST = `
UNIVERSAL COMPLETION CHECKLIST (MANDATORY — EVERY PROTOCOL, EVERY MODEL, EVERY BUILD):

After ALL code changes are written, BEFORE declaring "done", you MUST run this checklist.
For each item: CHECK it (verified present) or QUIZ-SKIP it (prove it does not apply).

QUIZ-SKIP RULE: You cannot just skip an item. To skip, you must:
1. Name 2-3 specific files/locations you checked to confirm the item is irrelevant
2. State WHY it does not apply to this specific build (e.g., "No forms exist in this project — only static content")
3. If you cannot name specific files you checked, the item is NOT skippable — implement it

FRONTEND:
□ All pages/routes are created and accessible
□ All buttons and interactive elements have click handlers
□ All forms have validation, submit handlers, and error display
□ UI is responsive (mobile, tablet, desktop)
□ Loading states shown during async operations
□ Error states shown when operations fail
□ Navigation works between all pages
□ No dead links or broken routes

BACKEND:
□ All API endpoints are implemented and return correct data
□ API error handling returns proper HTTP status codes (400, 401, 403, 404, 500)
□ Input validation on every endpoint (reject malformed data)
□ No unhandled promise rejections or uncaught exceptions

DATABASE:
□ Schema/migrations are created and runnable
□ Seed data or sample data exists for testing
□ Foreign keys and constraints are correct
□ No N+1 query issues in common paths

AUTH:
□ Login/signup flow works end-to-end
□ Protected routes/endpoints require authentication
□ Tokens/sessions expire and refresh correctly
□ Role-based access control if the spec requires it

API INTEGRATION:
□ CORS configured for all client origins
□ Rate limiting on public-facing endpoints
□ API keys/secrets are in environment variables, never in code

TESTING:
□ Critical business logic has unit tests
□ Main user flows have integration or E2E tests
□ Edge cases are tested (empty inputs, max lengths, invalid data)

DEPLOYMENT:
□ Environment variables are documented
□ Production build completes without errors or warnings
□ README has setup and run instructions

UX:
□ User actions have visual feedback (toasts, modals, spinners)
□ Empty states show helpful messages (not blank screens)
□ Destructive actions have confirmation dialogs

PERFORMANCE:
□ Images are optimized and lazy-loaded where appropriate
□ No unnecessary re-renders or expensive computations on every frame
□ Large lists use virtualization or pagination

SECURITY:
□ User input is sanitized (XSS prevention)
□ No secrets, API keys, or credentials in client-side code
□ SQL injection prevention (parameterized queries)

ACCESSIBILITY:
□ Images have alt text
□ Keyboard navigation works for all interactive elements
□ Color contrast meets WCAG AA minimum`;

export const UNIVERSAL_COMPLETION_CHECKLIST_COMPACT = `
COMPLETION CHECKLIST (MANDATORY — run after ALL code, before declaring done):
For each item: CHECK (verified) or QUIZ-SKIP (name 2-3 files you checked + why it doesn't apply).
You CANNOT blindly skip — prove non-applicability or implement it.

FRONTEND: routes accessible, buttons have handlers, forms validated, responsive, loading/error states, navigation works
BACKEND: endpoints implemented, proper HTTP status codes, input validation, no unhandled rejections
DATABASE: schema created, seed data exists, constraints correct
AUTH: login/signup works E2E, protected routes enforced, tokens expire correctly
API: CORS configured, rate limiting, secrets in env vars only
TESTING: unit tests for critical logic, E2E for user flows, edge cases covered
DEPLOY: env vars documented, production build clean, README has instructions
UX: visual feedback on actions, empty states handled, destructive actions confirmed
PERF: images optimized, no unnecessary re-renders, large lists paginated
SECURITY: input sanitized, no client-side secrets, parameterized queries
A11Y: alt text on images, keyboard navigation, color contrast meets WCAG AA`;

export const GIT_RULES = `
GIT RULES (applies to ALL Titan AI commits):
- Version lives in 3 files: package.json, apps/desktop/package.json, apps/web/package.json. ALL THREE must match.
- manifest.json is auto-updated by CI. Never edit it manually.
- Before ANY commit: verify no broken imports (every import must resolve to a real file/module).
- Before version bump: verify the code compiles. Never tag broken code.
- Commit format: "vX.Y.Z: one-line description"
- After push: verify with git log --oneline -3. After tag push: verify CI with gh run list --limit 3.
- NEVER force-push to main.

IRON RULE — COMMIT BEFORE TAG (NON-NEGOTIABLE):
  The release pipeline REQUIRES that the version bump commit exists on main BEFORE any tag is created.
  If you push a tag pointing to a commit where package.json has the OLD version:
  - electron-builder builds the OLD version (reads version from package.json at that commit)
  - manifest update writes a download URL for the NEW version (reads version from tag name)
  - Result: download URL 404 because the .exe filename doesn't match
  This happened on v0.3.67 and v0.3.68 and broke the landing page for users.
  
  CORRECT ORDER (every time, no exceptions):
  1. Bump version in 3 package.json files
  2. git add -A; git commit -m "vX.Y.Z: description"
  3. git push origin main
  4. VERIFY: git show HEAD:package.json must show the NEW version
  5. git tag -a vX.Y.Z -m "vX.Y.Z: description"
  6. git push origin vX.Y.Z
  
  If you already pushed a bad tag: delete it (git tag -d vX.Y.Z; git push origin --delete vX.Y.Z), commit properly, re-tag.

LOCKFILE RULE — ALWAYS SYNC pnpm-lock.yaml (NON-NEGOTIABLE):
  CI runs pnpm install --frozen-lockfile. If pnpm-lock.yaml doesn't match any package.json, CI FAILS instantly.
  After ANY change to ANY package.json (adding deps, removing deps, changing versions):
  1. Run: pnpm install (locally, without --frozen-lockfile)
  2. Commit the updated pnpm-lock.yaml alongside the package.json changes
  3. Never push package.json changes without the matching lockfile update
  This killed v0.3.68 CI on its first attempt (stale entries for removed deps y-webrtc, yjs).
  
  HOW TO FIX if CI fails with ERR_PNPM_OUTDATED_LOCKFILE:
  1. Run: pnpm install (locally)
  2. git add pnpm-lock.yaml; git commit -m "fix: sync pnpm-lock.yaml"
  3. git push origin main
  4. If a tag was already pushed and failed: delete it, re-tag after the fix commit.

DESKTOP BUILD / ELECTRON PACKAGING RULES (NON-NEGOTIABLE):
  The desktop .exe is built by electron-builder using NSIS. The packaged app includes:
  - apps/desktop/dist/ (compiled desktop code)
  - apps/desktop/node_modules/ (desktop dependencies)
  - apps/web/.next/standalone/ (the entire compiled Next.js server + its node_modules)
  - apps/web/.next/static/ (static assets)
  - apps/web/public/ (public assets)
  
  NSIS BUFFER OVERFLOW (v0.3.74-v0.3.77 incident):
  NSIS processes every file individually and logs each one to stdout. When the total file count
  gets too high (thousands of files from standalone + node_modules), the stdout exceeds Node.js
  V8 max string length (~512MB), causing: RangeError: Invalid string length at Array.join.
  The build runs for 1+ hour then crashes. This killed v0.3.74 through v0.3.77 desktop releases.
  
  PREVENTION (enforced in electron-builder.config.js):
  electron-builder.config.js has aggressive file exclusion filters on both 'files' and 'extraResources'.
  These exclude files that are NEVER needed at runtime:
  - .map (source maps — only for dev debugging)
  - .d.ts, .d.mts, .d.cts (TypeScript declarations — only for compilation, not runtime)
  - README, CHANGELOG, HISTORY, LICENSE, *.md (documentation)
  - __tests__/, test/, tests/, spec/ (package test suites)
  - docs/ (documentation directories)
  - .tsbuildinfo, tsconfig*.json, .eslintrc*, .prettierrc* (dev tooling configs)
  These are safe to exclude because the standalone output is fully compiled JS — Node.js never
  reads .d.ts files or source maps at runtime. The user's project files are separate (on their disk).
  
  GOD-TIER FIX (v0.3.79+): PRE-COMPRESS STANDALONE + NSISBI + FIRST-LAUNCH EXTRACTION:
  Instead of feeding 100,000+ files to NSIS, the CI pipeline now:
  1. Flattens pnpm symlinks with apps/desktop/scripts/prepare-standalone.js
  2. Tars the entire standalone directory into ONE file (web-server-standalone.tar)
  3. electron-builder packages that single tar file instead of 100k+ individual files
  4. NSISBI custom binary replaces standard NSIS (handles >2GB installers)
  5. On first launch, apps/desktop/src/main.ts extractWebServerIfNeeded() extracts the tar
  
  FIRST-LAUNCH TAR EXTRACTION (v0.3.83+ — CRITICAL KNOWLEDGE):
  The extraction uses spawnSync('tar', [...], { stdio: 'ignore' }) from child_process.
  ALL THREE stdio channels MUST be 'ignore' — piping even stderr causes ENOBUFS on Windows
  because tar.exe prints every filename and Windows pipe buffers overflow with 100k+ files.
  NEVER use execFileSync or execSync for tar — they buffer output and cause ENOBUFS.
  NEVER add the 'tar' npm package — v7 is ESM-only and crashes Electron's CJS main process.
  NEVER use dynamic await import('child_process') — use static top-level imports.
  
  FORGE / SCRAPERS REMOVED FROM DESKTOP (v0.3.83+):
  @titan/forge was removed from apps/web to reduce standalone file count. The packages/forge
  directory still exists for future separate deployment (its own subdomain/service).
  next.config.js uses outputFileTracingExcludes to exclude forge, playwright, tests, and docs.
  
  NSISBI CUSTOM BINARY (CRITICAL — v0.3.79-v0.3.80 incident):
  electron-builder.config.js uses customNsisBinary to download NSISBI from GitHub.
  The ONLY valid URL is: https://github.com/SoundSafari/NSISBI-ElectronBuilder/releases/download/1.0.0/nsisbi-electronbuilder-3.10.3.7z
  Checksum: WRmZUsACjIc2s7bvsFGFRofK31hfS7riPlcfI1V9uFB2Q8s7tidgI/9U16+X0I9X2ZhNxi8N7Z3gKvm6ojvLvg==
  - NEVER change this URL unless the NSISBI repo explicitly publishes a new release
  - v0.3.79 failed because the URL was wrong (pointed to AstraliteHeart/v1.0.1 which doesn't exist)
  - The error for a bad URL is: "ERR_ELECTRON_BUILDER_CANNOT_EXECUTE" + "status code 404"
  - If you see that error, CHECK THE customNsisBinary URL FIRST — it's almost certainly a 404
  
  IF THE DESKTOP BUILD FAILS WITH "RangeError: Invalid string length":
  1. The tar approach should prevent this, but if it recurs: the standalone tar may have been skipped
  2. Verify release-desktop.yml has the "Prepare web standalone for packaging" step
  3. Verify electron-builder.config.js extraResources points to web-server-standalone.tar (not the dir)
  4. Check electron-builder.config.js exclusion filters — add more patterns if needed
  5. NEVER remove the existing exclusion filters — they are the only thing preventing the overflow
  
  CLIENT VS SERVER MODULE BOUNDARIES:
  - Client components (anything imported by pages/components rendered in browser) CANNOT import
    Node.js-only modules (child_process, fs, path, etc.). Webpack will fail at build time.
  - If a client component needs server functionality, use an API route as a proxy.
  - The @titan/mcp-servers package is desktop-only (uses Playwright). In web API routes that
    import it, use: // @ts-ignore + /* webpackIgnore: true */ on the dynamic import.
    This makes the import skip both TypeScript checking and webpack bundling.
    On Railway (web deploy), the route returns 503 "not available in web deployment".`;
