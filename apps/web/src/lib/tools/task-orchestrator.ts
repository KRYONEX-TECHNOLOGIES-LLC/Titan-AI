/**
 * Titan Task Orchestrator — "Handle Any Task"
 *
 * Parses user intent (movie, pizza, tickets, etc.), builds a tool chain,
 * requires confirmation for spending/messaging, and can run in background.
 * Inspired by Copilot Tasks / Gemini 2026 multi-step automation.
 */

import { titanToolRegistry, type ToolResult } from './tool-registry';

export type TaskCategory = 'food' | 'travel' | 'entertainment' | 'shopping' | 'finance' | 'home' | 'communication' | 'coding' | 'research' | 'general';
export type ConfirmationLevel = 'none' | 'confirm' | 'confirm_payment';
export type TaskStatus = 'pending' | 'awaiting_confirmation' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface TaskIntent {
  category: TaskCategory;
  action: string;
  description: string;
  toolChain: ToolChainStep[];
  confirmationLevel: ConfirmationLevel;
  estimatedCost?: string;
}

export interface ToolChainStep {
  toolId: string;
  args: Record<string, unknown>;
  description: string;
  dependsOn?: number;
  requiresConfirmation: boolean;
}

export interface TaskExecution {
  id: string;
  intent: TaskIntent;
  status: TaskStatus;
  results: Array<{ step: number; result: ToolResult; timestamp: number }>;
  confirmationMessage?: string;
  createdAt: number;
  completedAt?: number;
  error?: string;
}

const TASKS_KEY = 'titan-task-executions';
let taskCounter = 0;

function genTaskId(): string {
  return `task-${Date.now().toString(36)}-${(++taskCounter).toString(36)}`;
}

function loadTasks(): TaskExecution[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveTasks(tasks: TaskExecution[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks.slice(-50)));
  } catch { /* quota */ }
}

// ═══ Intent Detection ═══

const INTENT_PATTERNS: Array<{ patterns: RegExp[]; category: TaskCategory; action: string }> = [
  { patterns: [/order (?:a )?pizza/i, /get (?:me )?food/i, /order (?:from|food)/i, /uber eats/i, /doordash/i, /grubhub/i], category: 'food', action: 'order_food' },
  { patterns: [/order groceries/i, /grocery (?:delivery|order)/i, /instacart/i], category: 'food', action: 'order_groceries' },
  { patterns: [/book (?:a )?flight/i, /plane ticket/i, /fly to/i, /flights? (?:to|from)/i], category: 'travel', action: 'book_flight' },
  { patterns: [/book (?:a )?hotel/i, /find (?:a )?hotel/i, /accommodation/i, /airbnb/i], category: 'travel', action: 'book_hotel' },
  { patterns: [/buy ticket/i, /event ticket/i, /concert ticket/i, /game ticket/i], category: 'travel', action: 'buy_ticket' },
  { patterns: [/pick (?:a )?movie/i, /recommend (?:a )?movie/i, /what (?:should|to) watch/i, /movie night/i, /find (?:a )?(?:movie|show|film)/i], category: 'entertainment', action: 'pick_movie' },
  { patterns: [/buy|purchase|shop for/i, /order (?:from amazon|online)/i], category: 'shopping', action: 'shop' },
  { patterns: [/set (?:the )?thermostat/i, /turn (?:on|off) (?:the )?(?:lights?|ac|heat)/i, /lock (?:the )?door/i, /check (?:the )?camera/i], category: 'home', action: 'device_control' },
  { patterns: [/send (?:a )?message/i, /text|dm|email/i, /tell (?:them|him|her)/i], category: 'communication', action: 'send_message' },
  { patterns: [/trade|buy (?:stock|crypto|bitcoin)|sell (?:stock|crypto)/i, /check (?:my )?portfolio/i], category: 'finance', action: 'trade' },
  { patterns: [/research|look up|find out|learn about/i], category: 'research', action: 'research' },
];

