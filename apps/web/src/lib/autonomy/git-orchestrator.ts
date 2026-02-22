import { CommandOutputParser } from './command-output-parser';

export interface GitWorkflowResult {
  success: boolean;
  output: string;
  commitHash?: string;
  filesChanged?: number;
  branchName?: string;
  basedOn?: string;
  conflicts?: string[];
  pulled?: boolean;
  pushed?: boolean;
}

export interface GitExecutor {
  executeToolCall: (tool: string, args: Record<string, unknown>) => Promise<{
    success: boolean;
    output: string;
    error?: string;
    metadata?: Record<string, unknown>;
  }>;
}

function normalizeCommitMessage(type: string, scope: string | undefined, description: string): string {
  const safeType = (type || 'chore').replace(/[^a-z]/gi, '').toLowerCase() || 'chore';
  const safeScope = scope ? `(${scope.replace(/[^a-z0-9_-]/gi, '').toLowerCase()})` : '';
  const safeDesc = description.trim().replace(/\s+/g, ' ');
  return `${safeType}${safeScope}: ${safeDesc}`;
}

function extractCommitHash(output: string): string | undefined {
  const m = output.match(/\[.+\s+([a-f0-9]{7,40})\]/i) || output.match(/\b([a-f0-9]{7,40})\b/);
  return m?.[1];
}

export class GitOrchestrator {
  private parser = new CommandOutputParser();

  async commitWorkflow(
    message: string,
    executeToolCall: GitExecutor['executeToolCall'],
    type = 'feat',
    scope?: string,
  ): Promise<GitWorkflowResult> {
    const status = await executeToolCall('run_command', { command: 'git status --porcelain' });
    if (!status.success || !status.output.trim()) {
      return { success: false, output: status.output || 'No changes to commit.' };
    }

    const add = await executeToolCall('run_command', { command: 'git add .' });
    if (!add.success) return { success: false, output: add.output || add.error || 'git add failed' };

    const commitMessage = normalizeCommitMessage(type, scope, message);
    const commit = await executeToolCall('run_command', { command: `git commit -m "${commitMessage.replace(/"/g, '\\"')}"` });
    if (!commit.success) return { success: false, output: commit.output || commit.error || 'git commit failed' };

    const hash = extractCommitHash(commit.output);
    const filesChanged = (commit.output.match(/\d+\s+files?\s+changed/i) ? Number((commit.output.match(/(\d+)\s+files?\s+changed/i) || [])[1]) : undefined);
    return {
      success: true,
      output: commit.output,
      commitHash: hash,
      filesChanged,
    };
  }

  async syncWorkflow(branch: string, executeToolCall: GitExecutor['executeToolCall']): Promise<GitWorkflowResult> {
    const safeBranch = branch.replace(/[^A-Za-z0-9/_-]/g, '');
    const pull = await executeToolCall('run_command', { command: `git pull origin ${safeBranch}` });
    const pullExit = Number(pull.metadata?.exitCode ?? 0);
    const parsedPull = this.parser.parse(pull.output || '', pull.error || '', pullExit);
    const conflicts = parsedPull.errors
      .filter((e) => /conflict|CONFLICT/.test(e.message) || /CONFLICT/.test(e.rawLine))
      .map((e) => e.message);
    if (conflicts.length > 0 || !pull.success) {
      return { success: false, output: pull.output, conflicts };
    }

    const push = await executeToolCall('run_command', { command: `git push origin ${safeBranch}` });
    if (!push.success) return { success: false, output: `${pull.output}\n${push.output}` };
    return { success: true, output: `${pull.output}\n${push.output}`, pulled: true, pushed: true };
  }

  async branchWorkflow(
    branchName: string,
    baseBranch: string,
    executeToolCall: GitExecutor['executeToolCall'],
  ): Promise<GitWorkflowResult> {
    const safeBranch = branchName.replace(/[^A-Za-z0-9/_-]/g, '');
    const safeBase = baseBranch.replace(/[^A-Za-z0-9/_-]/g, '');
    const fetch = await executeToolCall('run_command', { command: 'git fetch origin' });
    if (!fetch.success) return { success: false, output: fetch.output || fetch.error || 'git fetch failed' };

    const checkout = await executeToolCall('run_command', { command: `git checkout -b ${safeBranch} origin/${safeBase}` });
    if (!checkout.success) return { success: false, output: checkout.output || checkout.error || 'git checkout failed' };
    return { success: true, output: checkout.output, branchName: safeBranch, basedOn: safeBase };
  }
}
