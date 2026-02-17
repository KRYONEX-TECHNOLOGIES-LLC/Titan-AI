// AI Panel Component
// packages/ui/components/sidebar/src/ai-panel.tsx

import React, { useState } from 'react';
import { clsx } from 'clsx';

export interface AIPanelProps {
  agents: AgentInfo[];
  activeAgentId?: string;
  currentTask?: TaskInfo;
  recentTasks?: TaskInfo[];
  onAgentSelect?: (agentId: string) => void;
  onTaskAction?: (taskId: string, action: 'pause' | 'resume' | 'cancel') => void;
  onNewTask?: () => void;
  className?: string;
}

export interface AgentInfo {
  id: string;
  name: string;
  type: 'coordinator' | 'security' | 'refactor' | 'test' | 'docs' | 'review';
  status: 'idle' | 'working' | 'paused' | 'error';
  currentTask?: string;
}

export interface TaskInfo {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  progress?: number;
  agentId: string;
  startTime?: Date;
  duration?: number;
  subtasks?: SubtaskInfo[];
}

export interface SubtaskInfo {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export function AIPanel({
  agents,
  activeAgentId,
  currentTask,
  recentTasks = [],
  onAgentSelect,
  onTaskAction,
  onNewTask,
  className,
}: AIPanelProps) {
  const [selectedSection, setSelectedSection] = useState<'agents' | 'tasks'>('agents');

  return (
    <div
      className={clsx(
        'titan-ai-panel',
        'flex flex-col h-full',
        className
      )}
    >
      {/* Header tabs */}
      <div className="flex border-b border-ai-panel-border">
        <button
          className={clsx(
            'flex-1 px-3 py-2 text-xs font-medium',
            selectedSection === 'agents'
              ? 'bg-ai-tab-active text-ai-tab-active-foreground border-b-2 border-ai-tab-active-border'
              : 'text-ai-tab-foreground hover:bg-ai-tab-hover'
          )}
          onClick={() => setSelectedSection('agents')}
        >
          Agents
        </button>
        <button
          className={clsx(
            'flex-1 px-3 py-2 text-xs font-medium',
            selectedSection === 'tasks'
              ? 'bg-ai-tab-active text-ai-tab-active-foreground border-b-2 border-ai-tab-active-border'
              : 'text-ai-tab-foreground hover:bg-ai-tab-hover'
          )}
          onClick={() => setSelectedSection('tasks')}
        >
          Tasks
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {selectedSection === 'agents' && (
          <AgentList
            agents={agents}
            activeAgentId={activeAgentId}
            onSelect={onAgentSelect}
          />
        )}

        {selectedSection === 'tasks' && (
          <TaskList
            currentTask={currentTask}
            recentTasks={recentTasks}
            onAction={onTaskAction}
            onNewTask={onNewTask}
          />
        )}
      </div>
    </div>
  );
}

interface AgentListProps {
  agents: AgentInfo[];
  activeAgentId?: string;
  onSelect?: (agentId: string) => void;
}

function AgentList({ agents, activeAgentId, onSelect }: AgentListProps) {
  const statusColors: Record<AgentInfo['status'], string> = {
    idle: 'bg-agent-idle',
    working: 'bg-agent-working animate-pulse',
    paused: 'bg-agent-paused',
    error: 'bg-agent-error',
  };

  const typeIcons: Record<AgentInfo['type'], React.ReactNode> = {
    coordinator: <CoordinatorIcon />,
    security: <SecurityIcon />,
    refactor: <RefactorIcon />,
    test: <TestIcon />,
    docs: <DocsIcon />,
    review: <ReviewIcon />,
  };

  return (
    <div className="titan-agent-list p-2 space-y-1">
      {agents.map((agent) => (
        <button
          key={agent.id}
          className={clsx(
            'w-full flex items-center gap-2 p-2 rounded-md text-left',
            'hover:bg-agent-hover transition-colors',
            activeAgentId === agent.id && 'bg-agent-selected'
          )}
          onClick={() => onSelect?.(agent.id)}
        >
          <span className="w-5 h-5 text-agent-icon">
            {typeIcons[agent.type]}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{agent.name}</span>
              <span className={clsx('w-2 h-2 rounded-full', statusColors[agent.status])} />
            </div>
            {agent.currentTask && (
              <p className="text-xs text-agent-task truncate mt-0.5">
                {agent.currentTask}
              </p>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

interface TaskListProps {
  currentTask?: TaskInfo;
  recentTasks: TaskInfo[];
  onAction?: (taskId: string, action: 'pause' | 'resume' | 'cancel') => void;
  onNewTask?: () => void;
}

function TaskList({ currentTask, recentTasks, onAction, onNewTask }: TaskListProps) {
  return (
    <div className="titan-task-list">
      {/* New task button */}
      <div className="p-2 border-b border-ai-panel-border">
        <button
          className={clsx(
            'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md',
            'bg-task-new text-task-new-foreground',
            'hover:bg-task-new-hover transition-colors'
          )}
          onClick={onNewTask}
        >
          <PlusIcon />
          <span className="text-sm font-medium">New Task</span>
        </button>
      </div>

      {/* Current task */}
      {currentTask && (
        <div className="p-2 border-b border-ai-panel-border">
          <h3 className="text-xs font-medium uppercase tracking-wider text-task-header mb-2">
            Current Task
          </h3>
          <TaskItem task={currentTask} onAction={onAction} isCurrent />
        </div>
      )}

      {/* Recent tasks */}
      {recentTasks.length > 0 && (
        <div className="p-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-task-header mb-2">
            Recent Tasks
          </h3>
          <div className="space-y-1">
            {recentTasks.map((task) => (
              <TaskItem key={task.id} task={task} onAction={onAction} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface TaskItemProps {
  task: TaskInfo;
  isCurrent?: boolean;
  onAction?: (taskId: string, action: 'pause' | 'resume' | 'cancel') => void;
}

function TaskItem({ task, isCurrent, onAction }: TaskItemProps) {
  const statusColors: Record<TaskInfo['status'], string> = {
    pending: 'text-task-pending',
    running: 'text-task-running',
    completed: 'text-task-completed',
    failed: 'text-task-failed',
    paused: 'text-task-paused',
  };

  return (
    <div
      className={clsx(
        'titan-task-item p-2 rounded-md',
        'bg-task-background hover:bg-task-hover',
        isCurrent && 'ring-1 ring-task-current-ring'
      )}
    >
      <div className="flex items-start gap-2">
        <span className={clsx('mt-0.5', statusColors[task.status])}>
          <TaskStatusIcon status={task.status} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{task.title}</p>
          {task.progress !== undefined && task.status === 'running' && (
            <div className="mt-1.5">
              <div className="h-1 bg-task-progress-track rounded-full overflow-hidden">
                <div
                  className="h-full bg-task-progress-fill transition-all"
                  style={{ width: `${task.progress}%` }}
                />
              </div>
              <p className="text-xs text-task-progress-text mt-0.5">{task.progress}%</p>
            </div>
          )}
          {task.subtasks && task.subtasks.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {task.subtasks.slice(0, 3).map((subtask) => (
                <div key={subtask.id} className="flex items-center gap-1.5 text-xs text-task-subtask">
                  <SubtaskStatusIcon status={subtask.status} />
                  <span className="truncate">{subtask.title}</span>
                </div>
              ))}
              {task.subtasks.length > 3 && (
                <p className="text-xs text-task-subtask-more">
                  +{task.subtasks.length - 3} more
                </p>
              )}
            </div>
          )}
        </div>
        {isCurrent && task.status === 'running' && (
          <div className="flex gap-1">
            <button
              className="p-1 rounded hover:bg-task-action-hover"
              onClick={() => onAction?.(task.id, 'pause')}
              title="Pause"
            >
              <PauseIcon />
            </button>
            <button
              className="p-1 rounded hover:bg-task-action-hover"
              onClick={() => onAction?.(task.id, 'cancel')}
              title="Cancel"
            >
              <CancelIcon />
            </button>
          </div>
        )}
        {isCurrent && task.status === 'paused' && (
          <button
            className="p-1 rounded hover:bg-task-action-hover"
            onClick={() => onAction?.(task.id, 'resume')}
            title="Resume"
          >
            <PlayIcon />
          </button>
        )}
      </div>
    </div>
  );
}

function TaskStatusIcon({ status }: { status: TaskInfo['status'] }) {
  switch (status) {
    case 'pending':
      return <CircleIcon />;
    case 'running':
      return <SpinnerIcon />;
    case 'completed':
      return <CheckIcon />;
    case 'failed':
      return <ErrorIcon />;
    case 'paused':
      return <PauseIcon />;
    default:
      return <CircleIcon />;
  }
}

function SubtaskStatusIcon({ status }: { status: SubtaskInfo['status'] }) {
  const className = 'w-3 h-3';
  switch (status) {
    case 'pending':
      return <span className={clsx(className, 'text-subtask-pending')}>○</span>;
    case 'running':
      return <span className={clsx(className, 'text-subtask-running animate-pulse')}>◐</span>;
    case 'completed':
      return <span className={clsx(className, 'text-subtask-completed')}>●</span>;
    case 'failed':
      return <span className={clsx(className, 'text-subtask-failed')}>✕</span>;
    default:
      return <span className={className}>○</span>;
  }
}

// Icons
function CoordinatorIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
    </svg>
  );
}

function SecurityIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  );
}

function RefactorIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  );
}

function TestIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
      <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9.707 5.707a1 1 0 00-1.414-1.414L9 12.586l-1.293-1.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  );
}

function DocsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
    </svg>
  );
}

function ReviewIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
      <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

function CircleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="5" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 3a5 5 0 105 5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 15A7 7 0 118 1a7 7 0 010 14zm0-9.5a.75.75 0 00-.75.75v3.5a.75.75 0 001.5 0v-3.5A.75.75 0 008 5.5zm0 7a1 1 0 100-2 1 1 0 000 2z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
      <path d="M5.5 3.5A1.5 1.5 0 017 5v6a1.5 1.5 0 01-3 0V5a1.5 1.5 0 011.5-1.5zm5 0A1.5 1.5 0 0112 5v6a1.5 1.5 0 01-3 0V5a1.5 1.5 0 011.5-1.5z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 2l10 6-10 6V2z" />
    </svg>
  );
}

function CancelIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4.28 3.22a.75.75 0 00-1.06 1.06L6.94 8l-3.72 3.72a.75.75 0 101.06 1.06L8 9.06l3.72 3.72a.75.75 0 101.06-1.06L9.06 8l3.72-3.72a.75.75 0 00-1.06-1.06L8 6.94 4.28 3.22z" />
    </svg>
  );
}
