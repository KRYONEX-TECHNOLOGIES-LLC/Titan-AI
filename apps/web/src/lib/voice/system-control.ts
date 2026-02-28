'use client';

import { usePlanStore } from '@/stores/plan-store';
import { useTitanVoice } from '@/stores/titan-voice.store';

export interface ControlResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

/**
 * Start Midnight Mode with an optional description/pseudo-code.
 */
export async function startMidnight(description?: string): Promise<ControlResult> {
  try {
    const res = await fetch('/api/midnight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', instruction: description || '' }),
    });
    const data = await res.json();
    return { success: res.ok, message: data.message || 'Midnight Mode started', data };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Failed to start Midnight' };
  }
}

/**
 * Stop Midnight Mode.
 */
export async function stopMidnight(): Promise<ControlResult> {
  try {
    const res = await fetch('/api/midnight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop' }),
    });
    const data = await res.json();
    return { success: res.ok, message: data.message || 'Midnight Mode stopped', data };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Failed to stop Midnight' };
  }
}

/**
 * Start Plan Mode execution.
 */
export function startPlanMode(goal?: string): ControlResult {
  try {
    const store = usePlanStore.getState();
    store.setChatMode('plan');
    if (goal) {
      store.setPlanName(goal);
    }
    return { success: true, message: `Plan Mode activated${goal ? `: ${goal}` : ''}` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Failed to start Plan Mode' };
  }
}

/**
 * Trigger codebase scan via the scan API.
 */
export async function scanProject(fileTree?: string): Promise<ControlResult> {
  try {
    const res = await fetch('/api/plan/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileTree: fileTree || '(workspace)' }),
    });
    const data = await res.json();
    return { success: res.ok, message: 'Project scan complete', data };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Scan failed' };
  }
}

/**
 * Get project/plan status.
 */
export function checkProjectStatus(): ControlResult {
  try {
    const plan = usePlanStore.getState();
    const tasks = Object.values(plan.tasks);
    const completed = tasks.filter(t => t.status === 'completed').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const failed = tasks.filter(t => t.status === 'failed').length;
    const pending = tasks.filter(t => t.status === 'pending').length;

    return {
      success: true,
      message: `Plan "${plan.planName || 'Active'}": ${completed}/${tasks.length} done, ${inProgress} in progress, ${failed} failed, ${pending} pending`,
      data: { total: tasks.length, completed, inProgress, failed, pending, planName: plan.planName },
    };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Failed to get status' };
  }
}

/**
 * Switch the chat mode.
 */
export function switchMode(mode: string): ControlResult {
  try {
    const validModes = ['agent', 'chat', 'plan'];
    const normalized = mode.toLowerCase();
    if (normalized === 'midnight') {
      return { success: true, message: 'Switching to Midnight Mode — use start_midnight command' };
    }
    if (!validModes.includes(normalized)) {
      return { success: false, message: `Invalid mode "${mode}". Valid: ${validModes.join(', ')}` };
    }
    usePlanStore.getState().setChatMode(normalized as 'agent' | 'chat' | 'plan');
    return { success: true, message: `Switched to ${normalized} mode` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Mode switch failed' };
  }
}

/**
 * Mute/unmute voice.
 */
export function muteVoice(): ControlResult {
  useTitanVoice.getState().toggleVoice();
  const muted = !useTitanVoice.getState().voiceEnabled;
  return { success: true, message: muted ? 'Voice muted' : 'Voice unmuted' };
}

/**
 * Snooze proactive thoughts.
 */
export function snoozeThoughts(durationMs = 1800000): ControlResult {
  useTitanVoice.getState().snoozeThoughts(durationMs);
  return { success: true, message: `Proactive thoughts snoozed for ${Math.round(durationMs / 60000)} minutes` };
}

/**
 * Browse a URL and extract content.
 */
export async function browseWeb(url: string): Promise<ControlResult> {
  try {
    const { fetchAndExtract } = await import('./web-browser');
    const result = await fetchAndExtract(url);
    return { success: true, message: `Fetched: ${result.title || url}`, data: { content: result.content.slice(0, 2000), title: result.title } };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Failed to browse URL' };
  }
}

/**
 * Search the brain knowledge base.
 */
export function searchKnowledge(query: string): ControlResult {
  try {
    const { queryBrain } = require('./brain-storage');
    const results = queryBrain(undefined, query) as Array<{ content: string; category: string }>;
    if (results.length === 0) return { success: true, message: `No brain entries found for "${query}"` };
    const summary = results.slice(0, 5).map((r: { content: string; category: string }) => `[${r.category}] ${r.content.slice(0, 100)}`).join('\n');
    return { success: true, message: `Found ${results.length} entries:\n${summary}`, data: { count: results.length } };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Knowledge search failed' };
  }
}

/**
 * Start the auto-learner background engine.
 */
export async function startAutoLearn(): Promise<ControlResult> {
  try {
    const { getAutoLearner } = await import('./auto-learner');
    getAutoLearner().start();
    return { success: true, message: 'Auto-learner started. I\'ll research in the background and report findings.' };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Failed to start auto-learner' };
  }
}

/**
 * Stop the auto-learner.
 */
export async function stopAutoLearn(): Promise<ControlResult> {
  try {
    const { getAutoLearner } = await import('./auto-learner');
    getAutoLearner().stop();
    return { success: true, message: 'Auto-learner stopped.' };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Failed to stop auto-learner' };
  }
}

/**
 * Start Phoenix Protocol with a goal.
 */
export async function startPhoenix(goal: string): Promise<ControlResult> {
  try {
    const res = await fetch('/api/titan/phoenix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: goal, mode: 'phoenix' }),
    });
    const data = await res.json();
    return { success: res.ok, message: data.message || `Phoenix Protocol launched: ${goal}`, data };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Failed to start Phoenix' };
  }
}

