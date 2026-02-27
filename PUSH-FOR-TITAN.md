# Push For Titan -- AI Operations Manual

This file contains exact instructions for any AI assistant working on the Titan AI project. Follow these steps precisely. Do not improvise. Do not skip steps.

---

## PART 1: How to Identify Files From Screenshots

When Mateo (the creator) shares a screenshot showing files or changes, follow this process:

### Step 1: Read the screenshot carefully

Look for:
- File paths visible in editor tabs, file explorer, terminal output, or git status
- File names in the title bar or breadcrumb (e.g., `src > hooks > useSessions.ts`)
- Terminal output showing modified files (e.g., `M apps/web/src/hooks/useChat.ts`)
- Titan AI tool call logs showing file operations (e.g., `Read apps/web/src/hooks/useChat...`)

### Step 2: Verify the files exist on disk

Run this in PowerShell from the repo root:

```powershell
git status --short
```

This shows every modified (`M`), added (`A`), deleted (`D`), and untracked (`??`) file. Match what you see in the screenshot to what git reports.

### Step 3: Read the files to confirm the changes

For each file shown in the screenshot or git status:

```powershell
git diff <file-path>
```

Example:

```powershell
git diff apps/web/src/hooks/useSessions.ts
```

This shows exactly what changed. Read it. Confirm it looks intentional and not corrupted.

---

## PART 2: How to Push Changes to Git

### The exact sequence -- no deviations

From the repo root (`c:\Users\lucky\OneDrive\Desktop\Titan AI`):

```powershell
# Step 1: See what changed
git status --short

# Step 2: Stage everything
git add -A

# Step 3: Commit with a descriptive message
git commit -m "description of what changed"

# Step 4: Push to remote
git push origin main
```

### Commit message rules

Use Conventional Commits format:

- `fix(scope): what was fixed` -- for bug fixes
- `feat(scope): what was added` -- for new features
- `refactor(scope): what was restructured` -- for code reorganization
- `docs: what documentation changed` -- for docs only

Examples:

```
fix(desktop): resolve PowerShell spawn ENOENT in run_command
feat(web): add session persistence with localStorage
refactor(hooks): extract useSessions from useChat
docs: add push instructions for Titan operations
```

### If push fails

```powershell
# Check remote is set
git remote -v

# If no remote, add it
git remote add origin https://github.com/KRYONEX-TECHNOLOGIES-LLC/Titan-AI.git

# Try push again
git push origin main

# If rejected (remote has newer commits), pull first then push
git pull origin main; git push origin main
```

### PowerShell syntax rules

- Use `;` to chain commands, NOT `&&` (PowerShell does not support `&&` in older versions)
- Use double quotes `"` for strings, not heredocs
- Keep commit messages on a single line when using `-m`

---

## PART 3: How to Start the Electron Desktop App

### Prerequisites check

```powershell
node -v    # Must be 20+
pnpm -v    # Must be 9+
```

If pnpm is missing:

```powershell
corepack enable
corepack prepare pnpm@9.15.0 --activate
```

### Install dependencies (only needed once or after package changes)

```powershell
cd "c:\Users\lucky\OneDrive\Desktop\Titan AI"
pnpm install
```

### Start the app

```powershell
cd "c:\Users\lucky\OneDrive\Desktop\Titan AI"
pnpm dev:desktop
```

What this does:
1. Turborepo runs the `dev` script in `apps/desktop`
2. TypeScript compiles `apps/desktop/src/` to `apps/desktop/dist/`
3. Electron starts and launches an internal Next.js server on port 3100
4. The Electron window opens showing the Titan AI IDE

### If the app does not start

**Port 3100 already in use:**

```powershell
# Kill any existing Electron processes
Get-Process -Name "electron" -ErrorAction SilentlyContinue | Stop-Process -Force

# Wait 2 seconds then start fresh
Start-Sleep -Seconds 2
pnpm dev:desktop
```

**TypeScript compilation errors:**

```powershell
cd "c:\Users\lucky\OneDrive\Desktop\Titan AI\apps\desktop"
npx tsc --noEmit
```

This shows any type errors. Fix them before running `pnpm dev:desktop` again.

**Next.js build errors:**

```powershell
cd "c:\Users\lucky\OneDrive\Desktop\Titan AI\apps\web"
npx tsc --noEmit
```

Fix any errors shown, then restart.

### How to restart after code changes

If you edited files in `apps/desktop/src/` (IPC handlers, main process, preload):

```powershell
# Kill running app
Get-Process -Name "electron" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# Recompile and restart
cd "c:\Users\lucky\OneDrive\Desktop\Titan AI"
pnpm dev:desktop
```

If you only edited files in `apps/web/src/` (React components, hooks, API routes):
The Next.js dev server hot-reloads automatically. No restart needed. But if the change is not reflected, restart the full app using the steps above.

---

## PART 4: Key File Locations

| What | Path |
|---|---|
| Desktop main process | `apps/desktop/src/main.ts` |
| IPC tool handlers (read_file, edit_file, run_command, etc.) | `apps/desktop/src/ipc/tools.ts` |
| IPC terminal handlers | `apps/desktop/src/ipc/terminal.ts` |
| Preload (renderer API bridge) | `apps/desktop/src/preload.ts` |
| Chat orchestration loop (tool calling, nudges, circuit breaker) | `apps/web/src/hooks/useChat.ts` |
| Agent tool execution layer | `apps/web/src/hooks/useAgentTools.ts` |
| Session persistence | `apps/web/src/hooks/useSessions.ts` |
| Chat API route (simple, no tools) | `apps/web/src/app/api/chat/route.ts` |
| Continue API route (tool-calling, system prompt) | `apps/web/src/app/api/chat/continue/route.ts` |
| System prompt (13 sections, 700+ lines) | Inside `apps/web/src/app/api/chat/continue/route.ts`, constant `BASE_SYSTEM_PROMPT` starting around line 300 |
| Model registry | `apps/web/src/lib/model-registry.ts` |
| Autonomy modules (retry, parser, debug loop, git, memory) | `apps/web/src/lib/autonomy/` |
| Omega Protocol models | `apps/web/src/lib/omega/` |
| IDE types | `apps/web/src/types/ide.ts` |
| Electron compiled output (what actually runs) | `apps/desktop/dist/` |
| Architectural memory (ADR log) | `apps/desktop/docs/memory.md` |
| Git remote | `https://github.com/KRYONEX-TECHNOLOGIES-LLC/Titan-AI.git` |
| Branch | `main` |

