export interface WorktreeInfo {
  laneId: string;
  baseBranch: string;
  path: string;
  createdAt: number;
}

export interface WorktreeCallbacks {
  runCommand: (command: string) => Promise<{ success: boolean; output: string; error?: string }>;
}

function normalizeLaneId(laneId: string) {
  return laneId.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 48);
}

export function createWorktreeManager(callbacks: WorktreeCallbacks) {
  const active = new Map<string, WorktreeInfo>();

  async function createWorktree(laneId: string, baseBranch = 'HEAD') {
    const safeId = normalizeLaneId(laneId);
    const path = `.titan-worktrees/${safeId}`;
    const branchName = `titan-lane/${safeId}`;
    const cmd = `git worktree add -b "${branchName}" "${path}" ${baseBranch}`;
    const result = await callbacks.runCommand(cmd);
    if (!result.success) {
      throw new Error(result.error || result.output || `Failed to create worktree for ${laneId}`);
    }
    const info: WorktreeInfo = { laneId, baseBranch, path, createdAt: Date.now() };
    active.set(laneId, info);
    return info;
  }

  async function mergeWorktree(laneId: string) {
    const info = active.get(laneId);
    if (!info) throw new Error(`No active worktree for lane ${laneId}`);
    const branchName = `titan-lane/${normalizeLaneId(laneId)}`;
    const result = await callbacks.runCommand(`git merge --no-ff "${branchName}"`);
    return {
      success: result.success,
      output: result.output,
      error: result.error,
    };
  }

  async function cleanupWorktree(laneId: string) {
    const info = active.get(laneId);
    if (!info) return { success: true, output: 'No worktree to clean' };
    const result = await callbacks.runCommand(`git worktree remove "${info.path}" --force`);
    if (result.success) active.delete(laneId);
    return result;
  }

  function listActiveWorktrees() {
    return Array.from(active.values());
  }

  return {
    createWorktree,
    mergeWorktree,
    cleanupWorktree,
    listActiveWorktrees,
  };
}
