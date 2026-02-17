/**
 * Project Midnight - End-to-End Test
 * Validates the complete flow: Queue -> Actor -> Sentinel -> Handoff
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Import types
import type {
  MidnightTask,
  ProjectDNA,
  SentinelVerdict,
  TaskResult,
} from '../../src/types.js';

// Mock LLM responses
const mockActorResponse = {
  content: `I'll implement the authentication module as requested.

First, I'll read the existing code structure and then create the necessary files.

Using tool: write_file
Path: src/auth/login.ts
Content: export function login(username: string, password: string) { ... }

Using tool: write_file
Path: src/auth/logout.ts
Content: export function logout() { ... }

Using tool: run_tests
Pattern: auth

All tests pass. Task complete.

Using tool: task_complete
Summary: Implemented authentication module with login and logout functions.`,
  toolCalls: [
    {
      id: 'call_1',
      name: 'write_file',
      arguments: {
        path: 'src/auth/login.ts',
        content: `export function login(username: string, password: string): boolean {
  if (!username || !password) {
    throw new Error('Username and password are required');
  }
  // Validate credentials
  return true;
}`,
      },
    },
    {
      id: 'call_2',
      name: 'task_complete',
      arguments: {
        summary: 'Implemented authentication module with login and logout functions.',
      },
    },
  ],
  usage: { promptTokens: 1000, completionTokens: 500 },
};

const mockSentinelPassResponse = {
  content: `{
    "quality_score": 92,
    "passed": true,
    "audit_log": {
      "traceability": {
        "mapped": ["auth/login", "auth/logout"],
        "missing": [],
        "unplannedAdditions": []
      },
      "architectural_sins": [],
      "slop_patterns_detected": []
    },
    "correction_directive": null,
    "merkle_hash": "abc123def456"
  }`,
  usage: { promptTokens: 2000, completionTokens: 300 },
};

const mockSentinelFailResponse = {
  content: `{
    "quality_score": 65,
    "passed": false,
    "audit_log": {
      "traceability": {
        "mapped": ["auth/login"],
        "missing": ["auth/logout"],
        "unplannedAdditions": []
      },
      "architectural_sins": ["Missing error handling"],
      "slop_patterns_detected": ["TODO comment detected"]
    },
    "correction_directive": "The logout function is missing. Please implement auth/logout as specified in the requirements."
  }`,
  usage: { promptTokens: 2000, completionTokens: 400 },
};

// Create mock LLM client
function createMockLLMClient(responses: Array<{ content: string; toolCalls?: any[]; usage: any }>) {
  let callIndex = 0;
  
  return {
    chat: vi.fn().mockImplementation(async () => {
      const response = responses[callIndex % responses.length];
      callIndex++;
      return response;
    }),
  };
}

// Create mock tool executor
function createMockToolExecutor(workspacePath: string) {
  const files = new Map<string, string>();
  
  return {
    execute: vi.fn().mockImplementation(async (name: string, args: Record<string, unknown>) => {
      switch (name) {
        case 'read_file':
          return files.get(args.path as string) || 'File not found';
        case 'write_file':
          files.set(args.path as string, args.content as string);
          return `Wrote to ${args.path}`;
        case 'run_command':
          return 'Command executed successfully';
        case 'run_tests':
          return 'All tests pass';
        case 'git_diff':
          return `diff --git a/src/auth/login.ts b/src/auth/login.ts
new file mode 100644
+export function login(username: string, password: string) {
+  return true;
+}`;
        case 'git_commit':
          return 'Committed successfully';
        case 'task_complete':
          return `Task complete: ${args.summary}`;
        default:
          return `Unknown tool: ${name}`;
      }
    }),
    getFiles: () => files,
  };
}

// Create mock worktree manager
function createMockWorktreeManager() {
  const worktrees = new Map<string, string>();
  
  return {
    create: vi.fn().mockImplementation(async (projectPath: string, branchName: string) => {
      const worktreePath = `/tmp/worktrees/${branchName}`;
      worktrees.set(worktreePath, branchName);
      return worktreePath;
    }),
    getGitDiff: vi.fn().mockImplementation(async () => {
      return 'diff --git a/src/auth/login.ts b/src/auth/login.ts\n+export function login() {}';
    }),
    revert: vi.fn().mockResolvedValue(undefined),
    merge: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getWorktrees: () => worktrees,
  };
}

// Create mock repo map provider
function createMockRepoMapProvider() {
  return {
    getRepoMap: vi.fn().mockResolvedValue(`# Repository Structure
## Classes
- AuthService @ src/auth/service.ts:1
## Functions
- login @ src/auth/login.ts:1
- logout @ src/auth/logout.ts:1`),
  };
}

describe('Project Midnight E2E Flow', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for test
    tempDir = path.join(os.tmpdir(), `midnight-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    
    // Create project DNA files
    await fs.mkdir(path.join(tempDir, 'project1'), { recursive: true });
    
    await fs.writeFile(
      path.join(tempDir, 'project1', 'idea.md'),
      `# Authentication Module
Build a simple authentication system with login and logout functionality.`
    );
    
    await fs.writeFile(
      path.join(tempDir, 'project1', 'tech_stack.json'),
      JSON.stringify({
        language: 'typescript',
        runtime: 'node',
        framework: 'none',
        testing: 'vitest',
      })
    );
    
    await fs.writeFile(
      path.join(tempDir, 'project1', 'definition_of_done.md'),
      `# Definition of Done
- [ ] Implement login function
- [ ] Implement logout function
- [ ] Add input validation
- [ ] All tests pass`
    );
  });

  afterEach(async () => {
    // Cleanup
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Task Execution Flow', () => {
    it('should complete a task when Actor succeeds and Sentinel approves', async () => {
      // Import dynamically to avoid module resolution issues
      const { ActorAgent, DEFAULT_ACTOR_CONFIG } = await import('../../src/agents/actor.js');
      const { SentinelAgent, DEFAULT_SENTINEL_CONFIG } = await import('../../src/agents/sentinel.js');
      const { AgentLoop, DEFAULT_LOOP_CONFIG } = await import('../../src/agents/agent-loop.js');

      // Create mocks
      const actorLLM = createMockLLMClient([mockActorResponse]);
      const sentinelLLM = createMockLLMClient([mockSentinelPassResponse]);
      const toolExecutor = createMockToolExecutor(tempDir);
      const worktreeManager = createMockWorktreeManager();
      const repoMapProvider = createMockRepoMapProvider();

      // Create agents
      const actor = new ActorAgent(
        { ...DEFAULT_ACTOR_CONFIG, workspacePath: tempDir },
        actorLLM as any,
        toolExecutor
      );
      
      const sentinel = new SentinelAgent(
        DEFAULT_SENTINEL_CONFIG,
        sentinelLLM as any
      );

      // Create agent loop
      const loop = new AgentLoop(
        DEFAULT_LOOP_CONFIG,
        actor,
        sentinel,
        worktreeManager,
        repoMapProvider
      );

      // Create task
      const task: MidnightTask = {
        id: 'task-001',
        projectId: 'project-1',
        description: 'Implement authentication module with login and logout',
        requirements: ['login', 'logout'],
        priority: 1,
        status: 'pending',
        createdAt: Date.now(),
        worktreePath: tempDir,
      };

      // Execute task
      const result = await loop.executeTask(
        task,
        'Authentication module context',
        '# Project Plan\n- Implement auth module',
        '# Definition of Done\n- Login function works\n- Logout function works'
      );

      // Verify success
      expect(result.success).toBe(true);
      expect(result.verdicts).toHaveLength(1);
      expect(result.verdicts[0].passed).toBe(true);
      expect(result.verdicts[0].qualityScore).toBeGreaterThanOrEqual(85);
      
      // Verify worktree was created
      expect(worktreeManager.create).toHaveBeenCalled();
      
      // Verify actor was called
      expect(actorLLM.chat).toHaveBeenCalled();
      
      // Verify sentinel verified the work
      expect(sentinelLLM.chat).toHaveBeenCalled();
    });

    it('should retry when Sentinel rejects and eventually succeed', async () => {
      const { ActorAgent, DEFAULT_ACTOR_CONFIG } = await import('../../src/agents/actor.js');
      const { SentinelAgent, DEFAULT_SENTINEL_CONFIG } = await import('../../src/agents/sentinel.js');
      const { AgentLoop, DEFAULT_LOOP_CONFIG } = await import('../../src/agents/agent-loop.js');

      // First call fails, second succeeds
      const actorLLM = createMockLLMClient([mockActorResponse, mockActorResponse]);
      const sentinelLLM = createMockLLMClient([mockSentinelFailResponse, mockSentinelPassResponse]);
      const toolExecutor = createMockToolExecutor(tempDir);
      const worktreeManager = createMockWorktreeManager();
      const repoMapProvider = createMockRepoMapProvider();

      const actor = new ActorAgent(
        { ...DEFAULT_ACTOR_CONFIG, workspacePath: tempDir },
        actorLLM as any,
        toolExecutor
      );
      
      const sentinel = new SentinelAgent(
        DEFAULT_SENTINEL_CONFIG,
        sentinelLLM as any
      );

      const loop = new AgentLoop(
        DEFAULT_LOOP_CONFIG,
        actor,
        sentinel,
        worktreeManager,
        repoMapProvider
      );

      const task: MidnightTask = {
        id: 'task-002',
        projectId: 'project-1',
        description: 'Implement auth with retry',
        requirements: ['login', 'logout'],
        priority: 1,
        status: 'pending',
        createdAt: Date.now(),
        worktreePath: tempDir,
      };

      const result = await loop.executeTask(
        task,
        'Context',
        '# Plan',
        '# DoD'
      );

      // Should eventually succeed after retry
      expect(result.success).toBe(true);
      
      // Should have 2 verdicts (fail then pass)
      expect(result.verdicts).toHaveLength(2);
      expect(result.verdicts[0].passed).toBe(false);
      expect(result.verdicts[1].passed).toBe(true);
    });

    it('should lock task after max retries', async () => {
      const { ActorAgent, DEFAULT_ACTOR_CONFIG } = await import('../../src/agents/actor.js');
      const { SentinelAgent, DEFAULT_SENTINEL_CONFIG } = await import('../../src/agents/sentinel.js');
      const { AgentLoop } = await import('../../src/agents/agent-loop.js');

      // All sentinel calls fail
      const actorLLM = createMockLLMClient([mockActorResponse]);
      const sentinelLLM = createMockLLMClient([mockSentinelFailResponse]);
      const toolExecutor = createMockToolExecutor(tempDir);
      const worktreeManager = createMockWorktreeManager();
      const repoMapProvider = createMockRepoMapProvider();

      const actor = new ActorAgent(
        { ...DEFAULT_ACTOR_CONFIG, workspacePath: tempDir },
        actorLLM as any,
        toolExecutor
      );
      
      const sentinel = new SentinelAgent(
        DEFAULT_SENTINEL_CONFIG,
        sentinelLLM as any
      );

      const loop = new AgentLoop(
        {
          maxRetries: 2, // Only 2 retries for faster test
          qualityThreshold: 85,
          enableVeto: true,
          enableRevert: true,
        },
        actor,
        sentinel,
        worktreeManager,
        repoMapProvider
      );

      const events: any[] = [];
      loop.on((event) => events.push(event));

      const task: MidnightTask = {
        id: 'task-003',
        projectId: 'project-1',
        description: 'Task that will fail',
        requirements: [],
        priority: 1,
        status: 'pending',
        createdAt: Date.now(),
        worktreePath: tempDir,
      };

      const result = await loop.executeTask(
        task,
        'Context',
        '# Plan',
        '# DoD'
      );

      // Should fail after max retries
      expect(result.success).toBe(false);
      
      // Should have locked event
      const lockEvent = events.find(e => e.type === 'task_locked');
      expect(lockEvent).toBeDefined();
    });
  });

  describe('Confidence Score Calculation', () => {
    it('should calculate confidence based on verdict history', async () => {
      const { AgentLoop, DEFAULT_LOOP_CONFIG } = await import('../../src/agents/agent-loop.js');

      // Create minimal loop just for confidence testing
      const loop = new AgentLoop(
        DEFAULT_LOOP_CONFIG,
        {} as any,
        {} as any,
        {} as any,
        {} as any
      );

      // Test with passing verdicts
      const passingVerdicts: SentinelVerdict[] = [
        createMockVerdict(90, true),
        createMockVerdict(95, true),
        createMockVerdict(88, true),
      ];

      const confidence = loop.calculateConfidence(passingVerdicts);
      expect(confidence.score).toBeGreaterThan(85);
      expect(confidence.status).toBe('healthy');

      // Test with mixed verdicts
      const mixedVerdicts: SentinelVerdict[] = [
        createMockVerdict(60, false),
        createMockVerdict(75, false),
        createMockVerdict(85, true),
      ];

      const mixedConfidence = loop.calculateConfidence(mixedVerdicts);
      expect(mixedConfidence.status).toBe('warning');

      // Test with failing verdicts
      const failingVerdicts: SentinelVerdict[] = [
        createMockVerdict(40, false),
        createMockVerdict(50, false),
        createMockVerdict(55, false),
      ];

      const failingConfidence = loop.calculateConfidence(failingVerdicts);
      expect(failingConfidence.status).toBe('error');
    });
  });

  describe('VETO Conditions', () => {
    it('should VETO on hardcoded secrets', async () => {
      const { SentinelAgent, DEFAULT_SENTINEL_CONFIG } = await import('../../src/agents/sentinel.js');

      const sentinel = new SentinelAgent(
        DEFAULT_SENTINEL_CONFIG,
        { chat: vi.fn() } as any
      );

      const context = {
        task: { id: 'task-1' } as MidnightTask,
        gitDiff: `+const API_KEY = "sk-1234567890abcdefghijklmnopqrstuvwxyz1234567890"`,
        projectPlan: '',
        definitionOfDone: '',
        repoMap: '',
        previousVerdicts: [],
      };

      const violations = sentinel.checkVetoConditions(context);
      
      expect(violations).toContain('VETO: Hardcoded secret or API key detected');
    });

    it('should VETO on infinite loops', async () => {
      const { SentinelAgent, DEFAULT_SENTINEL_CONFIG } = await import('../../src/agents/sentinel.js');

      const sentinel = new SentinelAgent(
        DEFAULT_SENTINEL_CONFIG,
        { chat: vi.fn() } as any
      );

      const context = {
        task: { id: 'task-1' } as MidnightTask,
        gitDiff: `+while(true) { doSomething(); }`,
        projectPlan: '',
        definitionOfDone: '',
        repoMap: '',
        previousVerdicts: [],
      };

      const violations = sentinel.checkVetoConditions(context);
      
      expect(violations).toContain('VETO: Potential infinite loop detected');
    });
  });

  describe('Project Queue Flow', () => {
    it('should load project DNA files', async () => {
      const { ProjectLoader } = await import('../../src/queue/project-loader.js');

      const loader = new ProjectLoader();
      const projectPath = path.join(tempDir, 'project1');

      const dna = await loader.loadProject(projectPath);

      expect(dna).toBeDefined();
      expect(dna.idea).toContain('Authentication Module');
      expect(dna.techStack).toBeDefined();
      expect(dna.techStack.language).toBe('typescript');
      expect(dna.definitionOfDone).toContain('login function');
    });

    it('should extract tasks from definition of done', async () => {
      const { ProjectLoader } = await import('../../src/queue/project-loader.js');

      const loader = new ProjectLoader();
      const projectPath = path.join(tempDir, 'project1');

      const tasks = await loader.extractTasks(projectPath, 'project-1');

      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks.some(t => t.description.toLowerCase().includes('login'))).toBe(true);
    });
  });
});

// Helper to create mock verdicts
function createMockVerdict(score: number, passed: boolean): SentinelVerdict {
  return {
    id: `verdict-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    taskId: 'test-task',
    qualityScore: score,
    passed,
    thinkingEffort: 'max',
    auditLog: {
      traceability: { mapped: [], missing: [], unplannedAdditions: [] },
      architecturalSins: [],
      slopPatternsDetected: [],
    },
    correctionDirective: passed ? null : 'Fix the issues',
    merkleVerificationHash: 'abc123',
    createdAt: Date.now(),
  };
}
