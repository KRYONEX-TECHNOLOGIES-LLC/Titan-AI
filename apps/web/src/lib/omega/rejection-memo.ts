import type { FailedCheck, RejectionMemo } from './omega-model';

interface StaticAnalysisResult {
  lintPassed: boolean;
  typeCheckPassed: boolean;
  complexityScore: number;
  securityIssues: string[];
}

interface DynamicAnalysisResult {
  testsGenerated: number;
  testsPassed: number;
  testsFailed: number;
  failedTestDetails?: string[];
}

interface SemanticResult {
  intentMet: boolean;
  rationale: string;
}

function toFailedChecks(
  staticResult: StaticAnalysisResult,
  dynamicResult: DynamicAnalysisResult,
  semanticResult: SemanticResult,
): FailedCheck[] {
  const checks: FailedCheck[] = [];
  if (!staticResult.lintPassed) {
    checks.push({
      category: 'static',
      checkName: 'lint',
      expected: 'No lint errors',
      actual: 'Lint failed',
      evidence: 'Lint command returned non-zero status',
    });
  }
  if (!staticResult.typeCheckPassed) {
    checks.push({
      category: 'static',
      checkName: 'type-check',
      expected: 'No type errors',
      actual: 'Type check failed',
      evidence: 'Type checker returned non-zero status',
    });
  }
  for (const issue of staticResult.securityIssues) {
    checks.push({
      category: 'static',
      checkName: 'security-scan',
      expected: 'No security issues',
      actual: issue,
      evidence: issue,
    });
  }
  if (dynamicResult.testsFailed > 0) {
    checks.push({
      category: 'dynamic',
      checkName: 'generated-tests',
      expected: `${dynamicResult.testsGenerated} passing tests`,
      actual: `${dynamicResult.testsFailed} failed tests`,
      evidence: (dynamicResult.failedTestDetails || []).join('; ') || 'Test failures detected',
    });
  }
  if (!semanticResult.intentMet) {
    checks.push({
      category: 'semantic',
      checkName: 'intent-validation',
      expected: 'Implementation fulfills task intent',
      actual: 'Intent mismatch',
      evidence: semanticResult.rationale,
    });
  }
  return checks;
}

function inferSeverity(failedChecks: FailedCheck[]): RejectionMemo['severity'] {
  if (failedChecks.some((c) => c.checkName === 'security-scan' || c.checkName === 'type-check')) return 'CRITICAL';
  if (failedChecks.some((c) => c.category === 'semantic' || c.category === 'dynamic')) return 'MAJOR';
  return 'MINOR';
}

export function buildRejectionMemo(
  workOrderId: string,
  staticResult: StaticAnalysisResult,
  dynamicResult: DynamicAnalysisResult,
  semanticResult: SemanticResult,
): RejectionMemo {
  const failedChecks = toFailedChecks(staticResult, dynamicResult, semanticResult);
  const severity = inferSeverity(failedChecks);
  const rootCause = failedChecks[0]?.actual || 'Verification failed';

  return {
    workOrderId,
    verdict: 'FAIL',
    rootCause,
    failedChecks,
    actionableRecommendation: failedChecks[0]
      ? `Address ${failedChecks[0].checkName}: ${failedChecks[0].expected}.`
      : 'Revisit implementation and align with acceptance criteria.',
    severity,
  };
}
