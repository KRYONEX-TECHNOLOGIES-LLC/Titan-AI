'use client';

import { useState, useEffect, useRef } from 'react';
import { ConfidenceMeter } from './ConfidenceMeter';
import { QueueList } from './QueueList';

interface FactoryViewProps {
  isOpen: boolean;
  onClose: () => void;
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
export function FactoryView({ isOpen, onClose }: FactoryViewProps) {
  const [actorLines, setActorLines] = useState<TerminalLine[]>([]);
  const [sentinelLines, setSentinelLines] = useState<TerminalLine[]>([]);
  const [confidenceScore, setConfidenceScore] = useState(100);
  const [confidenceStatus, setConfidenceStatus] = useState<'healthy' | 'warning' | 'error'>('healthy');
  const [currentProject, setCurrentProject] = useState<string>('Example Project');
  const [currentTask, setCurrentTask] = useState<string>('Building components...');
  const [progress, setProgress] = useState(35);
  const [queuedProjects, setQueuedProjects] = useState<Project[]>([
    { id: '1', name: 'Titan AI Core', status: 'building', priority: 1, progress: 35 },
    { id: '2', name: 'Dashboard UI', status: 'queued', priority: 2 },
    { id: '3', name: 'API Gateway', status: 'queued', priority: 3 },
  ]);

  const actorRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Fetch real logs from API
  useEffect(() => {
    if (!isOpen) return;

    // Initial demo lines
    setActorLines([
      { type: 'info', content: '🚀 Actor Agent initialized (Claude 4.6 Sonnet)', timestamp: new Date() },
      { type: 'command', content: '$ Picking task: Build authentication module', timestamp: new Date() },
    ]);

    setSentinelLines([
      { type: 'info', content: '👁 Sentinel Agent initialized (Claude 4.6 Opus - Max Effort)', timestamp: new Date() },
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
            const isSuccess = log.includes('✓') || log.includes('PASSED');
            const isError = log.includes('✗') || log.includes('FAILED') || log.includes('ERROR');
            const isCommand = log.includes('$');
            return {
              type: isSuccess ? 'success' : isError ? 'error' : isCommand ? 'command' : 'output',
              content: log.replace(/^\[.*?\]\s*/, '').replace('Actor:', ''),
              timestamp: new Date(log.match(/\[(.*?)\]/)?.[1] || Date.now()),
            };
          }));
        }

        if (logs.sentinelLogs) {
          setSentinelLines(logs.sentinelLogs.map((log: string) => {
            const isSuccess = log.includes('✓') || log.includes('PASSED') || log.includes('APPROVED');
            const isError = log.includes('✗') || log.includes('FAILED') || log.includes('VETO') || log.includes('REVERT');
            return {
              type: isSuccess ? 'success' : isError ? 'error' : 'output',
              content: log.replace(/^\[.*?\]\s*/, '').replace('Sentinel:', ''),
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
    const interval = setInterval(fetchLogs, 2000);

    return () => clearInterval(interval);
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

  const handleReorder = (projectId: string, newIndex: number) => {
    setQueuedProjects(prev => {
      const project = prev.find(p => p.id === projectId);
      if (!project) return prev;
      const filtered = prev.filter(p => p.id !== projectId);
      filtered.splice(newIndex, 0, project);
      return filtered;
    });
  };

  const handleRemove = (projectId: string) => {
    setQueuedProjects(prev => prev.filter(p => p.id !== projectId));
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

        <div className="flex items-center gap-4">
          {/* Confidence meter */}
          <ConfidenceMeter score={confidenceScore} status={confidenceStatus} />

          {/* Close button */}
          <button
            onClick={onClose}
            className="text-[#808080] hover:text-white transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Actor Terminal */}
        <div className="flex-1 flex flex-col border-r border-[#3c3c3c]">
          <div className="h-8 bg-[#2b2b2b] border-b border-[#3c3c3c] flex items-center px-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full" />
              <span className="text-[11px] text-[#cccccc] font-medium">ACTOR (Claude 4.6 Sonnet)</span>
            </div>
            <span className="ml-auto text-[10px] text-[#606060]">Read-Write-Execute</span>
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

        {/* Right: Sentinel Terminal */}
        <div className="flex-1 flex flex-col">
          <div className="h-8 bg-[#2b2b2b] border-b border-[#3c3c3c] flex items-center px-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
              <span className="text-[11px] text-[#cccccc] font-medium">SENTINEL (Claude 4.6 Opus)</span>
            </div>
            <span className="ml-auto text-[10px] text-[#606060]">Read-Only | Adaptive Thinking: MAX</span>
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
          <div className="flex-1 overflow-y-auto py-2">
            <QueueList
              projects={queuedProjects}
              onReorder={handleReorder}
              onRemove={handleRemove}
              currentProjectId="1"
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
      <div className="h-6 bg-purple-600 flex items-center justify-between px-3 text-[11px] text-white shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
            Project Midnight Active
          </span>
          <span>Trust Level: 3 (Full Autonomy)</span>
        </div>
        <div className="flex items-center gap-3">
          <span>Tasks: 3/8 completed</span>
          <span>Uptime: 2h 34m</span>
        </div>
      </div>
    </div>
  );
}

export default FactoryView;