/**
 * Start Supreme Protocol with a goal.
 */
export async function startSupreme(goal: string): Promise<ControlResult> {
  try {
    const res = await fetch('/api/titan/supreme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: goal, mode: 'supreme' }),
    });
    const data = await res.json();
    return { success: res.ok, message: data.message || `Supreme Protocol launched: ${goal}`, data };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Failed to start Supreme' };
  }
}

/**
 * Start Plan Sniper Protocol with a goal.
 */
export async function startSniper(goal: string): Promise<ControlResult> {
  try {
    const res = await fetch('/api/titan/sniper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: goal, mode: 'sniper' }),
    });
    const data = await res.json();
    return { success: res.ok, message: data.message || `Plan Sniper launched: ${goal}`, data };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Failed to start Plan Sniper' };
  }
}

/**
 * Get status of all protocols.
 */
export function getProtocolStatus(): ControlResult {
  try {
    const plan = usePlanStore.getState();
    const tasks = Object.values(plan.tasks);
    const completed = tasks.filter(t => t.status === 'completed').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress').length;
    const failed = tasks.filter(t => t.status === 'failed').length;
    const mode = plan.chatMode || 'agent';

    return {
      success: true,
      message: `Mode: ${mode} | Plan "${plan.planName || 'None'}": ${completed}/${tasks.length} done, ${inProgress} active, ${failed} failed`,
      data: { mode, total: tasks.length, completed, inProgress, failed, planName: plan.planName },
    };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Failed to get protocol status' };
  }
}

/**
 * Check market/finance data (delegates to auto-learner).
 */
export async function checkMarkets(): Promise<ControlResult> {
  try {
    const { getAutoLearner } = await import('./auto-learner');
    const summary = await getAutoLearner().getMarketSummary();
    return { success: true, message: summary || 'No market data available yet. Start the auto-learner first.' };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Market check failed' };
  }
}

/**
 * Execute a voice command action.
 */
