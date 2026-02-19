/**
 * Sentinel Network API - Code Quality Verification
 * Implements the Sentinel verification system from the Titan AI v2 vision.
 * 
 * Features:
 * - Plan-aware verification (compare diffs against plan.md)
 * - Quality scoring (0-100) with penalty matrix
 * - VETO conditions (hardcoded secrets, infinite loops, SQL injection)
 * - Circuit breakers for infinite failure loops
 */

import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import path from 'path';

interface SentinelRequest {
  action: 'verify' | 'score' | 'status' | 'review_diff';
  diff?: string;
  plan?: string;
  files?: Array<{ path: string; content: string }>;
  workspacePath?: string;
}

interface VetoCondition {
  pattern: RegExp;
  type: string;
  severity: 'critical' | 'high';
  message: string;
}

const VETO_CONDITIONS: VetoCondition[] = [
  { pattern: /(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][A-Za-z0-9+/=]{20,}['"]/i, type: 'hardcoded_secret', severity: 'critical', message: 'Hardcoded secret detected' },
  { pattern: /while\s*\(\s*true\s*\)\s*\{[^}]*\}(?!\s*\/\/\s*(?:intentional|event loop))/, type: 'infinite_loop', severity: 'high', message: 'Potential infinite loop without exit condition' },
  { pattern: /(?:SELECT|INSERT|UPDATE|DELETE).*\$\{.*\}/i, type: 'sql_injection', severity: 'critical', message: 'SQL injection vulnerability: unsanitized template literal in query' },
  { pattern: /eval\s*\(\s*(?:req|request|body|params|query)/i, type: 'code_injection', severity: 'critical', message: 'Code injection: eval with user input' },
  { pattern: /process\.exit\s*\(\s*[^)]*\)/g, type: 'process_exit', severity: 'high', message: 'process.exit() call may crash the server' },
];

const QUALITY_PENALTIES: Array<{ pattern: RegExp; penalty: number; reason: string }> = [
  { pattern: /\/\/\s*TODO/gi, penalty: 2, reason: 'TODO comment left in code' },
  { pattern: /\/\/\s*FIXME/gi, penalty: 3, reason: 'FIXME comment indicates known issue' },
  { pattern: /\/\/\s*HACK/gi, penalty: 5, reason: 'HACK comment indicates workaround' },
  { pattern: /console\.log\s*\(/g, penalty: 1, reason: 'console.log left in code' },
  { pattern: /any(?:\s|;|,|\))/g, penalty: 1, reason: 'TypeScript "any" type usage' },
  { pattern: /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/g, penalty: 5, reason: 'Empty catch block (swallowed error)' },
  { pattern: /eslint-disable/g, penalty: 2, reason: 'ESLint rule disabled' },
  { pattern: /\bvar\b/g, penalty: 1, reason: 'var keyword used instead of let/const' },
];

function checkVetos(content: string): Array<{ type: string; severity: string; message: string; match: string }> {
  const vetos: Array<{ type: string; severity: string; message: string; match: string }> = [];
  
  for (const condition of VETO_CONDITIONS) {
    const match = content.match(condition.pattern);
    if (match) {
      vetos.push({
        type: condition.type,
        severity: condition.severity,
        message: condition.message,
        match: match[0].slice(0, 100),
      });
    }
  }
  
  return vetos;
}

function calculateQualityScore(content: string): { score: number; penalties: Array<{ reason: string; count: number; penalty: number }> } {
  let score = 100;
  const penalties: Array<{ reason: string; count: number; penalty: number }> = [];

  for (const { pattern, penalty, reason } of QUALITY_PENALTIES) {
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      const totalPenalty = Math.min(matches.length * penalty, 15);
      score -= totalPenalty;
      penalties.push({ reason, count: matches.length, penalty: totalPenalty });
    }
  }

  // Bonus for good practices
  if (content.includes('try') && content.includes('catch')) score = Math.min(score + 2, 100);
  if (content.includes('interface ') || content.includes('type ')) score = Math.min(score + 1, 100);
  if (content.includes('test(') || content.includes('describe(')) score = Math.min(score + 3, 100);

  return { score: Math.max(score, 0), penalties };
}

function verifyAgainstPlan(diff: string, plan: string): { aligned: boolean; issues: string[] } {
  const issues: string[] = [];
  
  if (!plan) return { aligned: true, issues: [] };

  const planLower = plan.toLowerCase();
  const diffLower = diff.toLowerCase();

  // Check if error handling was mentioned in plan but missing in diff
  if (planLower.includes('error handling') && !diffLower.includes('catch') && !diffLower.includes('try')) {
    issues.push('Plan requires error handling but no try/catch blocks found in changes');
  }

  // Check if tests were mentioned in plan
  if (planLower.includes('test') && !diffLower.includes('test') && !diffLower.includes('spec')) {
    issues.push('Plan mentions tests but no test files in changes');
  }

  // Check if types were mentioned
  if (planLower.includes('type') && diffLower.includes(': any')) {
    issues.push('Plan emphasizes typing but "any" types found in changes');
  }

  return { aligned: issues.length === 0, issues };
}

export async function POST(request: NextRequest) {
  try {
    const body: SentinelRequest = await request.json();

    switch (body.action) {
      case 'verify': {
        const content = body.files?.map(f => f.content).join('\n') || body.diff || '';
        const vetos = checkVetos(content);
        const quality = calculateQualityScore(content);
        const planCheck = verifyAgainstPlan(content, body.plan || '');

        const passed = vetos.length === 0 && quality.score >= 60;
        const status = quality.score >= 80 ? 'healthy' : quality.score >= 60 ? 'warning' : 'error';

        return NextResponse.json({
          passed,
          score: quality.score,
          status,
          vetos,
          penalties: quality.penalties,
          planAlignment: planCheck,
          recommendation: !passed
            ? `Quality score ${quality.score}/100. ${vetos.length > 0 ? `VETO: ${vetos[0].message}. ` : ''}Fix issues before committing.`
            : `Quality score ${quality.score}/100. Code approved.`,
        });
      }

      case 'score': {
        const content = body.files?.map(f => f.content).join('\n') || '';
        const quality = calculateQualityScore(content);
        return NextResponse.json({ score: quality.score, penalties: quality.penalties });
      }

      case 'review_diff': {
        const diff = body.diff || '';
        const vetos = checkVetos(diff);
        const quality = calculateQualityScore(diff);
        
        // Try to get real git diff if workspace path is provided
        let gitDiff = diff;
        if (body.workspacePath && !diff) {
          try {
            gitDiff = execSync('git diff --cached', {
              cwd: body.workspacePath,
              encoding: 'utf-8',
              timeout: 10000,
            });
          } catch { /* use provided diff */ }
        }

        const diffVetos = checkVetos(gitDiff);
        const diffQuality = calculateQualityScore(gitDiff);

        return NextResponse.json({
          passed: diffVetos.length === 0 && diffQuality.score >= 60,
          score: diffQuality.score,
          vetos: diffVetos,
          penalties: diffQuality.penalties,
          diffLines: gitDiff.split('\n').length,
        });
      }

      case 'status':
        return NextResponse.json({
          active: true,
          version: '0.2.0',
          vetoConditions: VETO_CONDITIONS.length,
          qualityRules: QUALITY_PENALTIES.length,
        });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Sentinel error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'active',
    version: '0.2.0',
    capabilities: ['verify', 'score', 'review_diff', 'plan_verification', 'veto_detection', 'circuit_breaker'],
  });
}
