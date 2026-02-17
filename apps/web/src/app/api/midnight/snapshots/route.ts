/**
 * Project Midnight Snapshots API
 * /api/midnight/snapshots - State snapshot management
 */

import { NextRequest, NextResponse } from 'next/server';

// Mock snapshot data
const mockSnapshots = [
  {
    id: 'snap-1',
    projectId: 'proj-1',
    gitHash: 'abc123',
    createdAt: Date.now() - 3600000,
    agentState: {
      currentTaskId: 'task-1',
      taskProgress: 75,
      iterationCount: 5,
    },
  },
  {
    id: 'snap-2',
    projectId: 'proj-1',
    gitHash: 'def456',
    createdAt: Date.now() - 1800000,
    agentState: {
      currentTaskId: 'task-2',
      taskProgress: 30,
      iterationCount: 2,
    },
  },
  {
    id: 'snap-3',
    projectId: 'proj-1',
    gitHash: 'ghi789',
    createdAt: Date.now() - 300000,
    agentState: {
      currentTaskId: 'task-2',
      taskProgress: 100,
      iterationCount: 4,
    },
  },
];

/**
 * GET /api/midnight/snapshots - List snapshots
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');

  let snapshots = mockSnapshots;
  if (projectId) {
    snapshots = snapshots.filter(s => s.projectId === projectId);
  }

  return NextResponse.json({
    snapshots,
    total: snapshots.length,
  });
}

/**
 * POST /api/midnight/snapshots - Create a manual snapshot
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { projectId } = body;

  if (!projectId) {
    return NextResponse.json(
      { error: 'projectId is required' },
      { status: 400 }
    );
  }

  const newSnapshot = {
    id: `snap-${Date.now()}`,
    projectId,
    gitHash: Math.random().toString(36).slice(2, 8),
    createdAt: Date.now(),
    agentState: {
      currentTaskId: 'task-current',
      taskProgress: 50,
      iterationCount: 1,
    },
  };

  mockSnapshots.push(newSnapshot);

  return NextResponse.json({
    success: true,
    snapshot: newSnapshot,
  });
}
