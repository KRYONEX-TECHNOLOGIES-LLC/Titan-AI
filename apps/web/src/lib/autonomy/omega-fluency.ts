import type { RiskLevel } from '@/lib/omega/omega-model';

export interface ProjectContext {
  workspacePath?: string;
  openTabs?: string[];
  fileTree?: string;
  recentlyEditedFiles?: Array<{ file: string; timestamp: number }>;
}

export interface ConceptualWorkOrder {
  taskDescription: string;
  inputContract: { requiredFiles: string[]; requiredContext: string[] };
  outputContract: { expectedArtifacts: string[]; expectedFiles: string[]; mustNotModify?: string[] };
  acceptanceCriteria: string[];
  predictedRisk: RiskLevel;
}

export interface FileChange {
  filePath: string;
  summary: string;
  risk?: RiskLevel;
}

export interface ConceptualEvidence {
  modifications: FileChange[];
  assumptions: string[];
  edgeCasesHandled: string[];
  selfAssessment: string;
}

const HIGH_RISK_HINTS = [/auth/i, /security/i, /payment/i, /migration/i, /db/i, /schema/i, /config/i];
const MEDIUM_RISK_HINTS = [/api/i, /route/i, /state/i, /store/i, /hook/i, /build/i];

export class OmegaFluency {
  decomposeToWorkOrders(goal: string, context: ProjectContext): ConceptualWorkOrder[] {
    const openTabs = context.openTabs || [];
    const primaryFiles = openTabs.slice(0, 4);
    const chunks = goal
      .split(/[.]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const tasks = chunks.length ? chunks : [goal];

    return tasks.map((task, idx) => ({
      taskDescription: task,
      inputContract: {
        requiredFiles: primaryFiles,
        requiredContext: [context.workspacePath || 'workspace', 'current user objective'],
      },
      outputContract: {
        expectedArtifacts: [`change-set-${idx + 1}`],
        expectedFiles: primaryFiles,
      },
      acceptanceCriteria: [
        'Implementation matches requested intent',
        'No regressions in touched flows',
        'Build/lint checks pass for affected scope',
      ],
      predictedRisk: this.assessRisk(primaryFiles[0] || task, Math.max(1, task.length), context),
    }));
  }

  formulateEvidencePackage(changes: FileChange[], assumptions: string[], edgeCases: string[]): ConceptualEvidence {
    return {
      modifications: changes,
      assumptions: assumptions.length ? assumptions : ['No hidden side effects outside touched files.'],
      edgeCasesHandled: edgeCases.length ? edgeCases : ['Empty inputs', 'Invalid state transitions', 'Unexpected command output'],
      selfAssessment: `Prepared evidence package for ${changes.length} file modification(s).`,
    };
  }

  buildRejectionContext(
    error: { filePath?: string | null; line?: number | null; message?: string; errorType?: string | null },
    fixHistory: Array<{ attemptNumber: number; hypothesis: string }>,
  ): string {
    const attempts = fixHistory.map((f) => `#${f.attemptNumber}: ${f.hypothesis}`).join(' | ');
    return [
      'REJECTION MEMO',
      `Root cause: ${error.errorType || 'Error'} - ${error.message || 'Unknown failure'}`,
      `Location: ${error.filePath || 'unknown'}:${error.line || '?'}`,
      `Prior attempts: ${attempts || 'none'}`,
      'Directive: adjust approach, re-read target region, avoid repeating failed fix pattern.',
    ].join('\n');
  }

  assessRisk(filePath: string, changeSize: number, _context: ProjectContext): RiskLevel {
    if (HIGH_RISK_HINTS.some((r) => r.test(filePath)) || changeSize > 1200) return 'high';
    if (MEDIUM_RISK_HINTS.some((r) => r.test(filePath)) || changeSize > 300) return 'medium';
    return 'low';
  }
}