/**
 * Parse a user message to detect task intent and build a tool chain.
 */
export function detectIntent(message: string): TaskIntent | null {
  const lower = message.toLowerCase();

  for (const { patterns, category, action } of INTENT_PATTERNS) {
    if (patterns.some(p => p.test(lower))) {
      return buildIntent(category, action, message);
    }
  }

  return null;
}

function buildIntent(category: TaskCategory, action: string, message: string): TaskIntent {
  const toolChain: ToolChainStep[] = [];
  let confirmationLevel: ConfirmationLevel = 'none';
  let estimatedCost: string | undefined;

  switch (action) {
    case 'order_food':
      toolChain.push(
        { toolId: 'web_search', args: { query: `${message} near me menu prices` }, description: 'Search for restaurants and menus', requiresConfirmation: false },
        { toolId: 'web_fetch', args: { url: '' }, description: 'Fetch menu details', dependsOn: 0, requiresConfirmation: false },
      );
      confirmationLevel = 'confirm_payment';
      estimatedCost = '$15-50';
      break;

    case 'order_groceries':
      toolChain.push(
        { toolId: 'web_search', args: { query: `grocery delivery ${message}` }, description: 'Search grocery delivery options', requiresConfirmation: false },
      );
      confirmationLevel = 'confirm_payment';
      estimatedCost = '$30-150';
      break;

    case 'book_flight':
      toolChain.push(
        { toolId: 'web_search', args: { query: `${message} flight prices` }, description: 'Search for flights', requiresConfirmation: false },
        { toolId: 'web_fetch', args: { url: '' }, description: 'Get flight details', dependsOn: 0, requiresConfirmation: false },
      );
      confirmationLevel = 'confirm_payment';
      estimatedCost = '$100-1000+';
      break;

    case 'book_hotel':
      toolChain.push(
        { toolId: 'web_search', args: { query: `${message} hotel prices ratings` }, description: 'Search for hotels', requiresConfirmation: false },
      );
      confirmationLevel = 'confirm_payment';
      estimatedCost = '$50-500/night';
      break;

    case 'buy_ticket':
      toolChain.push(
        { toolId: 'web_search', args: { query: `${message} tickets prices availability` }, description: 'Search for tickets', requiresConfirmation: false },
      );
      confirmationLevel = 'confirm_payment';
      break;

    case 'pick_movie':
      toolChain.push(
        { toolId: 'web_search', args: { query: `${message} best rated 2026 streaming` }, description: 'Find movie recommendations', requiresConfirmation: false },
      );
      confirmationLevel = 'none';
      break;

    case 'shop':
      toolChain.push(
        { toolId: 'web_search', args: { query: `${message} best price reviews` }, description: 'Search for product', requiresConfirmation: false },
      );
      confirmationLevel = 'confirm_payment';
      break;

    case 'device_control':
      toolChain.push(
        { toolId: 'device_list', args: {}, description: 'List available devices', requiresConfirmation: false },
        { toolId: 'device_command', args: {}, description: 'Execute device command', dependsOn: 0, requiresConfirmation: true },
      );
      confirmationLevel = 'confirm';
      break;

    case 'send_message':
      toolChain.push(
        { toolId: 'message_send', args: {}, description: 'Send message', requiresConfirmation: true },
      );
      confirmationLevel = 'confirm';
      break;

    case 'trade':
      toolChain.push(
        { toolId: 'check_markets', args: {}, description: 'Check current market data', requiresConfirmation: false },
        { toolId: 'web_search', args: { query: `${message} analysis` }, description: 'Research trade opportunity', requiresConfirmation: false },
      );
      confirmationLevel = 'confirm_payment';
      break;

    case 'research':
      toolChain.push(
        { toolId: 'research_topic', args: { topic: message, depth: 'medium' }, description: 'Deep research topic', requiresConfirmation: false },
      );
      confirmationLevel = 'none';
      break;

    default:
      toolChain.push(
        { toolId: 'web_search', args: { query: message }, description: 'Search for information', requiresConfirmation: false },
      );
      confirmationLevel = 'none';
  }

  return {
    category,
    action,
    description: message,
    toolChain,
    confirmationLevel,
    estimatedCost,
  };
}

