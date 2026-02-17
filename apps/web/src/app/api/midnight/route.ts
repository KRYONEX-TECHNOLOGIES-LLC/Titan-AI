/**
 * Project Midnight API Routes
 * /api/midnight - Main status and control endpoint
 * Connects to the @titan/midnight backend service
 */

import { NextRequest, NextResponse } from 'next/server';

// Runtime state - persisted per-process (in production, use IPC to daemon)
const midnightState = {
  running: false,
  currentProject: null as { id: string; name: string; path: string; currentTask?: string } | null,
  queueLength: 0,
  confidenceScore: 100,
  confidenceStatus: 'healthy' as 'healthy' | 'warning' | 'error',
  uptime: 0,
  tasksCompleted: 0,
  tasksFailed: 0,
  tasksInProgress: 0,
  trustLevel: 1 as 1 | 2 | 3,
  startTime: 0,
  actorLogs: [] as string[],
  sentinelLogs: [] as string[],
  lastVerdict: null as { qualityScore: number; passed: boolean; message: string } | null,
  lastError: null as string | null,
};

// Simulated execution loop
let executionInterval: ReturnType<typeof setInterval> | null = null;

function startExecution() {
  if (executionInterval) return;
  
  executionInterval = setInterval(() => {
    if (!midnightState.running) return;
    
    // Simulate Actor activity
    midnightState.actorLogs.push(`[${new Date().toISOString()}] Actor: Analyzing codebase...`);
    if (midnightState.actorLogs.length > 100) midnightState.actorLogs.shift();
    
    // Simulate confidence fluctuation
    const delta = Math.random() > 0.7 ? -2 : 1;
    midnightState.confidenceScore = Math.max(60, Math.min(100, midnightState.confidenceScore + delta));
    
    if (midnightState.confidenceScore >= 85) {
      midnightState.confidenceStatus = 'healthy';
    } else if (midnightState.confidenceScore >= 70) {
      midnightState.confidenceStatus = 'warning';
    } else {
      midnightState.confidenceStatus = 'error';
    }
    
    // Simulate Sentinel verification periodically
    if (Math.random() > 0.8) {
      const passed = Math.random() > 0.3;
      const qualityScore = passed ? 85 + Math.floor(Math.random() * 15) : 60 + Math.floor(Math.random() * 20);
      
      midnightState.lastVerdict = {
        qualityScore,
        passed,
        message: passed 
          ? 'Implementation meets quality standards' 
          : 'Quality score below threshold. Reverting and re-attempting.',
      };
      
      midnightState.sentinelLogs.push(
        `[${new Date().toISOString()}] Sentinel: Verdict - ${passed ? 'PASSED' : 'FAILED'} (${qualityScore}/100)`
      );
      if (midnightState.sentinelLogs.length > 100) midnightState.sentinelLogs.shift();
      
      if (passed) {
        midnightState.tasksCompleted++;
      } else {
        midnightState.tasksFailed++;
        midnightState.sentinelLogs.push(
          `[${new Date().toISOString()}] Sentinel: REVERTING worktree to last verified hash`
        );
      }
    }
  }, 2000);
}

function stopExecution() {
  if (executionInterval) {
    clearInterval(executionInterval);
    executionInterval = null;
  }
}

/**
 * GET /api/midnight - Get current status
 */
export async function GET() {
  const uptime = midnightState.running 
    ? Date.now() - midnightState.startTime 
    : 0;

  return NextResponse.json({
    ...midnightState,
    uptime,
  });
}

/**
 * POST /api/midnight - Control commands (start, stop, pause, resume)
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, trustLevel, projectPath } = body;

  switch (action) {
    case 'start':
      if (midnightState.running) {
        return NextResponse.json(
          { error: 'Project Midnight is already running' },
          { status: 400 }
        );
      }
      midnightState.running = true;
      midnightState.startTime = Date.now();
      midnightState.trustLevel = trustLevel || midnightState.trustLevel;
      midnightState.currentProject = projectPath ? {
        id: `project-${Date.now()}`,
        name: projectPath.split('/').pop() || 'Unknown Project',
        path: projectPath,
      } : null;
      midnightState.actorLogs = [`[${new Date().toISOString()}] Actor: Project Midnight ACTIVATED`];
      midnightState.sentinelLogs = [`[${new Date().toISOString()}] Sentinel: Surveillance mode ENGAGED`];
      midnightState.lastError = null;
      startExecution();
      
      return NextResponse.json({ 
        success: true, 
        message: 'Project Midnight started',
        status: midnightState,
      });

    case 'stop':
      stopExecution();
      
      if (!midnightState.running) {
        return NextResponse.json(
          { error: 'Project Midnight is not running' },
          { status: 400 }
        );
      }
      
      midnightState.running = false;
      midnightState.currentProject = null;
      midnightState.actorLogs.push(`[${new Date().toISOString()}] Actor: SHUTDOWN complete`);
      midnightState.sentinelLogs.push(`[${new Date().toISOString()}] Sentinel: Surveillance TERMINATED`);
      
      return NextResponse.json({ 
        success: true, 
        message: 'Project Midnight stopped',
        finalStats: {
          tasksCompleted: midnightState.tasksCompleted,
          tasksFailed: midnightState.tasksFailed,
          uptime: Date.now() - midnightState.startTime,
        },
      });

    case 'pause':
      if (!midnightState.running) {
        return NextResponse.json(
          { error: 'Project Midnight is not running' },
          { status: 400 }
        );
      }
      stopExecution();
      midnightState.actorLogs.push(`[${new Date().toISOString()}] Actor: PAUSED`);
      midnightState.sentinelLogs.push(`[${new Date().toISOString()}] Sentinel: PAUSED`);
      
      return NextResponse.json({ 
        success: true, 
        message: 'Project Midnight paused',
      });

    case 'resume':
      if (!midnightState.running) {
        return NextResponse.json(
          { error: 'Project Midnight is not running' },
          { status: 400 }
        );
      }
      startExecution();
      midnightState.actorLogs.push(`[${new Date().toISOString()}] Actor: RESUMED`);
      midnightState.sentinelLogs.push(`[${new Date().toISOString()}] Sentinel: RESUMED`);
      
      return NextResponse.json({ 
        success: true, 
        message: 'Project Midnight resumed',
      });

    case 'setTrustLevel':
      if (trustLevel < 1 || trustLevel > 3) {
        return NextResponse.json(
          { error: 'Trust level must be 1, 2, or 3' },
          { status: 400 }
        );
      }
      midnightState.trustLevel = trustLevel;
      midnightState.sentinelLogs.push(
        `[${new Date().toISOString()}] Sentinel: Trust level changed to ${
          trustLevel === 1 ? 'SUPERVISED' : trustLevel === 2 ? 'ASSISTANT' : 'PROJECT MIDNIGHT'
        }`
      );
      
      return NextResponse.json({ 
        success: true, 
        message: `Trust level set to ${trustLevel}`,
      });

    case 'getLogs':
      return NextResponse.json({
        actorLogs: midnightState.actorLogs.slice(-50),
        sentinelLogs: midnightState.sentinelLogs.slice(-50),
        lastVerdict: midnightState.lastVerdict,
      });

    default:
      return NextResponse.json(
        { error: `Unknown action: ${action}` },
        { status: 400 }
      );
  }
}
