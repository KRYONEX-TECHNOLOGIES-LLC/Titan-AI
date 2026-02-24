'use client';

import { useState, useEffect, useRef } from 'react';
import { ConfidenceMeter } from './ConfidenceMeter';
import { QueueList } from './QueueList';

interface FactoryViewProps {
  isOpen: boolean;
  onClose: () => void;
  onStop?: () => void;
  trustLevel?: 1 | 2 | 3;
}

interface TerminalLine {
  type: 'info' | 'success' | 'error' | 'command' | 'output';
  content: string;
  timestamp: Date;
}

interface Project {
  id: string;
  name: string;
  status: string;
  priority: number;
  progress?: number;
}

/**
 * Factory View Dashboard
 * Full-screen overlay showing Actor and Sentinel streams
 */
export function FactoryView({ isOpen, onClose, onStop, trustLevel = 3 }: FactoryViewProps) {
  const [actorLines, setActorLines] = useState<TerminalLine[]>([]);
  const [sentinelLines, setSentinelLines] = useState<TerminalLine[]>([]);
  const [confidenceScore, setConfidenceScore] = useState(100);
  const [confidenceStatus, setConfidenceStatus] = useState<'healthy' | 'warning' | 'error'>('healthy');
  const [currentProject, setCurrentProject] = useState<string>('Example Project');
  const [currentTask, setCurrentTask] = useState<string>('Building components...');
  const [progress, setProgress] = useState(35);
  const [isRunning, setIsRunning] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [tasksCompleted, setTasksCompleted] = useState(0);
  const [totalTasks, setTotalTasks] = useState(8);
  const [uptime, setUptime] = useState(0);
  const [queuedProjects, setQueuedProjects] = useState<Project[]>([
    { id: '1', name: 'Titan AI Core', status: 'building', priority: 1, progress: 35 },
    { id: '2', name: 'Dashboard UI', status: 'queued', priority: 2 },
    { id: '3', name: 'API Gateway', status: 'queued', priority: 3 },
  ]);

  // Protocol Team state
  const [activeSquad, setActiveSquad] = useState<string>('nerd_squad');
  const [activeRole, setActiveRole] = useState<string>('Alpha Nerd');
  const [escalationLevel, setEscalationLevel] = useState(0);
  const [protocolCost, setProtocolCost] = useState(0);

  const actorRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Uptime counter
  useEffect(() => {
    if (!isOpen || !isRunning) return;
    const interval = setInterval(() => {
      setUptime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, isRunning]);

  // Format uptime
  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  // Handle pause/resume
  const handlePauseResume = async () => {
    try {
      const action = isPaused ? 'resume' : 'pause';
      const res = await fetch('/api/midnight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success) {
        setIsPaused(!isPaused);
        const logLine: TerminalLine = {
          type: 'info',
          content: isPaused ? '▶ Execution resumed' : '⏸ Execution paused',
          timestamp: new Date(),
        };
        setActorLines(prev => [...prev, logLine]);
      }
    } catch (error) {
      setIsPaused(!isPaused);
    }
  };

  // Handle stop
  const handleStop = async () => {
    try {
      const res = await fetch('/api/midnight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
      const data = await res.json();
      if (data.success) {
        setIsRunning(false);
        const logLine: TerminalLine = {
          type: 'error',
          content: '⏹ Project Midnight stopped',
          timestamp: new Date(),
        };
        setActorLines(prev => [...prev, logLine]);
        setSentinelLines(prev => [...prev, { ...logLine, content: '⏹ Sentinel monitoring stopped' }]);
        onStop?.();
      }
    } catch (error) {
      setIsRunning(false);
      onStop?.();
    }
  };

  // Fetch real logs from API
  useEffect(() => {
    if (!isOpen) return;

    setActorLines([
      { type: 'info', content: 'MIDNIGHT PROTOCOL TEAM initialized (4 squads, 8 models)', timestamp: new Date() },
      { type: 'info', content: 'Nerd Squad: Alpha (MiMo-V2-Flash) | Beta (Qwen3 Coder) | Gamma (MiniMax M2.5)', timestamp: new Date() },
      { type: 'info', content: 'Cleanup Crew: Inspector (Gemini 2.5 Flash) | Surgeon (MiMo-V2-Flash)', timestamp: new Date() },
      { type: 'command', content: '$ Foreman decomposing project...', timestamp: new Date() },
    ]);

    setSentinelLines([
      { type: 'info', content: 'SENTINEL COUNCIL initialized (dual-review, consensus required)', timestamp: new Date() },
      { type: 'info', content: 'Chief Sentinel (DeepSeek V3.2) | Shadow Sentinel (DeepSeek V3.2 Speciale)', timestamp: new Date() },
      { type: 'output', content: 'Loading repository map via Tree-sitter...', timestamp: new Date() },
    ]);

    // Fetch logs from API
    const fetchLogs = async () => {
      try {
        // Get status
        const statusRes = await fetch('/api/midnight');
        const status = await statusRes.json();
        
        setConfidenceScore(status.confidenceScore || 100);
        setConfidenceStatus(status.confidenceStatus || 'healthy');
        setIsRunning(status.running);
        setTasksCompleted(status.tasksCompleted || 0);
        setTotalTasks(status.tasksCompleted + status.queueLength + 1 || 8);
        setProgress(status.tasksCompleted > 0 ? (status.tasksCompleted / (status.tasksCompleted + status.queueLength + 1)) * 100 : 35);
        
        if (status.currentProject) {
          setCurrentProject(status.currentProject.name);
          if (status.currentProject.currentTask) {
            setCurrentTask(status.currentProject.currentTask);
          }
        }

        // Get logs
        const logsRes = await fetch('/api/midnight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'getLogs' }),
        });
        const logs = await logsRes.json();

        if (logs.actorLogs) {
          setActorLines(logs.actorLogs.map((log: string) => {
            const isSuccess = log.includes('PASSED') || log.includes('complete') || log.includes('APPROVED');
            const isError = log.includes('FAILED') || log.includes('ERROR') || log.includes('Escalating');
            const isInfo = log.includes('Protocol:') || log.includes('activated');
            return {
              type: isSuccess ? 'success' : isError ? 'error' : isInfo ? 'info' : 'output',
              content: log.replace(/^\[.*?\]\s*/, '').replace('Actor:', '').replace('Protocol:', ''),
              timestamp: new Date(log.match(/\[(.*?)\]/)?.[1] || Date.now()),
            };
          }));
          // Extract protocol state from logs
          const lastProtocolLog = logs.actorLogs.findLast?.((l: string) => l.includes('activated'));
          if (lastProtocolLog) {
            const squadMatch = lastProtocolLog.match(/\((\w+)\)/);
            const nameMatch = lastProtocolLog.match(/Protocol:\s*(.+?)\s*\(/);
            if (squadMatch) setActiveSquad(squadMatch[1]);
            if (nameMatch) setActiveRole(nameMatch[1]);
          }
          const escalationLog = logs.actorLogs.findLast?.((l: string) => l.includes('Escalating'));
          if (escalationLog) setEscalationLevel(prev => prev + 1);
          const costLog = logs.actorLogs.findLast?.((l: string) => l.includes('Cost $'));
          if (costLog) {
            const costMatch = costLog.match(/Cost \$(\d+\.\d+)/);
            if (costMatch) setProtocolCost(parseFloat(costMatch[1]));
          }
        }

        if (logs.sentinelLogs) {
          setSentinelLines(logs.sentinelLogs.map((log: string) => {
            const isSuccess = log.includes('PASSED') || log.includes('APPROVED');
            const isError = log.includes('FAILED') || log.includes('VETO') || log.includes('REJECTED');
            const isInfo = log.includes('Council:');
            return {
              type: isSuccess ? 'success' : isError ? 'error' : isInfo ? 'info' : 'output',
              content: log.replace(/^\[.*?\]\s*/, '').replace('Sentinel:', '').replace('Council:', ''),
              timestamp: new Date(log.match(/\[(.*?)\]/)?.[1] || Date.now()),
            };
          }));
        }

        if (logs.lastVerdict) {
          // Add verdict to sentinel logs
          const verdictLine: TerminalLine = {
            type: logs.lastVerdict.passed ? 'success' : 'error',
            content: `${logs.lastVerdict.passed ? '✓' : '✗'} Verdict: ${logs.lastVerdict.qualityScore}/100 - ${logs.lastVerdict.message}`,
            timestamp: new Date(),
          };
          setSentinelLines(prev => {
            const lastContent = prev[prev.length - 1]?.content;
            if (lastContent !== verdictLine.content) {
              return [...prev.slice(-49), verdictLine];
            }
            return prev;
          });
        }
      } catch (error) {
        console.error('Failed to fetch logs:', error);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);

    // SSE stream for real-time events
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/midnight/stream');
      eventSource.addEventListener('actor', (e) => {
        try {
          const data = JSON.parse(e.data);
          setActorLines(prev => [...prev.slice(-49), {
            type: data.type || 'output',
            content: data.message || data.content || '',
            timestamp: new Date(data.timestamp || Date.now()),
          }]);
        } catch { /* ignore */ }
      });
      eventSource.addEventListener('sentinel', (e) => {
        try {
          const data = JSON.parse(e.data);
          setSentinelLines(prev => [...prev.slice(-49), {
            type: data.type || 'output',
            content: data.message || data.content || '',
            timestamp: new Date(data.timestamp || Date.now()),
          }]);
          if (data.confidence !== undefined) setConfidenceScore(data.confidence);
          if (data.status) setConfidenceStatus(data.status);
        } catch { /* ignore */ }
      });
      eventSource.addEventListener('progress', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.progress !== undefined) setProgress(data.progress);
          if (data.task) setCurrentTask(data.task);
          if (data.completed !== undefined) setTasksCompleted(data.completed);
          if (data.total !== undefined) setTotalTasks(data.total);
        } catch { /* ignore */ }
      });
      eventSource.onerror = () => {
        eventSource?.close();
        eventSource = null;
      };
    } catch {
      // SSE not available, fall back to polling
    }

    return () => {
      clearInterval(interval);
      eventSource?.close();
    };
  }, [isOpen]);

  // Auto-scroll terminals
  useEffect(() => {
    actorRef.current?.scrollTo(0, actorRef.current.scrollHeight);
  }, [actorLines]);

  useEffect(() => {
    sentinelRef.current?.scrollTo(0, sentinelRef.current.scrollHeight);
  }, [sentinelLines]);

  const getLineColor = (type: TerminalLine['type']) => {
    switch (type) {
      case 'success': return 'text-green-400';
      case 'error': return 'text-red-400';
      case 'command': return 'text-cyan-400';
      case 'info': return 'text-purple-400';
      default: return 'text-[#cccccc]';
    }
  };

  const handleReorder = async (projectId: string, newIndex: number) => {
    // Optimistically update the UI
    setQueuedProjects(prev => {
      const project = prev.find(p => p.id === projectId);
      if (!project) return prev;
      const filtered = prev.filter(p => p.id !== projectId);
      filtered.splice(newIndex, 0, project);
      return filtered;
    });

    // Call API to persist
    try {
      await fetch('/api/midnight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reorderQueue', projectId, newIndex }),
      });
    } catch (error) {
      console.error('Failed to reorder queue:', error);
    }
  };

  const handleRemove = async (projectId: string) => {
    // Optimistically update the UI
    setQueuedProjects(prev => prev.filter(p => p.id !== projectId));

    // Call API to persist
    try {
      await fetch('/api/midnight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'removeFromQueue', projectId }),
      });
    } catch (error) {
      console.error('Failed to remove from queue:', error);
    }
  };

  // Add project to queue
  const handleAddProject = async () => {
    const name = prompt('Enter project name:');
    const path = prompt('Enter project path:');
    
    if (name && path) {
      try {
        const res = await fetch('/api/midnight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'addToQueue', name, path }),
        });
        const data = await res.json();
        
        if (data.success && data.project) {
          setQueuedProjects(prev => [...prev, data.project]);
        }
      } catch (error) {
        console.error('Failed to add to queue:', error);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#1e1e1e] flex flex-col">
      {/* Header */}
      <div className="h-12 bg-[#2b2b2b] border-b border-[#3c3c3c] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          {/* Moon icon */}
          <div className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-purple-400">
              <path
                d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="currentColor"
              />
            </svg>
            <span className="text-[14px] font-semibold text-white">Project Midnight</span>
          </div>

          {/* Current project */}
          <div className="flex items-center gap-2 px-3 py-1 bg-[#333] rounded">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-[12px] text-[#cccccc]">{currentProject}</span>
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-2">
            <div className="w-32 h-2 bg-[#333] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[11px] text-[#808080]">{Math.round(progress)}%</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Confidence meter */}
          <ConfidenceMeter score={confidenceScore} status={confidenceStatus} />

          {/* Pause/Resume button */}
          <button
            onClick={handlePauseResume}
            className={`px-3 py-1 rounded text-[11px] font-medium transition-colors ${
              isPaused 
                ? 'bg-green-600 hover:bg-green-500 text-white' 
                : 'bg-yellow-600 hover:bg-yellow-500 text-white'
            }`}
            title={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? '▶ Resume' : '⏸ Pause'}
          </button>

          {/* Stop button */}
          <button
            onClick={handleStop}
            className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-[11px] font-medium text-white transition-colors"
            title="Stop Project Midnight"
          >
            ⏹ Stop
          </button>

          {/* Close button (minimize) */}
          <button
            onClick={onClose}
            className="text-[#808080] hover:text-white transition-colors"
            title="Minimize (Midnight continues running)"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Nerd Squad + Cleanup Crew Terminal */}
        <div className="flex-1 flex flex-col border-r border-[#3c3c3c]">
          <div className="h-8 bg-[#2b2b2b] border-b border-[#3c3c3c] flex items-center px-3">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${activeSquad === 'cleanup_crew' ? 'bg-yellow-500' : 'bg-green-500'}`} />
              <span className="text-[11px] text-[#cccccc] font-medium">
                {activeSquad === 'cleanup_crew' ? 'CLEANUP CREW' : 'NERD SQUAD'}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#333] text-cyan-400">{activeRole}</span>
              {escalationLevel > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/50 text-red-400">ESC:{escalationLevel}</span>
              )}
            </div>
            <span className="ml-auto text-[10px] text-[#606060]">
              {protocolCost > 0 ? `$${protocolCost.toFixed(4)}` : 'Protocol Team'}
            </span>
          </div>
          <div
            ref={actorRef}
            className="flex-1 overflow-y-auto p-3 font-mono text-[11px] bg-[#1a1a1a]"
          >
            {actorLines.map((line, i) => (
              <div key={i} className={`py-0.5 ${getLineColor(line.type)}`}>
                <span className="text-[#606060] mr-2">
                  {line.timestamp.toLocaleTimeString()}
                </span>
                {line.content}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Sentinel Council Terminal */}
        <div className="flex-1 flex flex-col">
          <div className="h-8 bg-[#2b2b2b] border-b border-[#3c3c3c] flex items-center px-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
              <span className="text-[11px] text-[#cccccc] font-medium">SENTINEL COUNCIL</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#333] text-purple-400">Dual-Review</span>
            </div>
            <span className="ml-auto text-[10px] text-[#606060]">Read-Only | Consensus Required</span>
          </div>
          <div
            ref={sentinelRef}
            className="flex-1 overflow-y-auto p-3 font-mono text-[11px] bg-[#1a1a1a]"
          >
            {sentinelLines.map((line, i) => (
              <div key={i} className={`py-0.5 ${getLineColor(line.type)}`}>
                <span className="text-[#606060] mr-2">
                  {line.timestamp.toLocaleTimeString()}
                </span>
                {line.content}
              </div>
            ))}
          </div>
        </div>

        {/* Queue sidebar */}
        <div className="w-64 bg-[#1e1e1e] border-l border-[#3c3c3c] flex flex-col">
          <div className="p-2 border-b border-[#3c3c3c]">
            <button
              onClick={handleAddProject}
              className="w-full px-3 py-1.5 bg-[#007acc] hover:bg-[#0098ff] text-white text-[11px] font-medium rounded flex items-center justify-center gap-1"
            >
              <span>+</span> Add Project to Queue
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            <QueueList
              projects={queuedProjects}
              onReorder={handleReorder}
              onRemove={handleRemove}
              currentProjectId={queuedProjects.find(p => p.status === 'building')?.id || '1'}
            />
          </div>

          {/* Current task info */}
          <div className="p-3 border-t border-[#3c3c3c]">
            <div className="text-[10px] text-[#606060] uppercase mb-1">Current Task</div>
            <div className="text-[12px] text-[#cccccc]">{currentTask}</div>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className={`h-6 ${isRunning ? (isPaused ? 'bg-yellow-600' : 'bg-purple-600') : 'bg-gray-600'} flex items-center justify-between px-3 text-[11px] text-white shrink-0`}>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            {isRunning ? (
              isPaused ? (
                <>
                  <span className="w-1.5 h-1.5 bg-yellow-300 rounded-full" />
                  Project Midnight Paused
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  Project Midnight Active
                </>
              )
            ) : (
              <>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                Project Midnight Stopped
              </>
            )}
          </span>
          <span>Trust Level: {trustLevel} ({trustLevel === 3 ? 'Full Autonomy' : trustLevel === 2 ? 'Supervised' : 'Manual Approve'})</span>
        </div>
        <div className="flex items-center gap-3">
          <span>Tasks: {tasksCompleted}/{totalTasks} completed</span>
          <span>Uptime: {formatUptime(uptime)}</span>
        </div>
      </div>
    </div>
  );
}

export default FactoryView;