export async function executeVoiceAction(action: string, params: Record<string, string>): Promise<ControlResult> {
  switch (action) {
    case 'start_midnight': return startMidnight(params.description);
    case 'stop_midnight': return stopMidnight();
    case 'start_phoenix': return startPhoenix(params.goal || params.description || '');
    case 'start_supreme': return startSupreme(params.goal || params.description || '');
    case 'start_sniper': return startSniper(params.goal || params.description || '');
    case 'check_protocol_status': return getProtocolStatus();
    case 'scan_project': return scanProject();
    case 'check_status': return checkProjectStatus();
    case 'start_plan': return startPlanMode(params.goal);
    case 'switch_mode': return switchMode(params.mode || 'agent');
    case 'mute_voice': return muteVoice();
    case 'snooze_thoughts': return snoozeThoughts();
    case 'show_ideas': return { success: true, message: 'Loading ideas...', data: { action: 'show_ideas' } };
    case 'show_evolution': return { success: true, message: 'Loading evolution stats...', data: { action: 'show_evolution' } };
    case 'browse_web': return browseWeb(params.url || '');
    case 'search_knowledge': return searchKnowledge(params.query || '');
    case 'start_auto_learn': return startAutoLearn();
    case 'stop_auto_learn': return stopAutoLearn();
    case 'check_markets': return checkMarkets();

    case 'web_search':
    case 'search_web': {
      const query = params.query || params.url || '';
      if (!query) return { success: false, message: 'No search query provided.' };
      try {
        const res = await fetch('/api/agent/tools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool: 'web_search', args: { query } }),
        });
        const data = await res.json();
        return { success: data.success ?? res.ok, message: data.output || data.error || 'Search complete', data: data.metadata };
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : 'Web search failed' };
      }
    }

    case 'canvas_mode': {
      try {
        const { useAlfredCanvas } = await import('@/stores/alfred-canvas-store');
        const mode = params.canvasMode || 'screen';
        useAlfredCanvas.getState().setMode(mode as import('@/stores/alfred-canvas-store').CanvasMode);
        return { success: true, message: `Canvas switched to ${mode} view` };
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : 'Canvas switch failed' };
      }
    }

    case 'store_knowledge': {
      try {
        const { saveBrainEntry } = await import('./brain-storage');
        const entry = await saveBrainEntry({
          content: params.content || '',
          category: (params.category || 'knowledge') as import('./brain-storage').BrainCategory,
          source: 'alfred-tool-call',
          importance: parseInt(params.importance || '5', 10),
        });
        return { success: true, message: `Stored: [${entry.category}] "${entry.content.slice(0, 60)}..."` };
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : 'Failed to store knowledge' };
      }
    }

    case 'query_knowledge': return searchKnowledge(params.query || '');

    case 'evaluate_performance': {
      try {
        const { evaluatePerformance } = await import('./self-improvement');
        const perf = evaluatePerformance();
        return {
          success: true,
          message: `Performance: ${perf.totalInteractions} interactions, ${Math.round(perf.successRate * 100)}% success. Top areas: ${perf.topTags.join(', ')}. Weak: ${perf.weakAreas.join(', ') || 'none'}. ${perf.recentStrategies} strategies learned.`,
        };
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : 'Evaluation failed' };
      }
    }

    // ── Browser automation (delegate to /api/browser) ──

    case 'browser_navigate':
    case 'browser_click':
    case 'browser_type':
    case 'browser_scroll':
    case 'browser_screenshot':
    case 'browser_back':
    case 'browser_forward':
    case 'browser_select':
    case 'browser_get_text':
    case 'browser_evaluate':
    case 'browser_wait':
    case 'browser_close_page': {
      return callBrowserTool(action, params);
    }

    // ── IDE tool fallbacks (delegate to /api/agent/tools) ──

    case 'read_file':
    case 'create_file':
    case 'edit_file':
    case 'write_file':
    case 'delete_file':
    case 'list_directory':
    case 'glob_search':
    case 'search_code':
    case 'run_command': {
      return callAgentTool(action, params);
    }

    case 'git_commit': {
      return callAgentTool('run_command', { command: `git add -A && git commit -m "${(params.message || 'auto-commit').replace(/"/g, '\\"')}"` });
    }
    case 'git_push': {
      return callAgentTool('run_command', { command: 'git push origin HEAD' });
    }

    case 'analyze_codebase': {
      return scanProject();
    }
    case 'query_codebase': {
      return { success: true, message: `Codebase query: "${params.question}" — use the chat agent for detailed analysis.` };
    }

    // ── Messaging (channel adapter) ──

    case 'message_send': {
      try {
        const { channelManager } = await import('@/lib/channels/channel-adapter');
        const result = await channelManager.send({
          channel: (params.channel || 'telegram') as 'telegram' | 'slack' | 'discord',
          target: params.target || '',
          text: params.text || '',
        });
        return { success: result.success, message: result.success ? `Sent via ${params.channel}` : (result.error || 'Send failed') };
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : 'Messaging failed' };
      }
    }

    // ── Device control ──

    case 'device_command': {
      try {
        const { deviceBridge } = await import('@/lib/devices/device-bridge');
        type DA = Parameters<typeof deviceBridge.execute>[1];
        const result = await deviceBridge.execute(params.deviceId || '', (params.action || 'status') as DA);
        return { success: result.success, message: result.output || result.error || 'Command sent' };
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : 'Device command failed' };
      }
    }

    // ── Session spawn ──

    case 'sessions_spawn': {
      try {
        const { spawnAgent } = await import('@/lib/agents/session-spawn');
        const session = await spawnAgent({ task: params.task || '', label: params.label });
        return { success: session.status === 'completed', message: session.result || session.error || 'Agent finished' };
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : 'Spawn failed' };
      }
    }

    default: return { success: false, message: `Unknown action: ${action}` };
  }
}

async function callBrowserTool(tool: string, params: Record<string, string>): Promise<ControlResult> {
  try {
    const res = await fetch('/api/browser', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, args: params }),
    });
    const data = await res.json();
    return {
      success: data.success ?? res.ok,
      message: data.output || data.error || 'Browser command executed',
      data: data.screenshot ? { screenshot: data.screenshot } : undefined,
    };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Browser command failed' };
  }
}

async function callAgentTool(tool: string, params: Record<string, string>): Promise<ControlResult> {
  try {
    const res = await fetch('/api/agent/tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, args: params }),
    });
    const data = await res.json();
    return {
      success: data.success ?? res.ok,
      message: data.output || data.error || 'Tool executed',
      data: data.metadata,
    };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Tool call failed' };
  }
}
