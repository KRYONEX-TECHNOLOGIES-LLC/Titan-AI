/**
 * Spec-Driven Development Pipeline API
 * Implements: idea.md -> contract -> DoD -> progress tracking
 * 
 * The AI cannot begin coding until the Sentinel confirms the spec
 * has defined "Definition of Done" (DoD) criteria.
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface SpecRequest {
  action: 'parse' | 'validate' | 'progress' | 'create' | 'status';
  content?: string;
  path?: string;
  task?: { id: string; status: 'pending' | 'in_progress' | 'completed' | 'failed'; notes?: string };
}

interface SpecContract {
  title: string;
  description: string;
  requirements: Array<{ id: string; text: string; priority: 'must' | 'should' | 'could' }>;
  dod: Array<{ id: string; criteria: string; met: boolean }>;
  techStack: string[];
  constraints: string[];
}

interface ProgressEntry {
  taskId: string;
  requirementId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  timestamp: number;
  notes?: string;
}

// In-memory progress log (production: SQLite)
const progressLog: ProgressEntry[] = [];
const specs: Map<string, SpecContract> = new Map();

function parseIdeaMd(content: string): SpecContract {
  const lines = content.split('\n');
  const contract: SpecContract = {
    title: '',
    description: '',
    requirements: [],
    dod: [],
    techStack: [],
    constraints: [],
  };

  let section = '';

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('# ')) {
      contract.title = trimmed.slice(2).trim();
      continue;
    }

    if (trimmed.startsWith('## ')) {
      section = trimmed.slice(3).toLowerCase();
      continue;
    }

    if (!trimmed || trimmed.startsWith('---')) continue;

    if (section.includes('description') || section.includes('overview') || section.includes('summary')) {
      contract.description += (contract.description ? ' ' : '') + trimmed;
    } else if (section.includes('requirement') || section.includes('feature') || section.includes('must have')) {
      const match = trimmed.match(/^[-*]\s*(.*)/);
      if (match) {
        const priority = trimmed.toLowerCase().includes('must') ? 'must' as const
          : trimmed.toLowerCase().includes('should') ? 'should' as const : 'could' as const;
        contract.requirements.push({
          id: `req-${contract.requirements.length + 1}`,
          text: match[1],
          priority,
        });
      }
    } else if (section.includes('done') || section.includes('dod') || section.includes('acceptance') || section.includes('criteria')) {
      const match = trimmed.match(/^[-*]\s*(.*)/);
      if (match) {
        contract.dod.push({
          id: `dod-${contract.dod.length + 1}`,
          criteria: match[1],
          met: false,
        });
      }
    } else if (section.includes('tech') || section.includes('stack')) {
      const match = trimmed.match(/^[-*]\s*(.*)/);
      if (match) contract.techStack.push(match[1]);
    } else if (section.includes('constraint') || section.includes('limitation')) {
      const match = trimmed.match(/^[-*]\s*(.*)/);
      if (match) contract.constraints.push(match[1]);
    }
  }

  // Auto-generate DoD if missing
  if (contract.dod.length === 0) {
    contract.dod = [
      { id: 'dod-auto-1', criteria: 'All requirements implemented', met: false },
      { id: 'dod-auto-2', criteria: 'No build errors', met: false },
      { id: 'dod-auto-3', criteria: 'Zero lint warnings', met: false },
      { id: 'dod-auto-4', criteria: 'Basic tests passing', met: false },
    ];
  }

  return contract;
}

function validateSpec(contract: SpecContract): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!contract.title) issues.push('Missing project title');
  if (!contract.description) issues.push('Missing project description');
  if (contract.requirements.length === 0) issues.push('No requirements defined');
  if (contract.dod.length === 0) issues.push('No Definition of Done criteria defined');
  if (contract.requirements.filter(r => r.priority === 'must').length === 0) {
    issues.push('No "must-have" requirements defined');
  }

  return { valid: issues.length === 0, issues };
}

export async function POST(request: NextRequest) {
  try {
    const body: SpecRequest = await request.json();

    switch (body.action) {
      case 'parse': {
        if (!body.content) return NextResponse.json({ error: 'content is required' }, { status: 400 });
        const contract = parseIdeaMd(body.content);
        const validation = validateSpec(contract);
        const specId = `spec-${Date.now()}`;
        specs.set(specId, contract);

        return NextResponse.json({
          specId,
          contract,
          validation,
          readyToBuild: validation.valid,
          message: validation.valid
            ? 'Spec validated. Ready to begin coding.'
            : `Spec incomplete: ${validation.issues.join(', ')}. Cannot begin coding until resolved.`,
        });
      }

      case 'validate': {
        const specId = body.path || Array.from(specs.keys()).pop();
        if (!specId || !specs.has(specId)) {
          return NextResponse.json({ error: 'Spec not found' }, { status: 404 });
        }
        const contract = specs.get(specId)!;
        const validation = validateSpec(contract);
        return NextResponse.json({ specId, validation, readyToBuild: validation.valid });
      }

      case 'progress': {
        if (body.task) {
          progressLog.push({
            taskId: body.task.id,
            requirementId: body.task.id,
            status: body.task.status,
            timestamp: Date.now(),
            notes: body.task.notes,
          });
        }

        const specId = body.path || Array.from(specs.keys()).pop();
        const contract = specId ? specs.get(specId) : null;

        const completed = progressLog.filter(p => p.status === 'completed').length;
        const total = contract?.requirements.length || progressLog.length;

        return NextResponse.json({
          log: progressLog.slice(-50),
          summary: {
            total,
            completed,
            inProgress: progressLog.filter(p => p.status === 'in_progress').length,
            failed: progressLog.filter(p => p.status === 'failed').length,
            percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0,
          },
        });
      }

      case 'create': {
        const template = `# ${body.content || 'Project Name'}

## Description
Describe your project here.

## Requirements
- Must: Core feature 1
- Must: Core feature 2
- Should: Nice-to-have feature
- Could: Optional enhancement

## Tech Stack
- Next.js
- TypeScript
- Tailwind CSS

## Definition of Done
- All must-have requirements implemented
- No build errors
- Zero lint warnings
- Basic tests passing
- README with setup instructions

## Constraints
- Must work in modern browsers
- Must be responsive
`;
        return NextResponse.json({ template, message: 'Save this as idea.md in your project root' });
      }

      case 'status':
        return NextResponse.json({
          specs: Array.from(specs.entries()).map(([id, spec]) => ({
            id,
            title: spec.title,
            requirements: spec.requirements.length,
            dod: spec.dod.length,
          })),
          progressEntries: progressLog.length,
        });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Spec pipeline error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'active',
    specs: specs.size,
    progressEntries: progressLog.length,
    description: 'Spec-driven development pipeline. POST with action: parse, validate, progress, create, status',
  });
}
