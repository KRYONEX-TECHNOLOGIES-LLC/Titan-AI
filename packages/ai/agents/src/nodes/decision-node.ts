/**
 * Titan AI Agents - Decision Node
 * Pocket Flow node for deciding next actions
 */

import type { NodeContext, NodeResult, NodeType } from '../types.js';

export class DecisionNode {
  /**
   * Execute decision logic
   */
  async execute(context: NodeContext): Promise<NodeResult> {
    const { task, memory, state } = context;

    // Check if task is complete
    if (state.taskComplete) {
      return {
        success: true,
        output: { decision: 'complete' },
        shouldTerminate: true,
      };
    }

    // Check iteration count
    const iterations = (state.iterations as number) ?? 0;
    if (iterations > 10) {
      return {
        success: false,
        output: { decision: 'max_iterations' },
        shouldTerminate: true,
      };
    }

    // Analyze current state
    const analysisNeeded = !state.analysisComplete;
    const modificationNeeded = state.analysisComplete && !state.modificationComplete;
    const verificationNeeded = state.modificationComplete && !state.verificationComplete;

    // Decide next node
    let nextNode: NodeType;
    if (analysisNeeded) {
      nextNode = 'analysis';
    } else if (modificationNeeded) {
      nextNode = 'modification';
    } else if (verificationNeeded) {
      nextNode = 'verification';
    } else {
      // All steps complete
      state.taskComplete = true;
      return {
        success: true,
        output: { decision: 'complete' },
        shouldTerminate: true,
      };
    }

    // Update state
    state.iterations = iterations + 1;

    return {
      success: true,
      output: { decision: nextNode },
      nextNode,
      shouldTerminate: false,
    };
  }
}
