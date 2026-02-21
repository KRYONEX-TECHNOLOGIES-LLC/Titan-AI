import type { SupremeConfig } from './supreme-model';

export interface StallReport {
  totalSteps: number;
  warningThreshold: number;
  hardLimit: number;
  noProgressSteps: number;
  repeatedOutputCount: number;
  isStalled: boolean;
  shouldHalt: boolean;
  reason?: string;
}

interface StepEntry {
  stepType: string;
  progress: boolean;
  timestamp: number;
  signature?: string;
}

export function createStallDetector(config: SupremeConfig) {
  const steps: StepEntry[] = [];
  let noProgressSteps = 0;
  let repeatedOutputCount = 0;
  let lastSignature = '';
  const startedAt = Date.now();

  function recordStep(stepType: string, progress: boolean, signature?: string) {
    steps.push({ stepType, progress, timestamp: Date.now(), signature });
    if (progress) {
      noProgressSteps = 0;
    } else {
      noProgressSteps += 1;
    }

    if (signature && signature === lastSignature) {
      repeatedOutputCount += 1;
    } else {
      repeatedOutputCount = 0;
      lastSignature = signature || '';
    }
  }

  function isStalled() {
    if (noProgressSteps >= 5) return true;
    if (repeatedOutputCount >= 3) return true;
    if (Date.now() - startedAt > 30 * 60 * 1000) return true;
    return false;
  }

  function shouldHalt() {
    if (steps.length >= config.stepBudget.maxTotalSteps) return true;
    if (isStalled()) return true;
    return false;
  }

  function getReport(): StallReport {
    const stalled = isStalled();
    const halt = shouldHalt();
    let reason: string | undefined;
    if (steps.length >= config.stepBudget.maxTotalSteps) {
      reason = 'Step budget exhausted';
    } else if (repeatedOutputCount >= 3) {
      reason = 'Repeated output spiral detected';
    } else if (noProgressSteps >= 5) {
      reason = 'No progress for 5 consecutive steps';
    } else if (Date.now() - startedAt > 30 * 60 * 1000) {
      reason = 'Orchestration timeout exceeded';
    }

    return {
      totalSteps: steps.length,
      warningThreshold: config.stepBudget.warningAt,
      hardLimit: config.stepBudget.maxTotalSteps,
      noProgressSteps,
      repeatedOutputCount,
      isStalled: stalled,
      shouldHalt: halt,
      reason,
    };
  }

  function isNearLimit() {
    return steps.length >= config.stepBudget.warningAt;
  }

  return {
    recordStep,
    isStalled,
    shouldHalt,
    getReport,
    isNearLimit,
  };
}
