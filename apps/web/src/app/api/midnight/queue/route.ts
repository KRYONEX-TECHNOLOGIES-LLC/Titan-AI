/**
 * Project Midnight Queue API
 * /api/midnight/queue - Queue management
 */

import { NextRequest, NextResponse } from 'next/server';

// Mock queue data
const mockQueue = [
  { id: '1', name: 'Titan AI Core', status: 'building', priority: 1, progress: 35 },
  { id: '2', name: 'Dashboard UI', status: 'queued', priority: 2 },
  { id: '3', name: 'API Gateway', status: 'queued', priority: 3 },
];

/**
 * GET /api/midnight/queue - List queued projects
 */
export async function GET() {
  return NextResponse.json({
    projects: mockQueue,
    total: mockQueue.length,
    currentProject: mockQueue.find(p => p.status === 'building') || null,
  });
}

/**
 * POST /api/midnight/queue - Add project to queue
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { projectPath, priority = 0 } = body;

  if (!projectPath) {
    return NextResponse.json(
      { error: 'projectPath is required' },
      { status: 400 }
    );
  }

  // Extract project name from path
  const name = projectPath.split(/[/\\]/).pop() || 'Unknown';

  const newProject = {
    id: `proj-${Date.now()}`,
    name,
    status: 'queued',
    priority,
    path: projectPath,
  };

  // In production, this would add to the actual queue
  mockQueue.push(newProject);

  return NextResponse.json({
    success: true,
    project: newProject,
  });
}

/**
 * DELETE /api/midnight/queue - Remove project from queue
 */
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('id');

  if (!projectId) {
    return NextResponse.json(
      { error: 'id parameter is required' },
      { status: 400 }
    );
  }

  const index = mockQueue.findIndex(p => p.id === projectId);
  if (index === -1) {
    return NextResponse.json(
      { error: 'Project not found' },
      { status: 404 }
    );
  }

  mockQueue.splice(index, 1);

  return NextResponse.json({
    success: true,
    message: `Project ${projectId} removed from queue`,
  });
}

/**
 * PATCH /api/midnight/queue - Reorder project priority
 */
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { projectId, newPriority } = body;

  if (!projectId || newPriority === undefined) {
    return NextResponse.json(
      { error: 'projectId and newPriority are required' },
      { status: 400 }
    );
  }

  const project = mockQueue.find(p => p.id === projectId);
  if (!project) {
    return NextResponse.json(
      { error: 'Project not found' },
      { status: 404 }
    );
  }

  project.priority = newPriority;

  // Re-sort by priority
  mockQueue.sort((a, b) => b.priority - a.priority);

  return NextResponse.json({
    success: true,
    project,
    queue: mockQueue,
  });
}
