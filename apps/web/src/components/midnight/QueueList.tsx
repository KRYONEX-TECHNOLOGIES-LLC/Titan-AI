'use client';

import { useState } from 'react';

interface QueuedProject {
  id: string;
  name: string;
  status: string;
  priority: number;
  progress?: number;
}

interface QueueListProps {
  projects: QueuedProject[];
  onReorder: (projectId: string, newIndex: number) => void;
  onRemove: (projectId: string) => void;
  currentProjectId?: string;
}

/**
 * Project Queue List with drag-to-reorder
 */
export function QueueList({
  projects,
  onReorder,
  onRemove,
  currentProjectId,
}: QueueListProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, projectId: string) => {
    setDraggedId(projectId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, projectId: string) => {
    e.preventDefault();
    if (draggedId && draggedId !== projectId) {
      setDragOverId(projectId);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (draggedId && draggedId !== targetId) {
      const targetIndex = projects.findIndex(p => p.id === targetId);
      onReorder(draggedId, targetIndex);
    }
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'building':
        return 'text-green-400';
      case 'verifying':
        return 'text-yellow-400';
      case 'queued':
        return 'text-blue-400';
      case 'failed':
        return 'text-red-400';
      case 'completed':
        return 'text-green-500';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'building':
        return '▶';
      case 'verifying':
        return '◎';
      case 'queued':
        return '○';
      case 'failed':
        return '✕';
      case 'completed':
        return '✓';
      default:
        return '○';
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-[11px] font-semibold text-[#808080] uppercase">
          Project Queue
        </span>
        <span className="text-[10px] text-[#606060]">
          {projects.length} project{projects.length !== 1 ? 's' : ''}
        </span>
      </div>

      {projects.length === 0 ? (
        <div className="px-3 py-4 text-center text-[12px] text-[#606060]">
          No projects in queue
        </div>
      ) : (
        <div className="space-y-0.5">
          {projects.map((project, index) => (
            <div
              key={project.id}
              draggable
              onDragStart={(e) => handleDragStart(e, project.id)}
              onDragOver={(e) => handleDragOver(e, project.id)}
              onDrop={(e) => handleDrop(e, project.id)}
              onDragEnd={handleDragEnd}
              className={`
                group flex items-center gap-2 px-2 py-1.5 rounded cursor-move
                ${draggedId === project.id ? 'opacity-50' : ''}
                ${dragOverId === project.id ? 'bg-[#3c3c3c]' : ''}
                ${project.id === currentProjectId 
                  ? 'bg-[#37373d] border-l-2 border-[#007acc]' 
                  : 'hover:bg-[#2a2a2a]'}
              `}
            >
              {/* Drag handle */}
              <div className="text-[#606060] text-[10px] opacity-0 group-hover:opacity-100">
                ⋮⋮
              </div>

              {/* Status icon */}
              <span className={`text-[10px] ${getStatusColor(project.status)}`}>
                {getStatusIcon(project.status)}
              </span>

              {/* Project info */}
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-[#cccccc] truncate">
                  {project.name}
                </div>
                {project.progress !== undefined && (
                  <div className="h-1 bg-[#2d2d2d] rounded-full mt-1 overflow-hidden">
                    <div
                      className="h-full bg-[#007acc] rounded-full transition-all"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Priority badge */}
              <span className="text-[9px] text-[#606060] px-1.5 py-0.5 bg-[#2d2d2d] rounded">
                #{index + 1}
              </span>

              {/* Remove button */}
              <button
                onClick={() => onRemove(project.id)}
                className="text-[#606060] hover:text-[#f14c4c] opacity-0 group-hover:opacity-100 transition-opacity"
                title="Remove from queue"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default QueueList;