/**
 * Build a human-readable confirmation message for the user.
 */
export function buildConfirmationMessage(intent: TaskIntent): string {
  const parts: string[] = [];

  switch (intent.confirmationLevel) {
    case 'confirm_payment':
      parts.push(`I'll help you with: ${intent.description}`);
      if (intent.estimatedCost) parts.push(`Estimated cost: ${intent.estimatedCost}`);
      parts.push('');
      parts.push('Steps I will take:');
      for (const step of intent.toolChain) {
        parts.push(`  - ${step.description}`);
      }
      parts.push('');
      parts.push('This may involve a purchase. I will show you options and get your approval before any payment.');
      parts.push('Proceed? (Yes/No)');
      break;

    case 'confirm':
      parts.push(`I'll help you with: ${intent.description}`);
      parts.push('');
      parts.push('Steps:');
      for (const step of intent.toolChain) {
        parts.push(`  - ${step.description}`);
      }
      parts.push('');
      parts.push('Proceed? (Yes/No)');
      break;

    default:
      return '';
  }

  return parts.join('\n');
}

/**
 * Execute a task's tool chain. Stops at confirmation-required steps
 * and returns the partial result for the user to approve.
 */
export async function executeTask(taskId: string): Promise<TaskExecution> {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  task.status = 'running';
  saveTasks(tasks);

  for (let i = 0; i < task.intent.toolChain.length; i++) {
    const step = task.intent.toolChain[i];

    if (step.requiresConfirmation && task.status !== 'running') {
      task.status = 'awaiting_confirmation';
      task.confirmationMessage = `Step ${i + 1}: ${step.description}\nApprove this step? (Yes/No)`;
      saveTasks(tasks);
      return task;
    }

    // If step depends on a previous step, inject its result
    if (step.dependsOn !== undefined) {
      const depResult = task.results.find(r => r.step === step.dependsOn);
      if (depResult?.result.data) {
        step.args = { ...step.args, ...(depResult.result.data as Record<string, unknown>) };
      }
    }

    const result = await titanToolRegistry.execute(step.toolId, step.args);
    task.results.push({ step: i, result, timestamp: Date.now() });

    if (!result.success) {
      task.status = 'failed';
      task.error = result.error || `Step ${i + 1} failed: ${step.description}`;
      task.completedAt = Date.now();
      saveTasks(tasks);
      return task;
    }
  }

  task.status = 'completed';
  task.completedAt = Date.now();
  saveTasks(tasks);
  return task;
}

/**
 * Create a new task execution from an intent.
 */
export function createTask(intent: TaskIntent): TaskExecution {
  const task: TaskExecution = {
    id: genTaskId(),
    intent,
    status: 'pending',
    results: [],
    createdAt: Date.now(),
  };

  if (intent.confirmationLevel !== 'none') {
    task.status = 'awaiting_confirmation';
    task.confirmationMessage = buildConfirmationMessage(intent);
  }

  const tasks = loadTasks();
  tasks.push(task);
  saveTasks(tasks);

  return task;
}

/**
 * Confirm a task and continue execution.
 */
export async function confirmTask(taskId: string): Promise<TaskExecution> {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  task.status = 'running';
  saveTasks(tasks);
  return executeTask(taskId);
}

/**
 * Cancel a pending/awaiting task.
 */
export function cancelTask(taskId: string): boolean {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task || task.status === 'completed') return false;
  task.status = 'cancelled';
  task.completedAt = Date.now();
  saveTasks(tasks);
  return true;
}

/**
 * List recent tasks.
 */
export function listTasks(limit = 10): TaskExecution[] {
  return loadTasks()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}