---

## PART 5: Complete Workflow Example

Mateo says: "Titan made a new file, push it"

What you do:

```powershell
cd "c:\Users\lucky\OneDrive\Desktop\Titan AI"

# 1. See what changed
git status --short

# 2. Review the changes (for each modified/new file)
git diff apps/web/src/hooks/useSessions.ts

# 3. Stage, commit, push
git add -A
git commit -m "feat(web): add session persistence hook"
git push origin main
```

Mateo says: "Restart the app"

What you do:

```powershell
Get-Process -Name "electron" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
cd "c:\Users\lucky\OneDrive\Desktop\Titan AI"
pnpm dev:desktop
```

Mateo says: "I changed some code, rebuild and restart"

What you do:

```powershell
# Type-check first
cd "c:\Users\lucky\OneDrive\Desktop\Titan AI\apps\desktop"
npx tsc --noEmit

# If clean, kill and restart
Get-Process -Name "electron" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
cd "c:\Users\lucky\OneDrive\Desktop\Titan AI"
pnpm dev:desktop
```

---

---

## PART 6: VERSION RELEASE — THE NON-NEGOTIABLE ORDER

**This section applies when releasing a new version of Titan Desktop (version bump + tag + CI build).**

### THE IRON RULE: COMMIT BEFORE TAG

The release pipeline breaks catastrophically if you push a tag before committing the version bump. This has happened before (v0.3.67 and v0.3.68) and caused 404 download links on the landing page.

**Why it breaks:**
- electron-builder reads the version from `package.json` at the commit the tag points to
- If you create a tag on a commit where `package.json` still has the OLD version, CI builds with the OLD version
- But the manifest update reads the version from the tag name and writes a download URL for the NEW version
- The .exe has the OLD version filename, the download link has the NEW version filename → 404

### THE EXACT SEQUENCE (every step is mandatory, order is mandatory)

```powershell
# 1. Bump version in EXACTLY 3 files (must all match):
#    - package.json (root)
#    - apps/desktop/package.json
#    - apps/web/package.json
#    Do NOT edit manifest.json (CI updates it automatically)

# 2. Stage and commit
git add -A
git commit -m "vX.Y.Z: description of what changed"

# 3. Verify the commit contains the version bump
git log --oneline -1
git show HEAD:package.json | Select-String "version"
# ^ Must show the NEW version. If it shows the old version, you forgot to stage.

# 4. Push to main
git push origin main

# 5. ONLY NOW create and push the tag
git tag -a vX.Y.Z -m "vX.Y.Z: description"
git push origin vX.Y.Z

# 6. Verify CI started
gh run list --workflow=release-desktop.yml --limit=3
```

### WHAT TO DO IF YOU ALREADY PUSHED A TAG WITHOUT COMMITTING

```powershell
# Delete the broken tag (local + remote)
git tag -d vX.Y.Z
git push origin --delete vX.Y.Z

# Now commit the version bump properly
git add -A
git commit -m "vX.Y.Z: description"
git push origin main

# Re-create and push the tag
git tag -a vX.Y.Z -m "vX.Y.Z: description"
git push origin vX.Y.Z
```

### LOCKFILE RULE — ALWAYS SYNC pnpm-lock.yaml

CI uses `pnpm install --frozen-lockfile`. If `pnpm-lock.yaml` doesn't match any `package.json`, **CI fails instantly** with `ERR_PNPM_OUTDATED_LOCKFILE`.

**After ANY change to ANY `package.json`** (adding, removing, or changing deps):

```powershell
# 1. Regenerate the lockfile
pnpm install

# 2. Commit the lockfile WITH the package.json changes
git add pnpm-lock.yaml
git add package.json apps/desktop/package.json apps/web/package.json
git commit -m "description"
```

**If CI already failed because of a stale lockfile:**

```powershell
# Fix locally
pnpm install
git add pnpm-lock.yaml
git commit -m "fix: sync pnpm-lock.yaml"
git push origin main

# If a tag was already pushed and failed:
git tag -d vX.Y.Z
git push origin --delete vX.Y.Z
# Then re-tag after the fix
git tag -a vX.Y.Z -m "vX.Y.Z: description"
git push origin vX.Y.Z
```

This killed v0.3.68 on its first CI attempt (stale entries for removed deps `y-webrtc`, `yjs`).

### CHECKLIST — VERIFY BEFORE TELLING MATEO IT'S DONE

- [ ] `git show HEAD:package.json` shows the new version (not the old one)
- [ ] `pnpm-lock.yaml` is committed and in sync (run `pnpm install` if any deps changed)
- [ ] `git push origin main` succeeded (exit code 0)
- [ ] `git push origin vX.Y.Z` showed `* [new tag]`
- [ ] `gh run list` shows Release Desktop as in_progress or completed
- [ ] After ~10 min: `gh release view vX.Y.Z` shows the release with .exe asset

---

**This file lives at the repo root. Any AI assistant can read it with:**

```
read file PUSH-FOR-TITAN.md
```
