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
 * Start the Forge harvester.
 */
export async function startHarvest(): Promise<ControlResult> {
  try {
    const res = await fetch('/api/forge/harvest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', workers: 100, target: 10000 }),
    });
    const data = await res.json();
    return { success: res.ok, message: data.message || 'Forge harvester started', data };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Failed to start harvester' };
  }
}

/**
 * Stop the Forge harvester.
 */
export async function stopHarvest(): Promise<ControlResult> {
  try {
    const res = await fetch('/api/forge/harvest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop' }),
    });
    const data = await res.json();
    return { success: res.ok, message: data.message || 'Forge harvester stopped', data };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : 'Failed to stop harvester' };
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
 * Execute a voice command action.
 */
export async function executeVoiceAction(action: string, params: Record<string, string>): Promise<ControlResult> {
  switch (action) {
    case 'start_midnight': return startMidnight(params.description);
    case 'stop_midnight': return stopMidnight();
    case 'scan_project': return scanProject();
    case 'check_status': return checkProjectStatus();
    case 'start_harvest': return startHarvest();
    case 'stop_harvest': return stopHarvest();
    case 'start_plan': return startPlanMode(params.goal);
    case 'switch_mode': return switchMode(params.mode || 'agent');
    case 'mute_voice': return muteVoice();
    case 'snooze_thoughts': return snoozeThoughts();
    case 'show_ideas': return { success: true, message: 'Loading ideas...', data: { action: 'show_ideas' } };
    case 'show_evolution': return { success: true, message: 'Loading evolution stats...', data: { action: 'show_evolution' } };
    default: return { success: false, message: `Unknown action: ${action}` };
  }
}
